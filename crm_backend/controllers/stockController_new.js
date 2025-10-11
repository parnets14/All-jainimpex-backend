import StockMovement from '../models/Stock.js';
import Product from '../models/Product.js';
import GRN from '../models/GRN.js';
import StockMovementService from '../services/stockMovementService.js';

export const getStock = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      warehouseId,
      lowStockOnly = false
    } = req.query;

    console.log(`🔍 [STOCK_DEBUG] Getting stock with filters:`, { search, warehouseId, lowStockOnly });

    // Get all products with their current stock
    const products = await Product.find({
      $or: [
        { productCode: { $regex: search, $options: 'i' } },
        { itemName: { $regex: search, $options: 'i' } },
        { HSNCode: { $regex: search, $options: 'i' } }
      ]
    });

    const stockData = [];
    
    for (const product of products) {
      // Get all warehouses that have this product
      const grnQuery = { 'items.productId': product._id };
      const grns = await GRN.find(grnQuery)
        .populate('warehouseId', 'name')
        .populate('supplierId', 'name')
        .populate('items.productId', 'productCode itemName');

      // Group by warehouse
      const warehouseStock = {};
      
      grns.forEach(grn => {
        if (!grn.warehouseId) return;
        
        const warehouseId = grn.warehouseId._id.toString();
        const warehouseName = grn.warehouseId.name;
        
        if (!warehouseStock[warehouseId]) {
          warehouseStock[warehouseId] = {
            warehouseId: warehouseId,
            warehouseName: warehouseName,
            totalQty: 0,
            damagedQty: 0,
            suppliers: new Set(),
            weightedPriceSum: 0,
            totalAcceptedQty: 0,
            totalValue: 0
          };
        }
        
        grn.items.forEach(item => {
          if (item.productId.toString() === product._id.toString()) {
            warehouseStock[warehouseId].totalQty += item.acceptedQuantity || 0;
            warehouseStock[warehouseId].damagedQty += item.damageQuantity || 0;
            warehouseStock[warehouseId].totalAcceptedQty += item.acceptedQuantity || 0;
            
            if (grn.supplierId) {
              warehouseStock[warehouseId].suppliers.add(grn.supplierId.name);
            }
            
            // Calculate weighted averages
            const itemValue = (item.acceptedQuantity || 0) * (item.unitPrice || 0);
            warehouseStock[warehouseId].totalValue += itemValue;
            warehouseStock[warehouseId].weightedPriceSum += itemValue;
          }
        });
      });

      // Create separate stock entries for each warehouse
      Object.values(warehouseStock).forEach(warehouse => {
        // Apply warehouse filter if specified
        if (warehouseId && warehouse.warehouseId !== warehouseId) {
          return;
        }

        const averageUnitPrice = warehouse.totalAcceptedQty > 0 ? warehouse.weightedPriceSum / warehouse.totalAcceptedQty : 0;
        const blockedQty = 0; // This would come from blocked stock or reservations
        const netStock = warehouse.totalQty - warehouse.damagedQty - blockedQty;

        // Skip if lowStockOnly is true and stock is not low
        if (lowStockOnly && (!product.minStockLevel || netStock > product.minStockLevel)) {
          return;
        }

        stockData.push({
          productId: product._id,
          productCode: product.productCode,
          hsnCode: product.HSNCode,
          itemName: product.itemName,
          description: product.description,
          supplier: Array.from(warehouse.suppliers).join(', '),
          warehouse: warehouse.warehouseName,
          warehouseId: warehouse.warehouseId,
          basePrice: averageUnitPrice,
          gst: 0, // Will be calculated from GRN items
          totalPrice: warehouse.totalValue,
          totalQty: warehouse.totalQty,
          damagedQty: warehouse.damagedQty,
          blockedQty,
          netStock,
          minStockLevel: product.minStockLevel
        });
      });
    }

    // Manual pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;

    const paginatedData = stockData.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(stockData.length / limitNum),
        totalRecords: stockData.length,
        hasNextPage: endIndex < stockData.length,
        hasPrevPage: startIndex > 0,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Get stock error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getStockHistory = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, warehouseId } = req.query;

    console.log(`🔍 [STOCK_HISTORY_DEBUG] Getting stock history for product: ${productId} at ${new Date().toISOString()}`);

    // Use StockMovementService to get stock history
    const result = await StockMovementService.getStockHistory(productId, {
      page,
      limit,
      warehouseId
    });

    console.log(`🔍 [STOCK_HISTORY_DEBUG] Found ${result.movements.length} movements for product ${productId}`);

    res.json({
      success: true,
      data: result.movements,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get stock history error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Stock Transfer Functions
export const createStockTransfer = async (req, res) => {
  try {
    const {
      fromWarehouse,
      toWarehouse,
      items,
      transferDate,
      notes,
      status = 'pending'
    } = req.body;

    console.log(`🔍 [STOCK_TRANSFER] Creating transfer from ${fromWarehouse} to ${toWarehouse}`);

    // Generate transfer ID
    const transferId = `TRF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Create stock movements for each item
    const movements = [];
    
    for (const item of items) {
      // OUT movement from source warehouse
      const outMovement = new StockMovement({
        productId: item.productId,
        warehouseId: fromWarehouse,
        type: 'OUT',
        quantity: item.quantity,
        balance: 0, // Will be calculated
        referenceNo: transferId,
        referenceType: 'TRANSFER',
        date: new Date(transferDate),
        remarks: `Transfer to ${toWarehouse} - ${item.quantity} units`,
        createdBy: req.user._id
      });

      // IN movement to destination warehouse
      const inMovement = new StockMovement({
        productId: item.productId,
        warehouseId: toWarehouse,
        type: 'IN',
        quantity: item.quantity,
        balance: 0, // Will be calculated
        referenceNo: transferId,
        referenceType: 'TRANSFER',
        date: new Date(transferDate),
        remarks: `Transfer from ${fromWarehouse} - ${item.quantity} units`,
        createdBy: req.user._id
      });

      movements.push(outMovement, inMovement);
    }

    // Save all movements
    await StockMovement.insertMany(movements);

    // Recalculate balances
    await StockMovementService.recalculateBalances();

    res.json({
      success: true,
      message: 'Stock transfer created successfully',
      data: {
        transferId,
        movements: movements.length,
        status: 'completed'
      }
    });

  } catch (error) {
    console.error('Create stock transfer error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getStockTransfers = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    // Get all transfer movements grouped by reference number
    const query = { referenceType: 'TRANSFER' };
    if (status) {
      query.status = status;
    }

    const movements = await StockMovement.find(query)
      .populate('productId', 'productCode itemName')
      .populate('warehouseId', 'name')
      .populate('createdBy', 'name')
      .sort({ date: -1 });

    // Group by transfer ID
    const transfers = {};
    movements.forEach(movement => {
      if (!transfers[movement.referenceNo]) {
        transfers[movement.referenceNo] = {
          transferId: movement.referenceNo,
          date: movement.date,
          status: 'completed',
          items: [],
          fromWarehouse: null,
          toWarehouse: null,
          createdBy: movement.createdBy
        };
      }

      if (movement.type === 'OUT') {
        transfers[movement.referenceNo].fromWarehouse = movement.warehouseId;
      } else if (movement.type === 'IN') {
        transfers[movement.referenceNo].toWarehouse = movement.warehouseId;
      }

      transfers[movement.referenceNo].items.push({
        productId: movement.productId,
        quantity: movement.quantity,
        type: movement.type,
        warehouse: movement.warehouseId
      });
    });

    const transferList = Object.values(transfers);

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;

    const paginatedData = transferList.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(transferList.length / limitNum),
        totalRecords: transferList.length,
        hasNextPage: endIndex < transferList.length,
        hasPrevPage: startIndex > 0,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('Get stock transfers error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getWarehouses = async (req, res) => {
  try {
    const Warehouse = (await import('../models/Warehouse.js')).default;
    const warehouses = await Warehouse.find({}).select('name location');
    
    res.json({
      success: true,
      data: warehouses
    });
  } catch (error) {
    console.error('Get warehouses error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getStockAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Get all products with their current stock
    const products = await Product.find({ minStockLevel: { $gt: 0 } });
    const lowStockItems = [];

    for (const product of products) {
      const grns = await GRN.find({ 'items.productId': product._id })
        .populate('warehouseId', 'name');

      const warehouseStock = {};
      
      grns.forEach(grn => {
        if (!grn.warehouseId) return;
        
        const warehouseId = grn.warehouseId._id.toString();
        const warehouseName = grn.warehouseId.name;
        
        if (!warehouseStock[warehouseId]) {
          warehouseStock[warehouseId] = {
            warehouseId: warehouseId,
            warehouseName: warehouseName,
            totalQty: 0,
            damagedQty: 0
          };
        }
        
        grn.items.forEach(item => {
          if (item.productId.toString() === product._id.toString()) {
            warehouseStock[warehouseId].totalQty += item.acceptedQuantity || 0;
            warehouseStock[warehouseId].damagedQty += item.damageQuantity || 0;
          }
        });
      });

      Object.values(warehouseStock).forEach(warehouse => {
        const netStock = warehouse.totalQty - warehouse.damagedQty;
        
        if (netStock <= product.minStockLevel) {
          lowStockItems.push({
            productId: product._id,
            productCode: product.productCode,
            itemName: product.itemName,
            warehouse: warehouse.warehouseName,
            warehouseId: warehouse.warehouseId,
            currentStock: netStock,
            minStockLevel: product.minStockLevel,
            shortage: product.minStockLevel - netStock
          });
        }
      });
    }

    // Manual pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;

    const paginatedData = lowStockItems.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(lowStockItems.length / limitNum),
        totalRecords: lowStockItems.length,
        hasNextPage: endIndex < lowStockItems.length,
        hasPrevPage: startIndex > 0,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Get stock alerts error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
