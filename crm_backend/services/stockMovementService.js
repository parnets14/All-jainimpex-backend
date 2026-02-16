import StockMovement from '../models/Stock.js';
import GRN from '../models/GRN.js';

class StockMovementService {
  /**
   * Create stock movement entries for a GRN
   * @param {Object} grn - The GRN document
   * @param {Boolean} isMigration - Whether this is a migration operation
   * @param {Object} session - MongoDB session for transactions
   */
  static async createStockMovementsFromGRN(grn, isMigration = false, session = null) {
    try {
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Creating stock movements for GRN: ${grn.grnNo}`);
      
      const movements = [];
      
      for (const item of grn.items) {
        // Create IN movement for accepted quantity
        if (item.acceptedQuantity > 0) {
          let balance;
          if (isMigration) {
            // During migration, use a simple balance calculation
            balance = item.acceptedQuantity; // Will be recalculated later
          } else {
            balance = await this.calculateRunningBalance(item.productId, grn.warehouseId, item.acceptedQuantity, session);
          }
          
          const inMovement = new StockMovement({
            productId: item.productId,
            warehouseId: grn.warehouseId,
            type: 'IN',
            quantity: item.acceptedQuantity,
            balance: balance,
            referenceNo: grn.grnNo,
            referenceType: 'GRN',
            date: grn.grnDate,
            remarks: `GRN: ${grn.grnNo} - Accepted Quantity`,
            createdBy: grn.createdBy
          });
          
          movements.push(inMovement);
          console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Created IN movement: ${item.acceptedQuantity} units for product ${item.productId}`);
        }
        
        // Damaged quantity is NOT added to stock movements
        // It's tracked in GRN for record-keeping and displayed separately
        // Only accepted quantity affects usable stock balance
      }
      
      // Save all movements with session support
      if (movements.length > 0) {
        if (session) {
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
   */
  static async deleteStockMovementsForGRN(grnId) {
    try {
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Deleting stock movements for GRN: ${grnId}`);
      
      // Get the GRN to find its GRN number
      const GRN = (await import('../models/GRN.js')).default;
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
   * @returns {Number} - New running balance
   */
  static async calculateRunningBalance(productId, warehouseId, additionalQuantity = 0, session = null) {
    try {
      // Get the latest balance for this product in this warehouse
      const query = { productId, warehouseId };
      const latestMovement = session 
        ? await StockMovement.findOne(query).sort({ date: -1, createdAt: -1 }).session(session)
        : await StockMovement.findOne(query).sort({ date: -1, createdAt: -1 });
      
      const currentBalance = latestMovement ? latestMovement.balance : 0;
      const newBalance = currentBalance + additionalQuantity;
      
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Calculated balance for product ${productId} in warehouse ${warehouseId}: ${currentBalance} + ${additionalQuantity} = ${newBalance}`);
      
      return newBalance;
    } catch (error) {
      console.error('Error calculating running balance:', error);
      return additionalQuantity; // Fallback to just the additional quantity
    }
  }
  
  /**
   * Get stock movement history for a product
   * @param {String} productId - Product ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of stock movements
   */
  static async getStockHistory(productId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        warehouseId
      } = options;
      
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Getting stock history for product: ${productId}`);
      
      // First, let's check how many total stock movements exist
      const totalMovementsInDB = await StockMovement.countDocuments({});
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Total stock movements in database: ${totalMovementsInDB}`);
      
      // Check movements for this specific product
      const query = { productId };
      if (warehouseId) {
        query.warehouseId = warehouseId;
      }
      
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Query:`, query);
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;
      
      const movements = await StockMovement.find(query)
        .populate('warehouseId', 'name')
        .populate('productId', 'productCode itemName')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum);
      
      const totalRecords = await StockMovement.countDocuments(query);
      
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Found ${movements.length} movements for product ${productId}`);
      console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Total records for this product: ${totalRecords}`);
      
      // Log each movement for debugging
      movements.forEach((movement, index) => {
        console.log(`🔍 [STOCK_MOVEMENT_SERVICE] Movement ${index + 1}:`, {
          _id: movement._id,
          productId: movement.productId,
          warehouseId: movement.warehouseId,
          type: movement.type,
          quantity: movement.quantity,
          balance: movement.balance,
          referenceNo: movement.referenceNo,
          date: movement.date
        });
      });
      
      return {
        movements,
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
   * @returns {Number} - Current stock level
   */
  static async getCurrentStock(productId, warehouseId) {
    try {
      const latestMovement = await StockMovement.findOne({
        productId,
        warehouseId
      }).sort({ date: -1, createdAt: -1 });
      
      return latestMovement ? latestMovement.balance : 0;
    } catch (error) {
      console.error('Error getting current stock:', error);
      return 0;
    }
  }
  
  /**
   * Recalculate balances for all stock movements
   */
  static async recalculateBalances() {
    try {
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
   * @returns {Object} - Validation result with available stock
   */
  static async validateStockAvailability(productId, warehouseId, requiredQuantity) {
    try {
      const currentStock = await this.getCurrentStock(productId, warehouseId);
      
      // Calculate blocked stock
      const blockedResult = await StockMovement.aggregate([
        {
          $match: {
            productId: productId,
            warehouseId: warehouseId,
            referenceType: 'SALE'
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
          blockedQty += result.totalQuantity;
        } else if (result._id === 'IN') {
          blockedQty -= result.totalQuantity;
        }
      });
      blockedQty = Math.max(0, blockedQty);
      
      const availableStock = currentStock - blockedQty;
      const isAvailable = availableStock >= requiredQuantity;
      
      return {
        isAvailable,
        currentStock,
        blockedQty,
        availableStock,
        requiredQuantity,
        shortfall: isAvailable ? 0 : requiredQuantity - availableStock
      };
    } catch (error) {
      console.error('Error validating stock availability:', error);
      throw error;
    }
  }

  /**
   * Debug function to check what GRNs exist for a product
   */
  static async debugProductGRNs(productId) {
    try {
      console.log(`🔍 [DEBUG] Checking GRNs for product: ${productId}`);
      
      // Import GRN model
      const GRN = (await import('../models/GRN.js')).default;
      
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
   */
  static async migrateExistingGRNData() {
    try {
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
