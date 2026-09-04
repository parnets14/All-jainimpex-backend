import { stockAdjustmentSchema } from '../models/StockAdjustment.js';
import { productSchema } from '../models/Product.js';
import { warehouseSchema } from '../models/Warehouse.js';
import StockMovementService from '../services/stockMovementService.js';
import { stockMovementSchema } from '../models/Stock.js';
import { assertPeriodOpen, handlePeriodLockError } from '../services/periodLockService.js';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';

const getModels = (dbConnection) => {
  return {
    StockAdjustment: dbConnection.models.StockAdjustment || dbConnection.model('StockAdjustment', stockAdjustmentSchema),
    Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
    Warehouse: dbConnection.models.Warehouse || dbConnection.model('Warehouse', warehouseSchema),
    StockMovement: dbConnection.models.StockMovement || dbConnection.model('StockMovement', stockMovementSchema)
  };
};

const getIdempotencyKey = (req) => {
  const value = req.get?.('Idempotency-Key')
    || req.headers?.['idempotency-key']
    || req.body?.idempotencyKey;
  if (value == null || value === '') return null;
  if (typeof value !== 'string'
      || value.length < 8
      || value.length > 100
      || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    const error = new Error('Idempotency key must be 8-100 letters, numbers, dots, colons, underscores, or hyphens');
    error.statusCode = 400;
    error.code = 'INVALID_IDEMPOTENCY_KEY';
    throw error;
  }
  return value;
};

const createAdjustmentFingerprint = (req, idempotencyKey) => createHash('sha256')
  .update(JSON.stringify({
    warehouseId: req.body.warehouseId,
    adjustmentType: req.body.adjustmentType,
    reason: req.body.reason,
    remarks: req.body.remarks || '',
    createdBy: req.body.createdBy || req.user?._id,
    items: (req.body.items || []).map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice || 0),
      remarks: item.remarks || ''
    })),
    idempotencyKey
  }))
  .digest('hex');

