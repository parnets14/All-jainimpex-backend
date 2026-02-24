import SalesOrder from '../models/SalesOrder.js';
import StockMovementService from './stockMovementService.js';

class StockArrivalService {
  /**
   * Check waiting orders when stock arrives for a product
   * Called after GRN creation or Manual Stock Adjustment
   * @param {String} productId - Product ID
   * @param {String} warehouseId - Warehouse ID
   * @param {Number} arrivedQuantity - Quantity that just arrived (optional, for logging)
   */
  static async checkWaitingOrdersForStock(productId, warehouseId, arrivedQuantity = 0) {
    try {
      console.log(`📦 [STOCK_ARRIVAL] Checking waiting orders for product ${productId} in warehouse ${warehouseId}`);
      if (arrivedQuantity > 0) {
        console.log(`   Arrived quantity: ${arrivedQuantity} units`);
      }
      
      // Get current stock from movements
      const currentStock = await StockMovementService.getCurrentStock(productId, warehouseId);
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
        const updateResult = await this.updateOrderStockStatus(order, productId, warehouseId, currentStock);
        
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
   * @returns {Object} - Update result
   */
  static async updateOrderStockStatus(order, productId, warehouseId, currentStock) {
    try {
      let orderUpdated = false;
      let availableCount = 0;
      let partialCount = 0;
      let waitingCount = 0;
      let totalCount = 0;
      
      // Import Stock model
      const Stock = (await import('../models/Stock.js')).default;
      
      // Update stock status for each product in the order
      for (const product of order.products) {
        totalCount++;
        
        // Skip products without warehouse
        if (!product.warehouse) {
          product.stockStatus = 'waiting';
          product.availableQuantity = 0;
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
          const stockRecord = await Stock.findOne({
            productId: product.product,
            warehouseId: product.warehouse
          });
          stockAvailable = stockRecord ? (stockRecord.netStock || stockRecord.quantity || 0) : 0;
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
      
      // Update order-level stock status summary
      if (orderUpdated) {
        order.orderStockStatus = {
          totalProducts: totalCount,
          availableProducts: availableCount,
          partialProducts: partialCount,
          waitingProducts: waitingCount,
          lastChecked: new Date()
        };
        
        // Determine overall order status
        if (availableCount === totalCount) {
          order.orderStockStatus.overallStatus = 'ready';
        } else if (availableCount > 0 || partialCount > 0) {
          order.orderStockStatus.overallStatus = 'partial';
        } else {
          order.orderStockStatus.overallStatus = 'waiting';
        }
        
        await order.save();
        
        console.log(`   ✅ Order ${order.orderNumber} updated: ${order.orderStockStatus.overallStatus} (${availableCount}/${totalCount} products available)`);
        
        // TODO: Send notification to user/dealer
        // await this.sendStockArrivalNotification(order);
      }
      
      return {
        updated: orderUpdated,
        orderStatus: order.orderStockStatus?.overallStatus,
        availableProducts: availableCount,
        totalProducts: totalCount
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
   * @returns {Object} - Stock status summary
   */
  static async checkOrderStockStatus(orderId) {
    try {
      const order = await SalesOrder.findById(orderId);
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      // Allow refresh for any order with waiting/partial stock, not just isOutOfStock orders
      const hasWaitingOrPartialProducts = order.products?.some(p => 
        p.stockStatus === 'waiting' || p.stockStatus === 'partial'
      );
      
      if (!order.isOutOfStock && !hasWaitingOrPartialProducts) {
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
            product.warehouse
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
        }
      }
      
      // Update order-level summary
      order.orderStockStatus = {
        totalProducts: order.products.length,
        availableProducts: availableCount,
        partialProducts: partialCount,
        waitingProducts: waitingCount,
        lastChecked: new Date()
      };
      
      if (availableCount === order.products.length) {
        order.orderStockStatus.overallStatus = 'ready';
      } else if (availableCount > 0 || partialCount > 0) {
        order.orderStockStatus.overallStatus = 'partial';
      } else {
        order.orderStockStatus.overallStatus = 'waiting';
      }
      
      await order.save();
      
      console.log(`✅ [STOCK_ARRIVAL] Order ${order.orderNumber}: ${order.orderStockStatus.overallStatus}`);
      
      return {
        success: true,
        orderNumber: order.orderNumber,
        orderStockStatus: order.orderStockStatus,
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
