import mongoose from 'mongoose';
import { stockMovementSchema, stockMutationLockSchema } from '../models/Stock.js';
import { grnSchema } from '../models/GRN.js';
import { salesOrderSchema } from '../models/SalesOrder.js';

const getModels = (dbConnection) => {
  if (!dbConnection) {
    throw new Error('dbConnection is required for transactional stock operations');
  }
  return {
    StockMovement: dbConnection.models.StockMovement || dbConnection.model('StockMovement', stockMovementSchema),
    StockMutationLock: dbConnection.models.StockMutationLock
      || dbConnection.model('StockMutationLock', stockMutationLockSchema),
    GRN: dbConnection.models.GRN || dbConnection.model('GRN', grnSchema),
    SalesOrder: dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema)
  };
};

const stockKey = (productId, warehouseId) => `${productId}:${warehouseId}`;

class StockMovementService {
  static stockKey(productId, warehouseId) {
    if (!productId || !warehouseId) {
      throw new Error('Both productId and warehouseId are required for a stock key');
    }
    return stockKey(productId, warehouseId);
  }

  static async acquireStockLocks(dbConnection, keys, session) {
    if (!session) throw new Error('A MongoDB session is required to acquire stock locks');
    const { StockMutationLock } = getModels(dbConnection);
    const normalizedKeys = [...new Set((keys || []).filter(Boolean).map(String))].sort();

    for (const key of normalizedKeys) {
      await StockMutationLock.findOneAndUpdate(
        { _id: key },
        { $inc: { version: 1 }, $setOnInsert: { key } },
        { upsert: true, new: true, session, setDefaultsOnInsert: true }
      );
    }
    return normalizedKeys;
  }

  static async acquireStockLeases(
    dbConnection,
    keys,
    { leaseMs = 300000, waitMs = 15000, retryMs = 50 } = {}
  ) {
    const { StockMutationLock } = getModels(dbConnection);
    const normalizedKeys = [...new Set((keys || []).filter(Boolean).map(String))].sort();
    const token = new mongoose.Types.ObjectId().toString();
    const acquiredKeys = [];
    const deadline = Date.now() + waitMs;

    try {
      for (const key of normalizedKeys) {
        let acquired = false;
        while (!acquired && Date.now() < deadline) {
          const now = new Date();
          const leaseExpiresAt = new Date(now.getTime() + leaseMs);
          let lock = await StockMutationLock.findOneAndUpdate(
            {
              _id: key,
              $or: [
                { leaseToken: null },
                { leaseExpiresAt: { $lte: now } },
                { leaseExpiresAt: null }
              ]
            },
            { $set: { leaseToken: token, leaseExpiresAt }, $inc: { version: 1 } },
            { new: true }
          );

          if (!lock) {
            try {
              lock = await StockMutationLock.create({
                _id: key,
                key,
                version: 1,
                leaseToken: token,
                leaseExpiresAt
              });
            } catch (error) {
              if (error?.code !== 11000) throw error;
            }
          }

          acquired = lock?.leaseToken === token;
          if (!acquired) await new Promise((resolve) => setTimeout(resolve, retryMs));
        }

        if (!acquired) {
          const error = new Error(`Timed out waiting for stock operation lock ${key}`);
          error.statusCode = 409;
          error.code = 'STOCK_OPERATION_BUSY';
          throw error;
        }
        acquiredKeys.push(key);
      }
      return { token, keys: acquiredKeys };
    } catch (error) {
      if (acquiredKeys.length > 0) {
        await StockMutationLock.updateMany(
          { _id: { $in: acquiredKeys }, leaseToken: token },
          { $set: { leaseToken: null, leaseExpiresAt: null } }
        );
      }
      throw error;
    }
  }

  static async releaseStockLeases(dbConnection, lease) {
    if (!lease?.token || !lease?.keys?.length) return;
    const { StockMutationLock } = getModels(dbConnection);
    await StockMutationLock.updateMany(
      { _id: { $in: lease.keys }, leaseToken: lease.token },
      { $set: { leaseToken: null, leaseExpiresAt: null } }
    );
  }