// Create Stock Adjustment
export const createStockAdjustment = async (req, res) => {
  // Start MongoDB session for transaction
  const session = await req.dbConnection.startSession();
  let stockLease = null;
  let idempotencyKey = null;
  let idempotencyFingerprint = null;

  try {
    idempotencyKey = getIdempotencyKey(req);
    idempotencyFingerprint = idempotencyKey
      ? createAdjustmentFingerprint(req, idempotencyKey)
      : null;
    const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
    const leaseKeys = req.body.warehouseId
      ? requestedItems
        .filter((item) => item?.productId)
        .map((item) => StockMovementService.stockKey(
          item.productId,
          req.body.warehouseId
        ))
      : [];
    if (idempotencyKey) leaseKeys.push(`ADJUSTMENT_REQUEST:${idempotencyKey}`);
    if (leaseKeys.length > 0) {
      stockLease = await StockMovementService.acquireStockLeases(
        req.dbConnection,
        leaseKeys
      );
    }

    // Start transaction
    await session.startTransaction();
    
    const { StockAdjustment, Product, Warehouse, StockMovement } = getModels(req.dbConnection);

    if (idempotencyKey) {
      const existingAdjustment = await StockAdjustment.findOne({ idempotencyKey })
        .select('_id idempotencyFingerprint')
        .session(session)
        .lean();
      if (existingAdjustment) {
        await session.abortTransaction();
        if (existingAdjustment.idempotencyFingerprint !== idempotencyFingerprint) {
          return res.status(409).json({
            success: false,
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was already used for a different stock adjustment'
          });
        }
        const replayedAdjustment = await StockAdjustment.findById(existingAdjustment._id)
          .populate('warehouseId', 'name address')
          .populate('createdBy', 'name email')
          .populate('items.productId', 'productCode itemName HSNCode');
        return res.status(200).json({
          success: true,
          replayed: true,
          message: 'Stock adjustment already created',
          data: replayedAdjustment
        });
      }
    }
    
    const {
      warehouseId,
      adjustmentType,
      reason,
      remarks,
      items,
      createdBy
    } = req.body;

    console.log('Creating stock adjustment with data:', { warehouseId, adjustmentType, reason, items: items?.length });

    // Validate required fields
    if (!warehouseId || !adjustmentType || !reason || !items || items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Warehouse, adjustment type, reason, and items are required'
      });
    }

    // A request may contain the same product more than once. Validate REMOVE
    // against the combined quantity so duplicate rows cannot each pass against
    // the same pre-adjustment balance and drive stock negative.
    const requestedQuantityByProduct = new Map();
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!item.productId || !Number.isFinite(quantity) || quantity <= 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Every adjustment item requires a product and a positive quantity'
        });
      }
      const key = String(item.productId);
      requestedQuantityByProduct.set(
        key,
        Number(requestedQuantityByProduct.get(key) || 0) + quantity
      );
    }

    // Validate warehouse exists
    const warehouse = await Warehouse.findById(warehouseId).session(session);
    if (!warehouse) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Warehouse not found'
      });
    }

    // Block stock adjustments dated in a closed financial year
    await assertPeriodOpen(req.dbConnection, req.body.adjustmentDate || Date.now(), 'stock adjustment');

    // Validate products and get current stock levels
    const adjustmentItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`
        });
      }

      // Get current stock level for this product in this warehouse
      const currentStock = await StockMovementService.getCurrentStock(
        item.productId,
        warehouseId,
        req.dbConnection,
        session
      );
      
      // For REMOVE adjustments, check the combined request quantity for this
      // product rather than validating duplicate rows independently.
      const totalRequestedQuantity = Number(requestedQuantityByProduct.get(String(item.productId)) || 0);
      if (adjustmentType === 'REMOVE' && currentStock < totalRequestedQuantity) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.itemName}. Available: ${currentStock}, Required: ${totalRequestedQuantity}`
        });
      }

      adjustmentItems.push({
        productId: item.productId,
        productCode: product.productCode,
        itemName: product.itemName,
        currentStock: currentStock,
        quantity: item.quantity,
        unitPrice: item.unitPrice || product.unitPrice || 0,
        remarks: item.remarks || ''
      });
    }

    // Create the stock adjustment
    const stockAdjustment = new StockAdjustment({
      warehouseId,
      adjustmentType,
      reason,
      remarks: remarks || '',
      items: adjustmentItems,
      createdBy: createdBy || req.user._id,
      status: 'Completed', // Auto-complete manual adjustments
      idempotencyKey: idempotencyKey || undefined,
      idempotencyFingerprint: idempotencyFingerprint || undefined
    });

    await stockAdjustment.save({ session });

    // Serialize and append all movement rows using aggregate ledger balances.
    await StockMovementService.acquireStockLocks(
      req.dbConnection,
      adjustmentItems.map((item) => StockMovementService.stockKey(item.productId, warehouseId)),
      session
    );
    const stockMovements = adjustmentItems.map((item, index) => ({
      productId: item.productId,
      warehouseId,
      type: adjustmentType === 'ADD' ? 'IN' : 'OUT',
      quantity: item.quantity,
      referenceNo: stockAdjustment.adjustmentNo,
      referenceType: 'ADJUSTMENT',
      operationKey: idempotencyKey
        ? `ADJUSTMENT_REQUEST:${idempotencyKey}:${index}`
        : `ADJUSTMENT:${stockAdjustment._id}:${index}`,
      movementRole: 'ADJUSTMENT',
      date: stockAdjustment.adjustmentDate,
      remarks: `Manual ${adjustmentType.toLowerCase()} adjustment: ${reason}${item.remarks ? ` - ${item.remarks}` : ''}`,
      createdBy: stockAdjustment.createdBy
    }));

    if (stockMovements.length > 0) {
      await StockMovementService.appendMovements(stockMovements, {
        dbConnection: req.dbConnection,
        session,
        locksAcquired: true
      });
      console.log(`Created ${stockMovements.length} stock movements for adjustment: ${stockAdjustment.adjustmentNo}`);
    }

    // Commit transaction
    await session.commitTransaction();
    
    // Recalculate the FIFO Pending-order queue after either increases or decreases.
    try {
      const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
      await StockArrivalService.refreshStockKeys(
        adjustmentItems.map((item) => ({ productId: item.productId, warehouseId })),
        req.dbConnection
      );
      console.log(`✅ Refreshed Pending-order stock queue after adjustment: ${stockAdjustment.adjustmentNo}`);
    } catch (arrivalError) {
      console.error('⚠️ Error refreshing Pending-order stock queue (non-critical):', arrivalError);
    }

    // Populate the response
    const populatedAdjustment = await StockAdjustment.findById(stockAdjustment._id)
      .populate('warehouseId', 'name address')
      .populate('createdBy', 'name email')
      .populate('items.productId', 'productCode itemName HSNCode');

    res.status(201).json({
      success: true,
      message: 'Stock adjustment created successfully',
      data: populatedAdjustment
    });

  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    if (handlePeriodLockError(error, res)) return;
    console.error('Error creating stock adjustment:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : 'Error creating stock adjustment',
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    if (stockLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, stockLease);
      } catch (releaseError) {
        console.error('Failed to release stock-adjustment lease:', releaseError.message);
      }
    }
    session.endSession();
  }
};

