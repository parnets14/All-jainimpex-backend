import { salesOrderSchema } from '../models/SalesOrder.js';
import { stockMovementSchema } from '../models/Stock.js';
import StockMovementService from './stockMovementService.js';

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  if (!dbConnection) {
    throw new Error('dbConnection is required for StockArrivalService');
  }
  return {
    SalesOrder: dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema),
    StockMovement: dbConnection.models.StockMovement || dbConnection.model('StockMovement', stockMovementSchema),
  };
};

const syncStockArrivalState = (order, overallStatus, checkedAt = new Date()) => {
  const shouldBeInStockArrivedQueue = order.status === 'Pending'
    && order.isExpired !== true
    && order.isOutOfStock === true
    && overallStatus === 'ready';
  const wasInStockArrivedQueue = order.stockAvailable === true;

  order.stockAvailable = shouldBeInStockArrivedQueue;
  if (shouldBeInStockArrivedQueue && (!wasInStockArrivedQueue || !order.stockAvailableNotifiedAt)) {
    order.stockAvailableNotifiedAt = checkedAt;
  }

  return {
    changed: wasInStockArrivedQueue !== shouldBeInStockArrivedQueue,
    enteredReadyQueue: !wasInStockArrivedQueue && shouldBeInStockArrivedQueue
  };
};

class StockArrivalService {
  /**
   * Check waiting orders when stock arrives for a product
   * Called after GRN creation or Manual Stock Adjustment
   * @param {String} productId - Product ID
   * @param {String} warehouseId - Warehouse ID
   * @param {Number} arrivedQuantity - Quantity that just arrived (optional, for logging)
   * @param {Object} dbConnection - Database connection for multi-database support
   */
  static async checkWaitingOrdersForStock(productId, warehouseId, arrivedQuantity = 0, dbConnection = null) {
    try {
      console.log(`📦 [STOCK_ARRIVAL] Checking waiting orders for product ${productId} in warehouse ${warehouseId}`);
      if (arrivedQuantity > 0) {
        console.log(`   Arrived quantity: ${arrivedQuantity} units`);
      }
      
      const { SalesOrder } = getModels(dbConnection);
      
      // Get current stock from movements
      const currentStock = await StockMovementService.getCurrentStock(productId, warehouseId, dbConnection);
      console.log(`   Current stock: ${currentStock} units`);
      
      // Find all orders waiting for this product in this warehouse
      // Include both fully out-of-stock orders AND orders with partial/waiting products
      // Use $elemMatch to ensure product and warehouse match in the SAME array element
      const waitingOrders = await SalesOrder.find({
        status: 'Pending',
        products: {
          $elemMatch: {
            product: productId,
            warehouse: warehouseId,
            stockStatus: { $in: ['waiting', 'partial'] } // Only check orders that need this stock
          }
        }
      }).populate('dealer', 'name email phone');
      
      console.log(`   Found ${waitingOrders.length} waiting orders`);
      
      if (waitingOrders.length === 0) {
        return { ordersUpdated: 0, ordersReady: 0, ordersPartial: 0 };
      }
      
      let ordersUpdated = 0;
      let ordersReady = 0;
      let ordersPartial = 0;
      
      for (const order of waitingOrders) {
        const updateResult = await this.updateOrderStockStatus(order, productId, warehouseId, currentStock, dbConnection);
        
        if (updateResult.updated) {
          ordersUpdated++;
          if (updateResult.orderStatus === 'ready') ordersReady++;
          if (updateResult.orderStatus === 'partial') ordersPartial++;
        }
      }
      
      console.log(`✅ [STOCK_ARRIVAL] Updated ${ordersUpdated} orders (${ordersReady} ready, ${ordersPartial} partial)`);
      
      return {
        ordersUpdated,
        ordersReady,
        ordersPartial,
        currentStock
      };
    } catch (error) {
      console.error('❌ [STOCK_ARRIVAL] Error checking waiting orders:', error);
      throw error;
    }
  }