  static async appendMovements(movements, { dbConnection, session, locksAcquired = false } = {}) {
    if (!dbConnection) throw new Error('dbConnection is required to append stock movements');
    if (!session) throw new Error('A MongoDB session is required to append stock movements');
    if (!Array.isArray(movements) || movements.length === 0) return [];

    const { StockMovement } = getModels(dbConnection);
    const keys = movements.map((movement) => this.stockKey(
      movement.productId,
      movement.warehouseId
    ));
    if (!locksAcquired) await this.acquireStockLocks(dbConnection, keys, session);

    const operationKeys = movements.map((movement) => movement.operationKey).filter(Boolean);
    const existingKeys = operationKeys.length > 0
      ? new Set((await StockMovement.find({ operationKey: { $in: operationKeys } })
        .select('operationKey')
        .session(session)
        .lean()).map((movement) => movement.operationKey))
      : new Set();

    const balances = new Map();
    const documents = [];
    for (const movement of movements) {
      if (movement.operationKey && existingKeys.has(movement.operationKey)) continue;
      const key = this.stockKey(movement.productId, movement.warehouseId);
      let currentBalance = balances.get(key);
      if (currentBalance == null) {
        currentBalance = await this.getCurrentStock(
          movement.productId,
          movement.warehouseId,
          dbConnection,
          session
        );
      }
      const quantity = Number(movement.quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Stock movement quantity must be positive for ${key}`);
      }
      const nextBalance = movement.type === 'IN'
        ? currentBalance + quantity
        : currentBalance - quantity;
      balances.set(key, nextBalance);
      documents.push({ ...movement, balance: nextBalance });
    }

    if (documents.length === 0) return [];
    return StockMovement.insertMany(documents, { session });
  }
  /**
   * Create stock movement entries for a GRN
   * @param {Object} grn - The GRN document
   * @param {Boolean} isMigration - Whether this is a migration operation
   * @param {Object} session - MongoDB session for transactions
   * @param {Object} dbConnection - Database connection for multi-database support
   */
  static async createStockMovementsFromGRN(grn, isMigration = false, session = null, dbConnection = null) {
    try {
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Creating stock movements for GRN: ${grn.grnNo}`);
      
      const { StockMovement } = dbConnection ? getModels(dbConnection) : { StockMovement: (await import('../models/Stock.js')).default };
      
      const movements = [];
      
      for (const item of grn.items) {
        // Create IN movement for accepted quantity
        if (item.acceptedQuantity > 0) {
          const inMovement = {
            productId: item.productId,
            warehouseId: grn.warehouseId,
            type: 'IN',
            quantity: item.acceptedQuantity,
            // appendMovements derives the authoritative post-movement balance.
            // Migration retains a temporary value and recalculates afterwards.
            balance: item.acceptedQuantity,
            referenceNo: grn.grnNo,
            referenceType: 'GRN',
            operationKey: grn._id && item._id
              ? `GRN:${grn._id}:RECEIPT:${item._id}`
              : null,
            movementRole: 'RECEIPT',
            date: grn.grnDate,
            remarks: `GRN: ${grn.grnNo} - Accepted Quantity`,
            createdBy: grn.createdBy
          };

          movements.push(inMovement);
          console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Created IN movement: ${item.acceptedQuantity} units for product ${item.productId}`);
        }
        
        // Damaged quantity is NOT added to stock movements
        // It's tracked in GRN for record-keeping and displayed separately
        // Only accepted quantity affects usable stock balance
      }
      
      // Save all movements with session support
      if (movements.length > 0) {
        if (!isMigration && session && dbConnection) {
          await this.appendMovements(movements, { dbConnection, session });
        } else if (session) {
          await StockMovement.insertMany(movements, { session });
        } else {
          await StockMovement.insertMany(movements);
        }
        console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Successfully created ${movements.length} stock movements for GRN: ${grn.grnNo}`);
      }
      
      return movements;
    } catch (error) {
      console.error('Error creating stock movements from GRN:', error);
      throw error;
    }
  }
  