// Get Stock Adjustments with pagination and search
export const getStockAdjustments = async (req, res) => {
  try {
    const { StockAdjustment } = getModels(req.dbConnection);
    const {
      page = 1,
      limit = 10,
      search = '',
      warehouseId,
      adjustmentType,
      reason,
      startDate,
      endDate
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = {};

    if (search) {
      query.$or = [
        { adjustmentNo: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } },
        { remarks: { $regex: search, $options: 'i' } }
      ];
    }

    if (warehouseId) {
      query.warehouseId = warehouseId;
    }

    if (adjustmentType) {
      query.adjustmentType = adjustmentType;
    }

    if (reason) {
      query.reason = reason;
    }

    if (startDate || endDate) {
      query.adjustmentDate = {};
      if (startDate) {
        query.adjustmentDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.adjustmentDate.$lte = new Date(endDate);
      }
    }

    // Get total count
    const totalRecords = await StockAdjustment.countDocuments(query);

    // Get paginated results
    const adjustments = await StockAdjustment.find(query)
      .populate('warehouseId', 'name address')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ adjustmentDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalPages = Math.ceil(totalRecords / limitNum);

    res.json({
      success: true,
      data: adjustments,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('Error fetching stock adjustments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stock adjustments',
      error: error.message
    });
  }
};

// Get Single Stock Adjustment
export const getStockAdjustment = async (req, res) => {
  try {
    const { StockAdjustment } = getModels(req.dbConnection);
    const { id } = req.params;

    const adjustment = await StockAdjustment.findById(id)
      .populate('warehouseId', 'name address contact')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('items.productId', 'productCode itemName HSNCode description unitPrice');

    if (!adjustment) {
      return res.status(404).json({
        success: false,
        message: 'Stock adjustment not found'
      });
    }

    res.json({
      success: true,
      data: adjustment
    });

  } catch (error) {
    console.error('Error fetching stock adjustment:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stock adjustment',
      error: error.message
    });
  }
};

