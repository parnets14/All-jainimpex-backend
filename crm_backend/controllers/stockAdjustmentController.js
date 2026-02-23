import StockAdjustment from '../models/StockAdjustment.js';
import Product from '../models/Product.js';
import Warehouse from '../models/Warehouse.js';
import StockMovementService from '../services/stockMovementService.js';
import StockMovement from '../models/Stock.js';
import mongoose from 'mongoose';

// Create Stock Adjustment
export const createStockAdjustment = async (req, res) => {
  // Start MongoDB session for transaction
  const session = await mongoose.startSession();
  
  try {
    // Start transaction
    await session.startTransaction();
    
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

    // Validate warehouse exists
    const warehouse = await Warehouse.findById(warehouseId).session(session);
    if (!warehouse) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Warehouse not found'
      });
    }

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
      const currentStock = await StockMovementService.getCurrentStock(item.productId, warehouseId);
      
      // For REMOVE adjustments, check if sufficient stock is available
      if (adjustmentType === 'REMOVE' && currentStock < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.itemName}. Available: ${currentStock}, Required: ${item.quantity}`
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
      status: 'Completed' // Auto-complete manual adjustments
    });

    await stockAdjustment.save({ session });

    // Create stock movements for each item
    const stockMovements = [];
    for (const item of adjustmentItems) {
      const movementType = adjustmentType === 'ADD' ? 'IN' : 'OUT';
      const quantity = adjustmentType === 'ADD' ? item.quantity : item.quantity;
      const balanceChange = adjustmentType === 'ADD' ? item.quantity : -item.quantity;
      
      // Calculate new balance
      const newBalance = await StockMovementService.calculateRunningBalance(
        item.productId, 
        warehouseId, 
        balanceChange, 
        session
      );

      const stockMovement = new StockMovement({
        productId: item.productId,
        warehouseId: warehouseId,
        type: movementType,
        quantity: quantity,
        balance: newBalance,
        referenceNo: stockAdjustment.adjustmentNo,
        referenceType: 'ADJUSTMENT',
        date: stockAdjustment.adjustmentDate,
        remarks: `Manual ${adjustmentType.toLowerCase()} adjustment: ${reason}${item.remarks ? ` - ${item.remarks}` : ''}`,
        createdBy: stockAdjustment.createdBy
      });

      stockMovements.push(stockMovement);
    }

    // Save all stock movements
    if (stockMovements.length > 0) {
      await StockMovement.insertMany(stockMovements, { session });
      console.log(`Created ${stockMovements.length} stock movements for adjustment: ${stockAdjustment.adjustmentNo}`);
    }

    // Commit transaction
    await session.commitTransaction();
    
    // IMPORTANT: Check waiting orders for stock arrival (after transaction commits)
    // This runs outside the transaction to avoid blocking stock adjustment creation
    try {
      const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
      
      for (const item of adjustmentItems) {
        // Only check for ADD adjustments (stock arriving)
        if (adjustmentType === 'ADD') {
          await StockArrivalService.checkWaitingOrdersForStock(
            item.productId,
            warehouseId,
            item.quantity
          );
        }
      }
      console.log(`✅ Checked waiting orders for stock arrival after adjustment: ${stockAdjustment.adjustmentNo}`);
    } catch (arrivalError) {
      console.error('⚠️  Error checking waiting orders (non-critical):', arrivalError);
      // Don't fail adjustment creation if stock arrival check fails
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
    await session.abortTransaction();
    console.error('Error creating stock adjustment:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating stock adjustment',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Get Stock Adjustments with pagination and search
export const getStockAdjustments = async (req, res) => {
  try {
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
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();
    
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
    session.endSession();
  }
};