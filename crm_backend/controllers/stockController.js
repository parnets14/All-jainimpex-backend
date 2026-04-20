import mongoose from 'mongoose';
import { stockMovementSchema } from '../models/Stock.js';
import { productSchema } from '../models/Product.js';
import { grnSchema } from '../models/GRN.js';
import { supplierSchema } from '../models/Supplier.js';
import { warehouseSchema } from '../models/Warehouse.js';
import { salesOrderSchema } from '../models/SalesOrder.js';
import StockMovementService from '../services/stockMovementService.js';

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    StockMovement: dbConnection.models.StockMovement || dbConnection.model('StockMovement', stockMovementSchema),
    Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
    GRN: dbConnection.models.GRN || dbConnection.model('GRN', grnSchema),
    Supplier: dbConnection.models.Supplier || dbConnection.model('Supplier', supplierSchema),
    Warehouse: dbConnection.models.Warehouse || dbConnection.model('Warehouse', warehouseSchema),
    SalesOrder: dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema),
  };
};

// Helper function to calculate damaged quantity from GRN data
// Damaged quantity is part of received quantity but never enters usable stock
// It's stored in GRN for record-keeping and display purposes only
const calculateDamagedQuantity = async (dbConnection, productId, warehouseId) => {
  try {
    const { GRN } = getModels(dbConnection);
    // Get damaged quantity from GRN records
    const grns = await GRN.find({
      'items.productId': productId,
      warehouseId: new mongoose.Types.ObjectId(warehouseId) // Convert string to ObjectId
    }).lean();

    let damagedQty = 0;
    grns.forEach(grn => {
      grn.items.forEach(item => {
        if (item.productId.toString() === productId.toString()) {
          damagedQty += item.damageQuantity || 0;
        }
      });
    });

    return damagedQty;
  } catch (error) {
    console.error(`Error calculating damaged quantity for product ${productId} in warehouse ${warehouseId}:`, error);
    return 0;
  }
};

// NEW: Calculate GRN Available Quantity
// This shows: GRN IN quantity - Only Delivered OUT quantity
// Does NOT deduct Confirmed/Blocked orders - only actual delivered orders
const calculateGRNAvailableQuantity = async (dbConnection, productId, warehouseId) => {
  try {
    const { GRN, SalesOrder } = getModels(dbConnection);
    // Step 1: Get total GRN IN quantity (accepted quantity from all GRNs)
    const grns = await GRN.find({
      'items.productId': productId,
      warehouseId: new mongoose.Types.ObjectId(warehouseId)
    }).lean();

    let grnInQty = 0;
    grns.forEach(grn => {
      grn.items.forEach(item => {
        if (item.productId.toString() === productId.toString()) {
          grnInQty += item.acceptedQuantity || 0;
        }
      });
    });

    // Step 2: Get only DELIVERED sales order quantities (not Confirmed/Blocked)
    // We need to find sales orders with "Delivered" status and sum their quantities
    const deliveredOrders = await SalesOrder.find({
      'products.product': productId,
      'products.warehouse': new mongoose.Types.ObjectId(warehouseId),
      status: 'Delivered' // Only count delivered orders
    }).lean();

    let deliveredQty = 0;
    deliveredOrders.forEach(order => {
      order.products.forEach(product => {
        if (product.product.toString() === productId.toString() && 
            product.warehouse && product.warehouse.toString() === warehouseId.toString()) {
          deliveredQty += product.quantity || 0;
        }
      });
    });

    // Step 3: Calculate GRN Available = GRN IN - Delivered OUT
    const grnAvailableQty = Math.max(0, grnInQty - deliveredQty);

    return grnAvailableQty;
  } catch (error) {
    console.error(`Error calculating GRN available quantity for product ${productId} in warehouse ${warehouseId}:`, error);
    return 0;
  }
};

// Utility function to recalculate all stock balances
export const recalculateStockBalances = async (req, res) => {
  try {
    // Import StockMovementService
    const StockMovementService = (await import('../services/stockMovementService.js')).default;
    
    // Recalculate all balances
    await StockMovementService.recalculateBalances(req.dbConnection);
    
    res.json({
      success: true,
      message: 'Stock balances recalculated successfully'
    });
  } catch (error) {
    console.error('Error recalculating stock balances:', error);
    res.status(500).json({
      success: false,
      message: 'Error recalculating stock balances',
      error: error.message
    });
  }
};