// Get Stock Adjustments for a specific product
export const getProductStockAdjustments = async (req, res) => {
  try {
    const { StockAdjustment } = getModels(req.dbConnection);
    const { productId } = req.params;
    const {
      page = 1,
      limit = 10,
      warehouseId
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = {
      'items.productId': productId
    };

    if (warehouseId) {
      query.warehouseId = warehouseId;
    }

    // Get total count
    const totalRecords = await StockAdjustment.countDocuments(query);

    // Get paginated results
    const adjustments = await StockAdjustment.find(query)
      .populate('warehouseId', 'name address')
      .populate('createdBy', 'name email')
      .sort({ adjustmentDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalPages = Math.ceil(totalRecords / limitNum);

    // Filter items to only include the requested product
    const filteredAdjustments = adjustments.map(adjustment => {
      const filteredItems = adjustment.items.filter(item => 
        item.productId.toString() === productId
      );
      
      return {
        ...adjustment.toObject(),
        items: filteredItems,
        totalItems: filteredItems.length,
        totalQuantity: filteredItems.reduce((sum, item) => sum + item.quantity, 0),
        totalValue: filteredItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
      };
    });

    res.json({
      success: true,
      data: filteredAdjustments,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('Error fetching product stock adjustments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product stock adjustments',
      error: error.message
    });
  }
};

// Get Stock Adjustment Statistics
export const getStockAdjustmentStats = async (req, res) => {
  try {
    const { StockAdjustment } = getModels(req.dbConnection);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Get basic counts
    const totalAdjustments = await StockAdjustment.countDocuments({});
    const monthlyAdjustments = await StockAdjustment.countDocuments({
      adjustmentDate: { $gte: startOfMonth }
    });

    // Get adjustments by type
    const adjustmentsByType = await StockAdjustment.aggregate([
      {
        $group: {
          _id: '$adjustmentType',
          count: { $sum: 1 },
          totalValue: { $sum: '$totalValue' }
        }
      }
    ]);

    let positiveAdjustments = 0;
    let negativeAdjustments = 0;
    let totalValueImpact = 0;

    adjustmentsByType.forEach(type => {
      if (type._id === 'ADD') {
        positiveAdjustments = type.count;
        totalValueImpact += type.totalValue;
      } else if (type._id === 'REMOVE') {
        negativeAdjustments = type.count;
        totalValueImpact -= type.totalValue;
      }
    });

    // Get reason-wise breakdown
    const reasonBreakdown = await StockAdjustment.aggregate([
      {
        $group: {
          _id: '$reason',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$totalQuantity' },
          totalValue: { $sum: '$totalValue' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get monthly trend
    const monthlyTrend = await StockAdjustment.aggregate([
      {
        $match: {
          adjustmentDate: { $gte: startOfYear }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$adjustmentDate' },
            month: { $month: '$adjustmentDate' }
          },
          count: { $sum: 1 },
          totalValue: { $sum: '$totalValue' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      success: true,
      data: {
        totalAdjustments,
        monthlyAdjustments,
        positiveAdjustments,
        negativeAdjustments,
        totalValueImpact,
        reasonBreakdown,
        monthlyTrend
      }
    });

  } catch (error) {
    console.error('Error fetching stock adjustment stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};

// Delete Stock Adjustment (Admin only)
export const deleteStockAdjustment = async (req, res) => {
  const session = await req.dbConnection.startSession();
  let stockLease = null;
  
  try {
    const { StockAdjustment: PreviewAdjustment } = getModels(req.dbConnection);
    const preview = await PreviewAdjustment.findById(req.params.id)
      .select('items.productId warehouseId')
      .lean();
    if (preview) {
      stockLease = await StockMovementService.acquireStockLeases(
        req.dbConnection,
        (preview.items || []).map((item) => StockMovementService.stockKey(
          item.productId,
          preview.warehouseId
        ))
      );
    }

    await session.startTransaction();
    
    const { StockAdjustment, StockMovement } = getModels(req.dbConnection);
    const { id } = req.params;

    // Check if user has permission to delete
    if (!req.user.isSuperAdmin && !req.user.isAdmin) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Only administrators can delete stock adjustments'
      });
    }

    const adjustment = await StockAdjustment.findById(id).session(session);
    if (!adjustment) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Stock adjustment not found'
      });
    }

    await StockMovementService.acquireStockLocks(
      req.dbConnection,
      adjustment.items.map((item) => StockMovementService.stockKey(
        item.productId,
        adjustment.warehouseId
      )),
      session
    );

    // Delete related stock movements
    await StockMovement.deleteMany({
      referenceNo: adjustment.adjustmentNo,
      referenceType: 'ADJUSTMENT'
    }).session(session);

    // Delete the adjustment
    await StockAdjustment.findByIdAndDelete(id).session(session);

    // Recalculate stock balances for affected products
    const affectedProducts = adjustment.items.map(item => ({
      productId: item.productId,
      warehouseId: adjustment.warehouseId
    }));

    // Commit transaction first
    await session.commitTransaction();

    // Recalculate balances (outside transaction for performance)
    for (const { productId, warehouseId } of affectedProducts) {
      try {
        // Get all movements for this product-warehouse combination
        const movements = await StockMovement.find({
          productId,
          warehouseId
        }).sort({ date: 1, createdAt: 1 });

        let runningBalance = 0;
        for (const movement of movements) {
          if (movement.type === 'IN') {
            runningBalance += movement.quantity;
          } else if (movement.type === 'OUT') {
            runningBalance -= movement.quantity;
          }
          
          await StockMovement.findByIdAndUpdate(movement._id, { balance: runningBalance });
        }
      } catch (recalcError) {
        console.error('Error recalculating balance for product:', productId, recalcError);
      }
    }

    try {
      const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
      await StockArrivalService.refreshStockKeys(affectedProducts, req.dbConnection);
    } catch (refreshError) {
      console.error('Deleted-adjustment stock queue refresh failed:', refreshError.message);
    }

    res.json({
      success: true,
      message: 'Stock adjustment deleted successfully'
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error deleting stock adjustment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting stock adjustment',
      error: error.message
    });
  } finally {
    if (stockLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, stockLease);
      } catch (releaseError) {
        console.error('Failed to release deleted-adjustment stock lease:', releaseError.message);
      }
    }
    session.endSession();
  }
};