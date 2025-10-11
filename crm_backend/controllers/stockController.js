import StockMovement from '../models/Stock.js';
import Product from '../models/Product.js';
import GRN from '../models/GRN.js';

export const getStock = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      warehouseId,
      lowStockOnly = false
    } = req.query;

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
      // Calculate current stock from GRNs
      const grnQuery = { 'items.productId': product._id };
      if (warehouseId) {
        grnQuery.warehouseId = warehouseId;
      }

      const grns = await GRN.find(grnQuery)
        .populate('warehouseId', 'name')
        .populate('supplierId', 'name');

      let totalQty = 0;
      let damagedQty = 0;
      let warehouses = new Set();
      let suppliers = new Set();

      grns.forEach(grn => {
        grn.items.forEach(item => {
          if (item.productId.toString() === product._id.toString()) {
            totalQty += item.acceptedQuantity;
            damagedQty += item.damageQuantity;
            warehouses.add(grn.warehouseId.name);
            if (grn.supplierId) {
              suppliers.add(grn.supplierId.name);
            }
          }
        });
      });

      const blockedQty = 0; // You can implement blocked stock logic
      const netStock = totalQty - damagedQty - blockedQty;

      // Skip if lowStockOnly is true and stock is not low
      if (lowStockOnly && (!product.minStockLevel || netStock > product.minStockLevel)) {
        continue;
      }

      stockData.push({
        productId: product._id,
        productCode: product.productCode,
        hsnCode: product.HSNCode,
        itemName: product.itemName,
        description: product.description,
        supplier: Array.from(suppliers).join(', '),
        warehouse: Array.from(warehouses).join(', '),
        basePrice: product.basePrice || 0,
        gst: product.gst || 0,
        totalPrice: product.totalPrice || 0,
        totalQty,
        damagedQty,
        blockedQty,
        netStock,
        minStockLevel: product.minStockLevel
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
    const { page = 1, limit = 10 } = req.query;

    const query = { productId };

    // Manual pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const movements = await StockMovement.find(query)
      .populate('warehouseId', 'name')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalRecords = await StockMovement.countDocuments(query);

    res.json({
      success: true,
      data: movements,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalRecords / limitNum),
        totalRecords,
        hasNextPage: (pageNum * limitNum) < totalRecords,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Get stock history error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getStockAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const products = await Product.find({
      minStockLevel: { $exists: true, $gt: 0 }
    });

    const lowStockItems = [];
    
    for (const product of products) {
      const grns = await GRN.find({ 'items.productId': product._id });
      
      let totalStock = 0;
      grns.forEach(grn => {
        grn.items.forEach(item => {
          if (item.productId.toString() === product._id.toString()) {
            totalStock += item.acceptedQuantity - item.damageQuantity;
          }
        });
      });

      if (totalStock <= product.minStockLevel) {
        lowStockItems.push({
          productId: product._id,
          productCode: product.productCode,
          itemName: product.itemName,
          currentStock: totalStock,
          minStockLevel: product.minStockLevel,
          deficit: product.minStockLevel - totalStock
        });
      }
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