export const getStock = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { StockMovement, Product, Warehouse, GRN } = getModels(req.dbConnection);
    
    const {
      page = 1,
      limit = 10,
      search = '',
      warehouseId,
      lowStockOnly = false,
      brandId,
      categoryId,
      subcategoryId,
      extendedSubcategoryId,
      level2Id
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build product query with search and hierarchical filters
    const productQuery = {};
    
    // Add search filter
    if (search) {
      productQuery.$or = [
        { productCode: { $regex: search, $options: 'i' } },
        { itemName: { $regex: search, $options: 'i' } },
        { HSNCode: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Add hierarchical filters
    if (brandId) {
      productQuery.brand = brandId;
    }
    
    if (categoryId) {
      productQuery.category = categoryId;
    }
    
    if (subcategoryId) {
      productQuery.subcategory = subcategoryId;
    }
    
    if (extendedSubcategoryId) {
      // Level 1 extended subcategories are stored in subcategory1 field
      productQuery.subcategory1 = extendedSubcategoryId;
    }
    
    if (level2Id) {
      // Level 2 extended subcategories are stored in subcategory2 field
      productQuery.subcategory2 = level2Id;
    }

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(productQuery);

    // Get paginated products
    const products = await Product.find(productQuery)
      .skip(skip)
      .limit(limitNum)
      .lean(); // Use lean() for better performance

    // Process products in parallel for better performance
    const stockPromises = products.map(async (product) => {
      // Get all warehouses that have this product (from GRNs OR stock movements)
      const grnQuery = { 'items.productId': product._id };
      const grns = await GRN.find(grnQuery)
        .populate('warehouseId', 'name address')
        .populate('supplierId', 'name');

      // ALSO get warehouses that have stock movements for this product (including manual adjustments)
      const stockMovements = await StockMovement.find({ productId: product._id })
        .lean();

      // Group by warehouse
      const warehouseStock = {};

      // First, process GRNs (existing logic)
      grns.forEach(grn => {
        if (!grn.warehouseId) {
          return;
        }
        
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
            weightedGSTSum: 0,
            totalAcceptedQty: 0,
            totalValue: 0,
            hasGRN: true,
            hasMovements: false
          };
        }
        
        // Check if items exist and are valid
        if (!grn.items || !Array.isArray(grn.items) || grn.items.length === 0) {
          return;
        }
        
        grn.items.forEach((item, index) => {
          // Handle both populated and non-populated productId
          const itemProductId = item.productId?._id ? item.productId._id.toString() : item.productId.toString();
          const targetProductId = product._id.toString();
          
          if (itemProductId === targetProductId) {
            warehouseStock[warehouseId].totalQty += item.acceptedQuantity || 0;
            // REMOVED: warehouseStock[warehouseId].damagedQty += item.damageQuantity || 0;
            // Damaged quantity will be calculated from stock movements (source of truth)
            warehouseStock[warehouseId].totalAcceptedQty += item.acceptedQuantity || 0;
            
            if (grn.supplierId) {
              warehouseStock[warehouseId].suppliers.add(grn.supplierId.name);
            }
            
            // Calculate weighted averages including GST
            const itemValue = (item.acceptedQuantity || 0) * (item.unitPrice || 0);
            warehouseStock[warehouseId].totalValue += itemValue;
            warehouseStock[warehouseId].weightedPriceSum += itemValue;
            
            // Calculate weighted GST average
            const itemGSTValue = (item.acceptedQuantity || 0) * (item.gst || 0);
            warehouseStock[warehouseId].weightedGSTSum += itemGSTValue;
          }
        });
      });

      // Second, process stock movements to find warehouses with manual adjustments or other movements
      const warehouseMovements = {};
      stockMovements.forEach(movement => {
        if (!movement.warehouseId) return;
        
        const warehouseId = movement.warehouseId.toString();
        
        if (!warehouseMovements[warehouseId]) {
          warehouseMovements[warehouseId] = {
            warehouseId: warehouseId,
            warehouseName: 'Unknown Warehouse', // Will be updated later
            movements: []
          };
        }
        warehouseMovements[warehouseId].movements.push(movement);
      });

      // Get warehouse names for movement-only warehouses
      const movementWarehouseIds = Object.keys(warehouseMovements);
      if (movementWarehouseIds.length > 0) {
        const warehouses = await Warehouse.find({ 
          _id: { $in: movementWarehouseIds } 
        }).select('_id name').lean();
        
        warehouses.forEach(warehouse => {
          const warehouseId = warehouse._id.toString();
          if (warehouseMovements[warehouseId]) {
            warehouseMovements[warehouseId].warehouseName = warehouse.name;
          }
        });
      }

      // Add warehouses that have movements but no GRNs
      Object.keys(warehouseMovements).forEach(warehouseId => {
        if (!warehouseStock[warehouseId]) {
          const warehouseMovement = warehouseMovements[warehouseId];
          warehouseStock[warehouseId] = {
            warehouseId: warehouseId,
            warehouseName: warehouseMovement.warehouseName,
            totalQty: 0,
            damagedQty: 0,
            suppliers: new Set(),
            weightedPriceSum: 0,
            weightedGSTSum: 0,
            totalAcceptedQty: 0,
            totalValue: 0,
            hasGRN: false,
            hasMovements: true
          };
        } else {
          warehouseStock[warehouseId].hasMovements = true;
        }
      });

      grns.forEach(grn => {
        if (!grn.warehouseId) {
          return;
        }
        
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
            weightedGSTSum: 0,
            totalAcceptedQty: 0,
            totalValue: 0
          };
        }
        
        // Check if items exist and are valid
        if (!grn.items || !Array.isArray(grn.items) || grn.items.length === 0) {
          return;
        }
        
        grn.items.forEach((item, index) => {
          // Handle both populated and non-populated productId
          const itemProductId = item.productId?._id ? item.productId._id.toString() : item.productId.toString();
          const targetProductId = product._id.toString();
          
          if (itemProductId === targetProductId) {
            warehouseStock[warehouseId].totalQty += item.acceptedQuantity || 0;
            // REMOVED: warehouseStock[warehouseId].damagedQty += item.damageQuantity || 0;
            // Damaged quantity will be calculated from stock movements (source of truth)
            warehouseStock[warehouseId].totalAcceptedQty += item.acceptedQuantity || 0;
            
            if (grn.supplierId) {
              warehouseStock[warehouseId].suppliers.add(grn.supplierId.name);
            }
            
            // Calculate weighted averages including GST
            const itemValue = (item.acceptedQuantity || 0) * (item.unitPrice || 0);
            warehouseStock[warehouseId].totalValue += itemValue;
            warehouseStock[warehouseId].weightedPriceSum += itemValue;
            
            // Calculate weighted GST average
            const itemGSTValue = (item.acceptedQuantity || 0) * (item.gst || 0);
            warehouseStock[warehouseId].weightedGSTSum += itemGSTValue;
          }
        });
      });

      // Now get current stock levels from stock movements for each warehouse
      for (const warehouseId of Object.keys(warehouseStock)) {
        try {
          const currentStock = await StockMovementService.getCurrentStock(product._id, warehouseId, req.dbConnection);
          
          // OPTIMIZED: Calculate blocked stock using aggregation
          // Only count movements with "Stock Blocked" and "Stock Unblocked" remarks
          // Only count movements with "Stock Blocked" and "Stock Unblocked" remarks
          const blockedResult = await StockMovement.aggregate([
            {
              $match: {
                productId: product._id,
                warehouseId: new mongoose.Types.ObjectId(warehouseId), // Convert string to ObjectId
                referenceType: 'SALE',
                remarks: { $regex: /Stock (Blocked|Unblocked)/ } // Only count block/unblock movements
              }
            },
            {
              $group: {
                _id: '$type',
                totalQuantity: { $sum: '$quantity' }
              }
            }
          ]);
          
          let blockedQty = 0;
          blockedResult.forEach(result => {
            if (result._id === 'OUT') {
              blockedQty += result.totalQuantity; // Stock Blocked movements
            } else if (result._id === 'IN') {
              blockedQty -= result.totalQuantity; // Stock Unblocked movements
            }
          });
          
          blockedQty = Math.max(0, blockedQty); // Ensure blocked quantity is not negative
          
          // FIXED: Calculate damaged quantity from stock movements (source of truth)
          const damagedQty = await calculateDamagedQuantity(req.dbConnection, product._id, warehouseId);
          // NEW: Calculate GRN Available Quantity (GRN IN - Only Delivered OUT)
          // This shows physical stock from GRN minus only delivered orders
          const grnAvailableQty = await calculateGRNAvailableQuantity(req.dbConnection, product._id, warehouseId);
          // Update the warehouse stock with current stock from movements
          warehouseStock[warehouseId].currentStock = currentStock;
          warehouseStock[warehouseId].blockedQty = blockedQty;
          warehouseStock[warehouseId].damagedQty = damagedQty; // Override with correct value from movements
          warehouseStock[warehouseId].grnAvailableQty = grnAvailableQty; // NEW: GRN-based available quantity
        } catch (error) {
          console.error(`Error getting current stock for product ${product.productCode} in warehouse ${warehouseId}:`, error);
          warehouseStock[warehouseId].currentStock = warehouseStock[warehouseId].totalQty;
          warehouseStock[warehouseId].blockedQty = 0;
          warehouseStock[warehouseId].grnAvailableQty = 0;
        }
      }

      // Create separate stock entries for each warehouse
      const warehouseEntries = [];
      
      // If product has stock in warehouses, create entries for each
      if (Object.keys(warehouseStock).length > 0) {
        Object.values(warehouseStock).forEach(warehouse => {
          // Apply warehouse filter if specified
          if (warehouseId && warehouse.warehouseId !== warehouseId) {
            return;
          }

          const averageUnitPrice = warehouse.totalAcceptedQty > 0 ? warehouse.weightedPriceSum / warehouse.totalAcceptedQty : 0;
          const averageGST = warehouse.totalAcceptedQty > 0 ? warehouse.weightedGSTSum / warehouse.totalAcceptedQty : 0;
          const blockedQty = warehouse.blockedQty || 0; // Use calculated blocked quantity
          
          // FIXED: Use current stock from movements as the actual available quantity
          // Current stock already accounts for:
          // 1. Damaged items (they are OUT movements in GRN processing)
          // 2. Blocked stock (already deducted when order confirmed)
          // Therefore, currentStock IS the net available stock - no further deductions needed
          const currentStock = warehouse.currentStock !== undefined ? warehouse.currentStock : warehouse.totalQty;
          const netStock = currentStock; // Net stock = current stock (blocking already applied)

          // Skip if lowStockOnly is true and stock is not low
          if (lowStockOnly && (!product.minStockLevel || netStock > product.minStockLevel)) {
            return;
          }

          const stockEntry = {
            productId: product._id,
            productCode: product.productCode,
            hsnCode: product.HSNCode,
            itemName: product.itemName,
            description: product.description,
            supplier: Array.from(warehouse.suppliers).join(', '),
            supplierId: product.supplier,
            warehouse: warehouse.warehouseName,
            warehouseId: warehouse.warehouseId,
            basePrice: averageUnitPrice,
            gst: averageGST,
            totalPrice: currentStock * averageUnitPrice,
            totalQty: currentStock,
            damagedQty: warehouse.damagedQty,
            blockedQty: blockedQty,
            grnAvailableQty: warehouse.grnAvailableQty || 0,
            netStock,
            minStockLevel: product.minStockLevel
          };
          
          warehouseEntries.push(stockEntry);
        });
      } else {
        // NEW: If product has NO stock in any warehouse, still show it with zero stock
        // This ensures ALL products from Product Master are visible
        
        // If warehouse filter is specified, create entry for that warehouse only
        // Otherwise, create a single entry showing the product exists but has no stock
        if (warehouseId) {
          // Get the specific warehouse details
          const warehouse = await Warehouse.findById(warehouseId).lean();
          if (warehouse) {
            const stockEntry = {
              productId: product._id,
              productCode: product.productCode,
              hsnCode: product.HSNCode,
              itemName: product.itemName,
              description: product.description,
              supplier: '', // No supplier yet
              supplierId: product.supplier, // Add supplier ID from product
              warehouse: warehouse.name,
              warehouseId: warehouse._id.toString(),
              basePrice: product.basePrice || 0,
              gst: product.gst || 0,
              totalPrice: 0,
              totalQty: 0,
              damagedQty: 0,
              blockedQty: 0,
              netStock: 0,
              minStockLevel: product.minStockLevel
            };
            warehouseEntries.push(stockEntry);
          }
        } else {
          // No warehouse filter - show product with "No Stock" indicator
          const stockEntry = {
            productId: product._id,
            productCode: product.productCode,
            hsnCode: product.HSNCode,
            itemName: product.itemName,
            description: product.description,
            supplier: '', // No supplier yet
            supplierId: product.supplier, // Add supplier ID from product
            warehouse: 'No Stock',
            warehouseId: null,
            basePrice: product.basePrice || 0,
            gst: product.gst || 0,
            totalPrice: 0,
            totalQty: 0,
            damagedQty: 0,
            blockedQty: 0,
            netStock: 0,
            minStockLevel: product.minStockLevel
          };
          warehouseEntries.push(stockEntry);
        }
      }
      
      return warehouseEntries;
    });

    // Wait for all products to be processed
    const allStockEntries = await Promise.all(stockPromises);
    const stockData = allStockEntries.flat().filter(entry => entry); // Flatten and remove nulls

    res.json({
      success: true,
      data: stockData,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalProducts / limitNum),
        totalRecords: totalProducts,
        hasNextPage: pageNum < Math.ceil(totalProducts / limitNum),
        hasPrevPage: pageNum > 1,
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
    // Get models from company-specific connection
    const { StockMovement } = getModels(req.dbConnection);
    
    const { productId } = req.params;
    const { page = 1, limit = 10, warehouseId } = req.query;

    // Use StockMovementService to get stock history
    const result = await StockMovementService.getStockHistory(productId, {
      page,
      limit,
      warehouseId
    }, req.dbConnection);

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
  // Start a MongoDB session for transaction support
  const session = await req.dbConnection.startSession();
  
  try {
    // Start transaction
    await session.startTransaction();
    
    const {
      fromWarehouse,
      toWarehouse,
      items,
      transferDate,
      notes,
      status = 'pending'
    } = req.body;

    // Validate stock availability before transfer
    for (const item of items) {
      const validation = await StockMovementService.validateStockAvailability(
        item.productId, 
        fromWarehouse, 
        item.quantity,
        req.dbConnection
      );
      
      if (!validation.isAvailable) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product ${item.productId}. Available: ${validation.availableStock}, Required: ${item.quantity}, Shortfall: ${validation.shortfall}`
        });
      }
    }

    // Generate transfer ID
    const transferId = `TRF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Create stock movements for each item with proper balance calculation
    const movements = [];
    
    for (const item of items) {
      // Calculate balance for OUT movement from source warehouse
      const outBalance = await StockMovementService.calculateRunningBalance(
        item.productId, 
        fromWarehouse, 
        -item.quantity,
        null,
        req.dbConnection
      );
      
      // OUT movement from source warehouse
      const outMovement = new StockMovement({
        productId: item.productId,
        warehouseId: fromWarehouse,
        type: 'OUT',
        quantity: item.quantity,
        balance: outBalance,
        referenceNo: transferId,
        referenceType: 'TRANSFER',
        date: new Date(transferDate),
        remarks: `Transfer to ${toWarehouse} - ${item.quantity} units`,
        createdBy: req.user._id
      });

      // Calculate balance for IN movement to destination warehouse
      const inBalance = await StockMovementService.calculateRunningBalance(
        item.productId, 
        toWarehouse, 
        item.quantity,
        null,
        req.dbConnection
      );

      // IN movement to destination warehouse
      const inMovement = new StockMovement({
        productId: item.productId,
        warehouseId: toWarehouse,
        type: 'IN',
        quantity: item.quantity,
        balance: inBalance,
        referenceNo: transferId,
        referenceType: 'TRANSFER',
        date: new Date(transferDate),
        remarks: `Transfer from ${fromWarehouse} - ${item.quantity} units`,
        createdBy: req.user._id
      });

      movements.push(outMovement, inMovement);
    }

    // Save all movements within transaction
    await StockMovement.insertMany(movements, { session });
    
    // Commit transaction
    await session.commitTransaction();
    
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
    // Rollback transaction on error
    await session.abortTransaction();
    console.error('Create stock transfer error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    // End session
    session.endSession();
  }
};

export const getStockTransfers = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { StockMovement } = getModels(req.dbConnection);
    
    const { page = 1, limit = 10, status } = req.query;

    // Get all transfer movements grouped by reference number
    const query = { referenceType: 'TRANSFER' };
    if (status) {
      query.status = status;
    }

    const movements = await StockMovement.find(query)
      .populate('productId', 'productCode itemName HSNCode rateSlabs')
      .populate('warehouseId', 'name address')
      .populate('createdBy', 'name')
      .sort({ date: -1 });

    // Group by transfer ID
    const transfers = {};
    movements.forEach(movement => {
      if (!transfers[movement.referenceNo]) {
        transfers[movement.referenceNo] = {
          id: movement.referenceNo,
          stockId: movement.referenceNo,
          transferId: movement.referenceNo,
          transferDate: movement.date,
          date: movement.date,
          status: 'completed',
          items: [],
          totalItems: 0,
          fromWarehouse: null,
          toWarehouse: null,
          createdBy: movement.createdBy
        };
      }

      if (movement.type === 'OUT') {
        transfers[movement.referenceNo].fromWarehouse = movement.warehouseId._id || movement.warehouseId;
      } else if (movement.type === 'IN') {
        transfers[movement.referenceNo].toWarehouse = movement.warehouseId._id || movement.warehouseId;
      }

      // Only count OUT movements for total items (since IN and OUT are paired)
      if (movement.type === 'OUT') {
        transfers[movement.referenceNo].totalItems += movement.quantity;
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
    const { Warehouse } = getModels(req.dbConnection);
    const { search, status } = req.query;
    
    // Build query
    let query = {};
    
    // Add search filter
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { 'contact.managerName': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Add status filter
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const warehouses = await Warehouse.find(query)
      .populate('region', 'name code')
      .select('code name address contact status region')
      .sort({ createdAt: -1 });
    
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

// Test endpoint to verify stock separation by warehouse
export const testStockSeparation = async (req, res) => {
  try {
    console.log(`🧪 [TEST] Testing stock separation by warehouse`);
    
    // Get a sample product
    const product = await Product.findOne({});
    if (!product) {
      return res.json({
        success: false,
        message: 'No products found'
      });
    }

    // Get GRNs for this product
    const grns = await GRN.find({ 'items.productId': product._id })
      .populate('warehouseId', 'name')
      .populate('supplierId', 'name');

    console.log(`🧪 [TEST] Found ${grns.length} GRNs for product ${product.productCode}`);

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
          grns: []
        };
      }
      
      grn.items.forEach(item => {
        if (item.productId.toString() === product._id.toString()) {
          warehouseStock[warehouseId].totalQty += item.acceptedQuantity || 0;
          warehouseStock[warehouseId].grns.push({
            grnNo: grn.grnNo,
            quantity: item.acceptedQuantity,
            date: grn.grnDate
          });
        }
      });
    });
    
    res.json({
      success: true,
      message: 'Stock separation test completed',
      data: {
        product: {
          productCode: product.productCode,
          itemName: product.itemName
        },
        warehouses: Object.values(warehouseStock),
        totalWarehouses: Object.keys(warehouseStock).length
      }
    });
  } catch (error) {
    console.error('Test stock separation error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const migrateStockMovements = async (req, res) => {
  try {
    console.log(`🔄 [MIGRATION] Starting stock movements migration`);
    
    // This is a placeholder migration function
    // In a real scenario, this would migrate data from old system to new stock movement system
    
    res.json({
      success: true,
      message: 'Stock movements migration completed (placeholder)',
      data: {
        migrated: 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Migrate stock movements error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const forceCreateStockMovements = async (req, res) => {
  try {
    console.log(`🔄 [FORCE_MIGRATION] Starting forced stock movements creation`);
    
    // This is a placeholder function for forced migration
    // In a real scenario, this would force create stock movements from GRN data
    
    res.json({
      success: true,
      message: 'Forced stock movements creation completed (placeholder)',
      data: {
        created: 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Force create stock movements error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const debugProductGRNs = async (req, res) => {
  try {
    const { productId } = req.params;
    console.log(`🔍 [DEBUG] Getting GRN details for product: ${productId}`);

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const grns = await GRN.find({ 'items.productId': productId })
      .populate('warehouseId', 'name')
      .populate('supplierId', 'name')
      .populate('items.productId', 'productCode itemName');

    console.log(`🔍 [DEBUG] Found ${grns.length} GRNs for product ${product.productCode}`);
    
    res.json({
      success: true,
      data: {
        product: {
          productCode: product.productCode,
          itemName: product.itemName,
          HSNCode: product.HSNCode
        },
        grns: grns.map(grn => ({
          grnNo: grn.grnNo,
          grnDate: grn.grnDate,
          warehouse: grn.warehouseId?.name || 'No Warehouse',
          supplier: grn.supplierId?.name || 'No Supplier',
          items: grn.items.filter(item => item.productId.toString() === productId).map(item => ({
            unitPrice: item.unitPrice,
            gst: item.gst,
            totalPrice: item.totalPrice,
            acceptedQuantity: item.acceptedQuantity,
            damageQuantity: item.damageQuantity
          }))
        }))
      }
    });
  } catch (error) {
    console.error('Debug product GRNs error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Simple test endpoint to debug GRN structure
export const testGRNStructure = async (req, res) => {
  try {
    console.log(`🧪 [TEST] Testing GRN structure`);
    
    // Get a single GRN to test
    const grn = await GRN.findOne({})
      .populate('warehouseId', 'name')
      .populate('supplierId', 'name');
    
    if (!grn) {
      return res.json({
        success: false,
        message: 'No GRNs found'
      });
    }

    console.log(`🧪 [TEST] Found GRN: ${grn.grnNo}`);
    console.log(`🧪 [TEST] GRN items length: ${grn.items?.length || 0}`);
    console.log(`🧪 [TEST] GRN items:`, grn.items);

    res.json({
      success: true,
      data: {
        grnNo: grn.grnNo,
        warehouse: grn.warehouseId?.name,
        supplier: grn.supplierId?.name,
        itemsCount: grn.items?.length || 0,
        items: grn.items?.map(item => ({
          productId: item.productId,
          productIdType: typeof item.productId,
          productIdString: item.productId?.toString(),
          acceptedQuantity: item.acceptedQuantity,
          damageQuantity: item.damageQuantity,
          unitPrice: item.unitPrice
        })) || []
      }
    });
  } catch (error) {
    console.error('Test GRN structure error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Debug endpoint to test stock calculation for specific product
export const debugStockCalculation = async (req, res) => {
  try {
    const { Product, GRN } = getModels(req.dbConnection);
    const { productId } = req.params;
    console.log(`🔍 [DEBUG_STOCK] Testing stock calculation for product: ${productId}`);

    // Get the product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get GRNs for this product
    const grns = await GRN.find({ 'items.productId': productId })
      .populate('warehouseId', 'name')
      .populate('supplierId', 'name')
      .populate('items.productId', 'productCode itemName');

    console.log(`🔍 [DEBUG_STOCK] Found ${grns.length} GRNs for product ${product.productCode}`);

    // Group by warehouse
    const warehouseStock = {};
    
    grns.forEach(grn => {
      if (!grn.warehouseId) {
        console.log(`⚠️ [DEBUG_STOCK] GRN ${grn.grnNo} has no warehouseId`);
        return;
      }
      
      const warehouseId = grn.warehouseId._id.toString();
      const warehouseName = grn.warehouseId.name;
      
      console.log(`🔍 [DEBUG_STOCK] Processing GRN ${grn.grnNo} for warehouse: ${warehouseName} (${warehouseId})`);
      
      if (!warehouseStock[warehouseId]) {
        warehouseStock[warehouseId] = {
          warehouseId: warehouseId,
          warehouseName: warehouseName,
          totalQty: 0,
          damagedQty: 0,
          suppliers: new Set(),
          weightedPriceSum: 0,
          totalAcceptedQty: 0,
          totalValue: 0,
          grns: []
        };
      }
      
      grn.items.forEach(item => {
        if (item.productId.toString() === productId) {
          console.log(`🔍 [DEBUG_STOCK] Processing item:`, {
            acceptedQuantity: item.acceptedQuantity,
            damageQuantity: item.damageQuantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            gst: item.gst
          });
          
          warehouseStock[warehouseId].totalQty += item.acceptedQuantity || 0;
          // REMOVED: warehouseStock[warehouseId].damagedQty += item.damageQuantity || 0;
          // Damaged quantity will be calculated from stock movements (source of truth)
          warehouseStock[warehouseId].totalAcceptedQty += item.acceptedQuantity || 0;
          
          if (grn.supplierId) {
            warehouseStock[warehouseId].suppliers.add(grn.supplierId.name);
          }
          
          // Calculate weighted averages
          const itemValue = (item.acceptedQuantity || 0) * (item.unitPrice || 0);
          warehouseStock[warehouseId].totalValue += itemValue;
          warehouseStock[warehouseId].weightedPriceSum += itemValue;
          
          warehouseStock[warehouseId].grns.push({
            grnNo: grn.grnNo,
            acceptedQuantity: item.acceptedQuantity,
            damageQuantity: item.damageQuantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice
          });
        }
      });
    });

    // Calculate damaged quantity from stock movements for each warehouse
    for (const warehouseId of Object.keys(warehouseStock)) {
      const damagedQty = await calculateDamagedQuantity(req.dbConnection, product._id, warehouseId);
      warehouseStock[warehouseId].damagedQty = damagedQty;
    }

    // Calculate final values
    const finalWarehouses = Object.values(warehouseStock).map(warehouse => {
      const averageUnitPrice = warehouse.totalAcceptedQty > 0 ? warehouse.weightedPriceSum / warehouse.totalAcceptedQty : 0;
      const blockedQty = 0;
      const netStock = warehouse.totalQty - warehouse.damagedQty - blockedQty;

      return {
        warehouseId: warehouse.warehouseId,
        warehouseName: warehouse.warehouseName,
        totalQty: warehouse.totalQty,
        damagedQty: warehouse.damagedQty,
        blockedQty,
        netStock,
        averageUnitPrice,
        totalValue: warehouse.totalValue,
        suppliers: Array.from(warehouse.suppliers),
        grns: warehouse.grns
      };
    });
    
    res.json({
      success: true,
      data: {
        product: {
          productCode: product.productCode,
          itemName: product.itemName,
          HSNCode: product.HSNCode
        },
        warehouses: finalWarehouses,
        totalWarehouses: finalWarehouses.length
      }
    });
  } catch (error) {
    console.error('Debug stock calculation error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Debug endpoint to check stock movements for a specific product-warehouse combination
export const debugStockMovements = async (req, res) => {
  try {
    const { productId, warehouseId } = req.params;
    
    console.log(`🔍 [DEBUG_STOCK_MOVEMENTS] Checking movements for product: ${productId}, warehouse: ${warehouseId}`);
    
    // Get all movements for this product-warehouse combination
    const movements = await StockMovement.find({
      productId,
      warehouseId
    })
    .populate('productId', 'productCode itemName')
    .populate('warehouseId', 'name')
    .sort({ date: 1, createdAt: 1 });
    
    // Get current stock from service
    const currentStock = await StockMovementService.getCurrentStock(productId, warehouseId, req.dbConnection);
    
    // Get GRN data for this product-warehouse
    const grns = await GRN.find({
      'items.productId': productId,
      warehouseId
    })
    .populate('warehouseId', 'name')
    .populate('supplierId', 'name');
    
    let grnTotalQty = 0;
    grns.forEach(grn => {
      grn.items.forEach(item => {
        if (item.productId.toString() === productId) {
          grnTotalQty += item.acceptedQuantity || 0;
        }
      });
    });
    
    res.json({
      success: true,
      data: {
        productId,
        warehouseId,
        movements: movements.map(m => ({
          type: m.type,
          quantity: m.quantity,
          balance: m.balance,
          referenceNo: m.referenceNo,
          referenceType: m.referenceType,
          date: m.date,
          remarks: m.remarks
        })),
        currentStockFromMovements: currentStock,
        grnTotalQty,
        difference: currentStock - grnTotalQty,
        movementsCount: movements.length,
        grnsCount: grns.length
      }
    });
  } catch (error) {
    console.error('Debug stock movements error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Debug endpoint to check warehouse data structure
export const debugWarehouses = async (req, res) => {
  try {
    const { Warehouse } = getModels(req.dbConnection);
    const warehouses = await Warehouse.find({}).select('name address');
    
    res.json({
      success: true,
      data: warehouses.map(wh => ({
        _id: wh._id,
        name: wh.name,
        address: wh.address,
        hasCity: !!wh.address?.city,
        hasState: !!wh.address?.state,
        city: wh.address?.city || 'No city',
        state: wh.address?.state || 'No state'
      }))
    });
  } catch (error) {
    console.error('Debug warehouses error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Debug endpoint to check transfer data structure
export const debugTransfers = async (req, res) => {
  try {
    const { limit = 2 } = req.query;
    
    const movements = await StockMovement.find({ referenceType: 'TRANSFER' })
      .populate('productId', 'productCode itemName HSNCode rateSlabs')
      .populate('warehouseId', 'name address')
      .sort({ date: -1 })
      .limit(parseInt(limit) * 2); // Get more to see grouping

    // Group by transfer ID
    const transfers = {};
    movements.forEach(movement => {
      if (!transfers[movement.referenceNo]) {
        transfers[movement.referenceNo] = {
          id: movement.referenceNo,
          stockId: movement.referenceNo,
          transferDate: movement.date,
          status: 'completed',
          items: [],
          totalItems: 0,
          fromWarehouse: null,
          toWarehouse: null
        };
      }

      if (movement.type === 'OUT') {
        transfers[movement.referenceNo].fromWarehouse = movement.warehouseId._id || movement.warehouseId;
      } else if (movement.type === 'IN') {
        transfers[movement.referenceNo].toWarehouse = movement.warehouseId._id || movement.warehouseId;
      }

      if (movement.type === 'OUT') {
        transfers[movement.referenceNo].totalItems += movement.quantity;
      }

      transfers[movement.referenceNo].items.push({
        productId: movement.productId,
        quantity: movement.quantity,
        type: movement.type,
        warehouse: movement.warehouseId
      });
    });

    const transferList = Object.values(transfers).slice(0, parseInt(limit));

    res.json({
      success: true,
      data: transferList,
      debug: {
        totalMovements: movements.length,
        totalTransfers: Object.keys(transfers).length,
        sampleMovement: movements[0] ? {
          _id: movements[0]._id,
          productId: movements[0].productId,
          warehouseId: movements[0].warehouseId,
          type: movements[0].type,
          quantity: movements[0].quantity,
          referenceNo: movements[0].referenceNo
        } : null
      }
    });
  } catch (error) {
    console.error('Debug transfers error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getStockAlerts = async (req, res) => {
  try {
    const { GRN, Product } = getModels(req.dbConnection);
    
    const { page = 1, limit = 10 } = req.query;

    // Get all products with minStockLevel > 0
    const productsWithMin = await Product.find(
      { minStockLevel: { $gt: 0 } },
      { _id: 1, itemName: 1, productCode: 1, minStockLevel: 1 }
    ).lean();

    if (productsWithMin.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { currentPage: 1, totalPages: 0, totalRecords: 0 }
      });
    }

    const productIds = productsWithMin.map(p => p._id);

    // Get GRN stock totals per product (across all warehouses)
    const stockAgg = await GRN.aggregate([
      { $unwind: "$items" },
      { $match: { "items.productId": { $in: productIds } } },
      {
        $group: {
          _id: "$items.productId",
          totalQty: { $sum: "$items.acceptedQuantity" },
          damagedQty: { $sum: "$items.damageQuantity" }
        }
      }
    ]);

    // Build stock map
    const stockMap = {};
    stockAgg.forEach(item => {
      if (item._id) {
        stockMap[item._id.toString()] = Math.max(0, (item.totalQty || 0) - (item.damagedQty || 0));
      }
    });

    // Build low stock items list
    const lowStockItems = productsWithMin
      .map(product => {
        const currentStock = stockMap[product._id.toString()] ?? 0;
        const shortage = product.minStockLevel - currentStock;
        return {
          productId: product._id,
          productCode: product.productCode,
          itemName: product.itemName,
          currentStock,
          minStockLevel: product.minStockLevel,
          shortage
        };
      })
      .filter(item => item.currentStock <= item.minStockLevel)
      .sort((a, b) => b.shortage - a.shortage);

    // Pagination
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