  /**
   * Update stock status for a specific order
   * @param {Object} order - Sales Order document
   * @param {String} productId - Product ID that stock arrived for
   * @param {String} warehouseId - Warehouse ID
   * @param {Number} currentStock - Current available stock
   * @param {Object} dbConnection - Database connection for multi-database support
   * @returns {Object} - Update result
   */
  static async updateOrderStockStatus(order, productId, warehouseId, currentStock, dbConnection = null) {
    try {
      let orderUpdated = false;
      let availableCount = 0;
      let partialCount = 0;
      let waitingCount = 0;
      let totalCount = 0;
      
      const { StockMovement } = getModels(dbConnection);
      
      // Update stock status for each product in the order
      for (const product of order.products) {
        totalCount++;
        
        // Products without an assigned warehouse are still waiting for stock.
        if (!product.warehouse) {
          if (product.stockStatus !== 'waiting' || Number(product.availableQuantity || 0) !== 0) {
            orderUpdated = true;
          }
          product.stockStatus = 'waiting';
          product.availableQuantity = 0;
          product.stockCheckedAt = new Date();
          waitingCount++;
          continue;
        }
        
        const oldStatus = product.stockStatus || 'unknown';
        const oldAvailable = product.availableQuantity || 0;
        
        // Get current stock for this product (either from parameter or query)
        let stockAvailable = 0;
        if (product.product.toString() === productId.toString() &&
            product.warehouse.toString() === warehouseId.toString()) {
          // Use the provided current stock for the product that just arrived
          stockAvailable = currentStock;
        } else {
          // Query current stock for other products to ensure accuracy
          stockAvailable = await StockMovementService.getCurrentStock(product.product, product.warehouse, dbConnection);
        }
        
        // Calculate available quantity for this product
        product.availableQuantity = Math.min(stockAvailable, product.quantity);
        
        // Determine stock status
        if (stockAvailable >= product.quantity) {
          product.stockStatus = 'available';
          if (oldStatus !== 'available') {
            product.stockArrivedAt = new Date();
          }
          availableCount++;
        } else if (stockAvailable > 0) {
          product.stockStatus = 'partial';
          partialCount++;
        } else {
          product.stockStatus = 'waiting';
          waitingCount++;
        }
        
        product.stockCheckedAt = new Date();
        
        if (oldStatus !== product.stockStatus || oldAvailable !== product.availableQuantity) {
          orderUpdated = true;
          console.log(`   📝 ${order.orderNumber}: ${product.productName || product.productCode}`);
          console.log(`      Status: ${oldStatus} → ${product.stockStatus}`);
          console.log(`      Available: ${oldAvailable}/${product.quantity} → ${product.availableQuantity}/${product.quantity}`);
        }
      }
      
      const checkedAt = new Date();
      const overallStatus = totalCount > 0 && availableCount === totalCount
        ? 'ready'
        : (availableCount > 0 || partialCount > 0 ? 'partial' : 'waiting');
      const previousSummary = order.orderStockStatus || {};
      const summaryChanged = previousSummary.totalProducts !== totalCount
        || previousSummary.availableProducts !== availableCount
        || previousSummary.partialProducts !== partialCount
        || previousSummary.waitingProducts !== waitingCount
        || previousSummary.overallStatus !== overallStatus;

      order.orderStockStatus = {
        totalProducts: totalCount,
        availableProducts: availableCount,
        partialProducts: partialCount,
        waitingProducts: waitingCount,
        overallStatus,
        lastChecked: checkedAt
      };

      const stockArrivalTransition = syncStockArrivalState(order, overallStatus, checkedAt);
      const persistedChange = orderUpdated || summaryChanged || stockArrivalTransition.changed;

      if (persistedChange) {
        await order.save();
        console.log(`   ✅ Order ${order.orderNumber} updated: ${overallStatus} (${availableCount}/${totalCount} products available)`);

        // TODO: Send notification to user/dealer
        // await this.sendStockArrivalNotification(order);
      }

      return {
        updated: persistedChange,
        orderStatus: overallStatus,
        availableProducts: availableCount,
        totalProducts: totalCount,
        stockAvailable: order.stockAvailable === true,
        enteredReadyQueue: stockArrivalTransition.enteredReadyQueue
      };
    } catch (error) {
      console.error(`❌ [STOCK_ARRIVAL] Error updating order ${order.orderNumber}:`, error);
      throw error;
    }
  }

