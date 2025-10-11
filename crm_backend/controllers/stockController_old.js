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
        .populate('supplierId', 'name')
        .populate('items.productId', 'productCode itemName');

      console.log(`🔍 [STOCK_DEBUG] Found ${grns.length} GRNs for product ${product.productCode}:`, grns.map(grn => ({
        grnNo: grn.grnNo,
        itemsCount: grn.items.length,
        items: grn.items.map(item => ({
          productId: item.productId,
          unitPrice: item.unitPrice,
          gst: item.gst,
          totalPrice: item.totalPrice,
          acceptedQuantity: item.acceptedQuantity
        }))
      })));

      let totalQty = 0;
      let damagedQty = 0;
      let warehouses = new Set();
      let suppliers = new Set();
      let weightedPriceSum = 0;
      let weightedGstSum = 0;
      let totalValue = 0;
      let totalAcceptedQty = 0;

      grns.forEach(grn => {
        grn.items.forEach(item => {
          // Handle both populated and non-populated productId
          const itemProductId = item.productId._id ? item.productId._id.toString() : item.productId.toString();
          if (itemProductId === product._id.toString()) {
            console.log(`🔍 [STOCK_DEBUG] Processing item for ${product.productCode}:`, {
              productId: item.productId,
              acceptedQuantity: item.acceptedQuantity,
              unitPrice: item.unitPrice,
              gst: item.gst,
              totalPrice: item.totalPrice,
              damageQuantity: item.damageQuantity
            });
            
            totalQty += item.acceptedQuantity;
            damagedQty += item.damageQuantity;
            warehouses.add(grn.warehouseId.name);
            if (grn.supplierId) {
              suppliers.add(grn.supplierId.name);
            }
            
            // Calculate weighted average price and GST
            const acceptedQty = item.acceptedQuantity || 0;
            const unitPrice = item.unitPrice || 0;
            const gst = item.gst || 0;
            
            weightedPriceSum += unitPrice * acceptedQty;
            weightedGstSum += gst * acceptedQty;
            totalValue += item.totalPrice || 0;
            totalAcceptedQty += acceptedQty;
          }
        });
      });

      // Calculate weighted average unit price and GST
      const averageUnitPrice = totalAcceptedQty > 0 ? weightedPriceSum / totalAcceptedQty : 0;
      const averageGst = totalAcceptedQty > 0 ? weightedGstSum / totalAcceptedQty : 0;

      console.log(`📊 [STOCK_DEBUG] Final calculations for ${product.productCode}:`, {
        totalAcceptedQty,
        weightedPriceSum,
        weightedGstSum,
        totalValue,
        averageUnitPrice,
        averageGst,
        totalQty,
        damagedQty
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
        basePrice: averageUnitPrice, // Use weighted average unit price from GRN
        gst: averageGst, // Use weighted average GST from GRN
        totalPrice: totalValue, // Use total value from all GRN items
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

export const debugProductGRNs = async (req, res) => {
  try {
    const { productId } = req.params;
    
    console.log(`🔍 [DEBUG] Debugging GRNs for product: ${productId}`);
    
    const grns = await StockMovementService.debugProductGRNs(productId);
    
    res.json({
      success: true,
      message: `Found ${grns.length} GRNs for product ${productId}`,
      data: grns
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const forceCreateStockMovements = async (req, res) => {
  try {
    console.log('🔧 [FORCE_MIGRATION] Starting force creation of stock movements...');
    
    // Import GRN model
    const GRN = (await import('../models/GRN.js')).default;
    
    // Get all GRNs
    const grns = await GRN.find({})
      .populate('items.productId')
      .populate('warehouseId')
      .populate('createdBy')
      .sort({ grnDate: 1, createdAt: 1 });
    
    console.log(`🔧 [FORCE_MIGRATION] Found ${grns.length} GRNs to process`);
    
    let totalMovements = 0;
    let processedGRNs = 0;
    
    for (const grn of grns) {
      console.log(`🔧 [FORCE_MIGRATION] Processing GRN: ${grn.grnNo}`);
      
      // Check if stock movements already exist for this GRN
      const existingMovements = await StockMovement.find({ referenceNo: grn.grnNo });
      
      if (existingMovements.length > 0) {
        console.log(`🔧 [FORCE_MIGRATION] GRN ${grn.grnNo} already has ${existingMovements.length} movements, skipping`);
        continue;
      }
      
      // Create stock movements for this GRN
      const movements = [];
      
      for (const item of grn.items) {
        // Create IN movement for accepted quantity
        if (item.acceptedQuantity > 0) {
          const inMovement = new StockMovement({
            productId: item.productId._id,
            warehouseId: grn.warehouseId._id,
            type: 'IN',
            quantity: item.acceptedQuantity,
            balance: 0, // Will be recalculated later
            referenceNo: grn.grnNo,
            referenceType: 'GRN',
            date: grn.grnDate,
            remarks: `GRN: ${grn.grnNo} - Accepted Quantity`,
            createdBy: grn.createdBy._id
          });
          movements.push(inMovement);
        }
        
        // Create OUT movement for damaged quantity
        if (item.damageQuantity > 0) {
          const outMovement = new StockMovement({
            productId: item.productId._id,
            warehouseId: grn.warehouseId._id,
            type: 'OUT',
            quantity: item.damageQuantity,
            balance: 0, // Will be recalculated later
            referenceNo: grn.grnNo,
            referenceType: 'GRN',
            date: grn.grnDate,
            remarks: `GRN: ${grn.grnNo} - Damaged Quantity`,
            createdBy: grn.createdBy._id
          });
          movements.push(outMovement);
        }
      }
      
      // Save movements
      if (movements.length > 0) {
        await StockMovement.insertMany(movements);
        totalMovements += movements.length;
        processedGRNs++;
        console.log(`🔧 [FORCE_MIGRATION] Created ${movements.length} movements for GRN: ${grn.grnNo}`);
      }
    }
    
    // Recalculate balances
    console.log('🔧 [FORCE_MIGRATION] Recalculating balances...');
    await StockMovementService.recalculateBalances();
    
    console.log(`🔧 [FORCE_MIGRATION] Completed! Processed ${processedGRNs} GRNs, created ${totalMovements} movements`);
    
    res.json({
      success: true,
      message: `Force migration completed! Processed ${processedGRNs} GRNs and created ${totalMovements} stock movements`,
      data: {
        grnsProcessed: processedGRNs,
        movementsCreated: totalMovements
      }
    });
  } catch (error) {
    console.error('Force migration error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const migrateStockMovements = async (req, res) => {
  try {
    console.log('🔍 [MIGRATION] Starting stock movement migration...');
    
    const result = await StockMovementService.migrateExistingGRNData();
    
    res.json({
      success: true,
      message: result.message,
      data: {
        grnsProcessed: result.grnsProcessed,
        movementsCreated: result.movementsCreated
      }
    });
  } catch (error) {
    console.error('Migration error:', error);
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