  /**
   * Delete stock movements for a specific GRN
   * @param {String} grnId - GRN ID
   * @param {Object} dbConnection - Database connection for multi-database support
   */
  static async deleteStockMovementsForGRN(grnId, dbConnection = null) {
    try {
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Deleting stock movements for GRN: ${grnId}`);
      
      // Get the GRN to find its GRN number
      const { GRN, StockMovement } = dbConnection ? getModels(dbConnection) : { 
        GRN: (await import('../models/GRN.js')).default,
        StockMovement: (await import('../models/Stock.js')).default
      };
      const grn = await GRN.findById(grnId);
      
      if (!grn) {
        console.log(`🔍 [STOCK_MOVEMENT_SERVICE] GRN not found: ${grnId}`);
        return;
      }
      
      // Delete all stock movements with this GRN reference
      const result = await StockMovement.deleteMany({
        referenceNo: grn.grnNo,
        referenceType: 'GRN'
      });
      
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Deleted ${result.deletedCount} stock movements for GRN: ${grn.grnNo}`);
      
      return result.deletedCount;
    } catch (error) {
      console.error('Error deleting stock movements for GRN:', error);
      throw error;
    }
  }

  /**
   * Calculate running balance for a product in a warehouse
   * @param {String} productId - Product ID
   * @param {String} warehouseId - Warehouse ID
   * @param {Number} additionalQuantity - Additional quantity to add/subtract
   * @param {Object} session - MongoDB session for transactions
   * @param {Object} dbConnection - Database connection for multi-database support
   * @returns {Number} - New running balance
   */
  static async calculateRunningBalance(productId, warehouseId, additionalQuantity = 0, session = null, dbConnection = null) {
    try {
      const currentBalance = await this.getCurrentStock(
        productId,
        warehouseId,
        dbConnection,
        session
      );
      const newBalance = currentBalance + Number(additionalQuantity || 0);

      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Calculated balance for product ${productId} in warehouse ${warehouseId}: ${currentBalance} + ${additionalQuantity} = ${newBalance}`);

      return newBalance;
    } catch (error) {
      console.error('Error calculating running balance:', error);
      throw error;
    }
  }
  
  /**
   * Get stock movement history for a product
   * @param {String} productId - Product ID
   * @param {Object} options - Query options
   * @param {Object} dbConnection - Database connection for multi-database support
   * @returns {Array} - Array of stock movements
   */
  static async getStockHistory(productId, options = {}, dbConnection = null) {
    try {
      const { StockMovement, SalesOrder } = dbConnection ? getModels(dbConnection) : { 
        StockMovement: (await import('../models/Stock.js')).default,
        SalesOrder: (await import('../models/SalesOrder.js')).default
      };
      const {
        page = 1,
        limit = 10,
        warehouseId
      } = options;
      
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Getting stock history for product: ${productId}`);
      
      // Check movements for this specific product
      const query = { productId };
      if (warehouseId) {
        query.warehouseId = warehouseId;
      }
      
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Query:`, query);
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;
      
      const [movements, totalRecords] = await Promise.all([
        StockMovement.find(query)
          .populate('warehouseId', 'name')
          .populate('productId', 'productCode itemName')
          .sort({ date: -1, createdAt: -1 })
          .skip(skip)
          .limit(limitNum),
        StockMovement.countDocuments(query)
      ]);

      // Enrich SALE movements with dealer name
      const saleOrderNumbers = [...new Set(
        movements
          .filter(m => m.referenceType === 'SALE' && m.referenceNo)
          .map(m => m.referenceNo)
      )];

      let dealerByOrderNumber = {};
      if (saleOrderNumbers.length > 0) {
        const orders = await SalesOrder.find(
          { orderNumber: { $in: saleOrderNumbers } },
          'orderNumber dealer dealerName'
        ).populate('dealer', 'name');
        orders.forEach(o => {
          dealerByOrderNumber[o.orderNumber] =
            o.dealer?.name || o.dealerName || null;
        });
      }

      const enrichedMovements = movements.map(m => {
        const obj = m.toObject();
        if (m.referenceType === 'SALE' && m.referenceNo) {
          obj.dealerName = dealerByOrderNumber[m.referenceNo] || null;
        }
        return obj;
      });
      
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Found ${movements.length} movements for product ${productId}`);
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Total records for this product: ${totalRecords}`);
      
      return {
        movements: enrichedMovements,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalRecords / limitNum),
          totalRecords,
          hasNextPage: (pageNum * limitNum) < totalRecords,
          hasPrevPage: pageNum > 1,
          limit: limitNum
        }
      };
    } catch (error) {
      console.error('Error getting stock history:', error);
      throw error;
    }
  }
  
  /**
   * Get current stock level for a product in a warehouse
   * @param {String} productId - Product ID
   * @param {String} warehouseId - Warehouse ID
   * @param {Object} dbConnection - Database connection for multi-database support
   * @returns {Number} - Current stock level
   */
  static async getCurrentStock(productId, warehouseId, dbConnection = null, session = null) {
    if (!dbConnection) {
      throw new Error('dbConnection is required to read current stock');
    }
    if (!mongoose.isValidObjectId(productId) || !mongoose.isValidObjectId(warehouseId)) {
      throw new Error('Valid productId and warehouseId are required to read current stock');
    }

    const { StockMovement } = getModels(dbConnection);
    let aggregation = StockMovement.aggregate([
      {
        $match: {
          productId: new mongoose.Types.ObjectId(String(productId)),
          warehouseId: new mongoose.Types.ObjectId(String(warehouseId))
        }
      },
      {
        $group: {
          _id: null,
          inbound: {
            $sum: { $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', 0] }
          },
          outbound: {
            $sum: { $cond: [{ $eq: ['$type', 'OUT'] }, '$quantity', 0] }
          }
        }
      },
      { $project: { _id: 0, balance: { $subtract: ['$inbound', '$outbound'] } } }
    ]);
    if (session) aggregation = aggregation.session(session);
    const [result] = await aggregation;
    return Number(result?.balance || 0);
  }
  
  /**
   * Recalculate balances for all stock movements
   * @param {Object} dbConnection - Database connection for multi-database support
   */
  static async recalculateBalances(dbConnection = null) {
    try {
      const { StockMovement } = dbConnection ? getModels(dbConnection) : { StockMovement: (await import('../models/Stock.js')).default };
      console.log('🔍 [STOCK_MOVEMENT_SERVICE] Starting balance recalculation...');
      
      // Get all unique product-warehouse combinations
      const combinations = await StockMovement.aggregate([
        {
          $group: {
            _id: {
              productId: '$productId',
              warehouseId: '$warehouseId'
            }
          }
        }
      ]);
      
      for (const combo of combinations) {
        const productId = combo._id.productId;
        const warehouseId = combo._id.warehouseId;
        
        // Get all movements for this product-warehouse combination, sorted by date
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
          
          // Update the balance
          await StockMovement.findByIdAndUpdate(movement._id, { balance: runningBalance });
        }
        
        console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Recalculated balances for product ${productId} in warehouse ${warehouseId}: ${movements.length} movements`);
      }
      
      console.log('🔍 [STOCK_MOVEMENT_SERVICE] Balance recalculation completed');
    } catch (error) {
      console.error('Error recalculating balances:', error);
      throw error;
    }
  }

  /**
   * Validate if sufficient stock is available for an operation
   * @param {String} productId - Product ID
   * @param {String} warehouseId - Warehouse ID
   * @param {Number} requiredQuantity - Required quantity
   * @param {Object} dbConnection - Database connection for multi-database support
   * @returns {Object} - Validation result with available stock
   */
  static async validateStockAvailability(
    productId,
    warehouseId,
    requiredQuantity,
    dbConnection = null,
    session = null
  ) {
    const currentStock = await this.getCurrentStock(
      productId,
      warehouseId,
      dbConnection,
      session
    );
    // SALE reservation OUT movements are already included in currentStock. Do
    // not subtract them again or available stock is understated twice.
    const availableStock = currentStock;
    const required = Number(requiredQuantity || 0);
    const isAvailable = availableStock >= required;

    return {
      isAvailable,
      currentStock,
      blockedQty: 0,
      availableStock,
      requiredQuantity: required,
      shortfall: isAvailable ? 0 : required - availableStock
    };
  }

  /**
   * Debug function to check what GRNs exist for a product
   * @param {String} productId - Product ID
   * @param {Object} dbConnection - Database connection for multi-database support
   */
  static async debugProductGRNs(productId, dbConnection = null) {
    try {
      console.log(`🔍 [DEBUG] Checking GRNs for product: ${productId}`);
      
      // Import GRN model
      const { GRN } = dbConnection ? getModels(dbConnection) : { GRN: (await import('../models/GRN.js')).default };
      
      const grns = await GRN.find({ 'items.productId': productId })
        .populate('items.productId', 'productCode itemName')
        .populate('warehouseId', 'name')
        .sort({ grnDate: -1 });
      
      console.log(`🔍 [DEBUG] Found ${grns.length} GRNs for product ${productId}`);
      
      grns.forEach((grn, index) => {
        console.log(`🔍 [DEBUG] GRN ${index + 1}:`, {
          grnNo: grn.grnNo,
          grnDate: grn.grnDate,
          warehouse: grn.warehouseId?.name,
          items: grn.items.map(item => ({
            productId: item.productId._id,
            productCode: item.productId.productCode,
            acceptedQuantity: item.acceptedQuantity,
            damageQuantity: item.damageQuantity
          }))
        });
      });
      
      return grns;
    } catch (error) {
      console.error('Error debugging product GRNs:', error);
      throw error;
    }
  }

  /**
   * Migrate existing GRN data to stock movements
   * This is a one-time migration function
   * @param {Object} dbConnection - Database connection for multi-database support
   */
  static async migrateExistingGRNData(dbConnection = null) {
    try {
      const { StockMovement, GRN } = dbConnection ? getModels(dbConnection) : { 
        StockMovement: (await import('../models/Stock.js')).default,
        GRN: (await import('../models/GRN.js')).default
      };
      console.log('🔍 [STOCK_MOVEMENT_SERVICE] Starting migration of existing GRN data...');
      
      // Clear existing stock movements
      await StockMovement.deleteMany({});
      console.log('🔍 [STOCK_MOVEMENT_SERVICE] Cleared existing stock movements');
      
      // Get all GRNs sorted by date
      const grns = await GRN.find({})
        .populate('items.productId')
        .populate('warehouseId')
        .populate('createdBy')
        .sort({ grnDate: 1, createdAt: 1 });
      
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Found ${grns.length} GRNs to migrate`);
      
      let totalMovements = 0;
      
      for (const grn of grns) {
        console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Processing GRN: ${grn.grnNo} (${grn.items.length} items)`);
        const movements = await this.createStockMovementsFromGRN(grn, true); // Pass migration flag
        totalMovements += movements.length;
        console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Created ${movements.length} movements for GRN: ${grn.grnNo}`);
      }
      
      // Recalculate balances for all movements
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Recalculating balances...`);
      await this.recalculateBalances();
      
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Migration completed. Created ${totalMovements} stock movements from ${grns.length} GRNs`);
      
      return {
        success: true,
        message: `Successfully migrated ${grns.length} GRNs to ${totalMovements} stock movements`,
        grnsProcessed: grns.length,
        movementsCreated: totalMovements
      };
    } catch (error) {
      console.error('Error migrating GRN data:', error);
      throw error;
    }
  }
}

export default StockMovementService;