  /**
   * Check all products in an order for stock availability
   * Useful for manual refresh or when order is first created
   * @param {String} orderId - Sales Order ID
   * @param {Object} dbConnection - Database connection for multi-database support
   * @returns {Object} - Stock status summary
   */
  static async checkOrderStockStatus(orderId, dbConnection = null, { force = false } = {}) {
    try {
      const { SalesOrder } = getModels(dbConnection);
      
      const order = await SalesOrder.findById(orderId);
      
      if (!order) {
        throw new Error('Order not found');
      }

      if (order.isExpired || ['Delivered', 'Cancelled', 'Rejected', 'Expired'].includes(order.status)) {
        return {
          success: false,
          message: `Stock status is not actionable for ${order.status || 'closed'} orders`
        };
      }
      
      // Allow refresh for any order with waiting/partial stock, not just isOutOfStock orders
      const hasWaitingOrPartialProducts = order.products?.some(p => 
        p.stockStatus === 'waiting' || p.stockStatus === 'partial'
      );
      
      if (!force && !order.isOutOfStock && !hasWaitingOrPartialProducts) {
        return {
          success: false,
          message: 'Order does not have any products waiting for stock'
        };
      }
      
      console.log(`🔍 [STOCK_ARRIVAL] Checking stock status for order ${order.orderNumber}`);
      
      let availableCount = 0;
      let partialCount = 0;
      let waitingCount = 0;
      
      for (const product of order.products) {
        if (product.warehouse) {
          // Get current stock for this product
          const currentStock = await StockMovementService.getCurrentStock(
            product.product,
            product.warehouse,
            dbConnection
          );
          
          // Update product stock status
          product.availableQuantity = Math.min(currentStock, product.quantity);
          
          if (currentStock >= product.quantity) {
            product.stockStatus = 'available';
            if (!product.stockArrivedAt) {
              product.stockArrivedAt = new Date();
            }
            availableCount++;
          } else if (currentStock > 0) {
            product.stockStatus = 'partial';
            partialCount++;
          } else {
            product.stockStatus = 'waiting';
            waitingCount++;
          }
          
          product.stockCheckedAt = new Date();
          
          console.log(`   ${product.productName || product.productCode}: ${product.stockStatus} (${product.availableQuantity}/${product.quantity})`);
        } else {
          product.stockStatus = 'waiting';
          product.availableQuantity = 0;
          product.stockCheckedAt = new Date();
          waitingCount++;
        }
      }

      const checkedAt = new Date();
      const overallStatus = order.products.length > 0 && availableCount === order.products.length
        ? 'ready'
        : (availableCount > 0 || partialCount > 0 ? 'partial' : 'waiting');

      order.orderStockStatus = {
        totalProducts: order.products.length,
        availableProducts: availableCount,
        partialProducts: partialCount,
        waitingProducts: waitingCount,
        overallStatus,
        lastChecked: checkedAt
      };
      const stockArrivalTransition = syncStockArrivalState(order, overallStatus, checkedAt);

      await order.save();

      console.log(`✅ [STOCK_ARRIVAL] Order ${order.orderNumber}: ${overallStatus}`);
      
      return {
        success: true,
        orderNumber: order.orderNumber,
        orderStockStatus: order.orderStockStatus,
        stockAvailable: order.stockAvailable === true,
        enteredReadyQueue: stockArrivalTransition.enteredReadyQueue,
        products: order.products.map(p => ({
          productName: p.productName,
          productCode: p.productCode,
          quantity: p.quantity,
          availableQuantity: p.availableQuantity,
          stockStatus: p.stockStatus
        }))
      };
    } catch (error) {
      console.error('❌ [STOCK_ARRIVAL] Error checking order stock status:', error);
      throw error;
    }
  }

  /**
   * Send notification when stock arrives
   * @param {Object} order - Sales Order document
   */
  static async sendStockArrivalNotification(order) {
    try {
      // TODO: Implement notification system
      // This could send:
      // - Email to dealer
      // - SMS notification
      // - In-app notification
      // - WhatsApp message
      
      const status = order.orderStockStatus.overallStatus;
      const available = order.orderStockStatus.availableProducts;
      const total = order.orderStockStatus.totalProducts;
      
      let message = '';
      if (status === 'ready') {
        message = `All products are now available for order ${order.orderNumber}. You can proceed with fulfillment.`;
      } else if (status === 'partial') {
        message = `${available}/${total} products are now available for order ${order.orderNumber}. You can process available items or wait for remaining stock.`;
      }
      
      console.log(`📧 [NOTIFICATION] ${message}`);
      
      // Placeholder for actual notification implementation
      return {
        sent: true,
        message
      };
    } catch (error) {
      console.error('❌ [STOCK_ARRIVAL] Error sending notification:', error);
      return {
        sent: false,
        error: error.message
      };
    }
  }
}

export default StockArrivalService;
