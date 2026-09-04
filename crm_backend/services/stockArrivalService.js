import { salesOrderSchema } from '../models/SalesOrder.js';
import StockMovementService from './stockMovementService.js';

const getModels = (dbConnection) => {
  if (!dbConnection) {
    throw new Error('dbConnection is required for StockArrivalService');
  }
  return {
    SalesOrder: dbConnection.models.SalesOrder
      || dbConnection.model('SalesOrder', salesOrderSchema)
  };
};

const lineStockKey = (line) => (
  line?.product && line?.warehouse
    ? StockMovementService.stockKey(line.product, line.warehouse)
    : null
);

const summarizeOrder = (products) => {
  const totalProducts = products.length;
  const availableProducts = products.filter((line) => line.stockStatus === 'available').length;
  const partialProducts = products.filter((line) => line.stockStatus === 'partial').length;
  const waitingProducts = products.filter((line) => line.stockStatus === 'waiting').length;
  const overallStatus = totalProducts > 0 && availableProducts === totalProducts
    ? 'ready'
    : (availableProducts > 0 || partialProducts > 0 ? 'partial' : 'waiting');

  return {
    totalProducts,
    availableProducts,
    partialProducts,
    waitingProducts,
    overallStatus,
    lastChecked: new Date()
  };
};

class StockArrivalService {
  /**
   * Recalculate virtual stock allocation for every actionable Pending order.
   * Orders are processed FIFO and each unit is promised at most once. This is
   * advisory only: explicit confirmation rechecks stock and creates the actual
   * reservation movement.
   */
  static async refreshAllPendingOrders(dbConnection, { maxRetries = 3 } = {}) {
    const { SalesOrder } = getModels(dbConnection);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const orders = await SalesOrder.find({
        status: 'Pending',
        isExpired: { $ne: true }
      })
        .sort({ orderDate: 1, createdAt: 1, _id: 1 })
        .lean();

      if (orders.length === 0) {
        return { ordersChecked: 0, ordersUpdated: 0, ordersReady: 0, ordersPartial: 0 };
      }

      const keys = [...new Set(orders.flatMap((order) => (
        (order.products || []).map(lineStockKey).filter(Boolean)
      )))];
      const remainingByKey = new Map();
      await Promise.all(keys.map(async (key) => {
        const [productId, warehouseId] = key.split(':');
        const currentStock = await StockMovementService.getCurrentStock(
          productId,
          warehouseId,
          dbConnection
        );
        remainingByKey.set(key, Math.max(0, Number(currentStock || 0)));
      }));

      const operations = [];
      let ordersReady = 0;
      let ordersPartial = 0;

      for (const order of orders) {
        const now = new Date();
        const products = (order.products || []).map((line) => {
          const key = lineStockKey(line);
          const requested = Math.max(0, Number(line.quantity || 0));
          const remaining = key ? Number(remainingByKey.get(key) || 0) : 0;
          const allocated = Math.min(remaining, requested);
          if (key) remainingByKey.set(key, Math.max(0, remaining - allocated));

          let stockStatus = 'waiting';
          if (requested > 0 && allocated >= requested) stockStatus = 'available';
          else if (allocated > 0) stockStatus = 'partial';

          return {
            ...line,
            stockStatus,
            availableQuantity: allocated,
            stockCheckedAt: now,
            stockArrivedAt: stockStatus === 'available'
              ? (line.stockArrivedAt || now)
              : line.stockArrivedAt
          };
        });

        const orderStockStatus = summarizeOrder(products);
        const wasReady = order.stockAvailable === true;
        const stockAvailable = order.isOutOfStock === true
          && orderStockStatus.overallStatus === 'ready';
        const stockAvailableNotifiedAt = stockAvailable && (!wasReady || !order.stockAvailableNotifiedAt)
          ? now
          : order.stockAvailableNotifiedAt;

        if (orderStockStatus.overallStatus === 'ready') ordersReady++;
        if (orderStockStatus.overallStatus === 'partial') ordersPartial++;

        operations.push({
          updateOne: {
            // updatedAt is the optimistic revision. If a Pending-order edit wins
            // after this snapshot, the stale products array is never written.
            filter: {
              _id: order._id,
              status: 'Pending',
              isExpired: { $ne: true },
              updatedAt: order.updatedAt || { $exists: false }
            },
            update: {
              $set: {
                products,
                orderStockStatus,
                stockAvailable,
                stockAvailableNotifiedAt,
                updatedAt: now
              }
            }
          }
        });
      }

      const result = operations.length > 0
        ? await SalesOrder.bulkWrite(operations, { ordered: true })
        : null;
      const matchedCount = result?.matchedCount ?? result?.nMatched ?? 0;

      if (matchedCount === operations.length) {
        return {
          ordersChecked: orders.length,
          ordersUpdated: result?.modifiedCount || 0,
          ordersReady,
          ordersPartial
        };
      }

      // A business edit or another queue refresh changed at least one order.
      // Rebuild the whole FIFO pool so later orders are not allocated from a
      // stale quantity/warehouse snapshot.
      if (attempt === maxRetries - 1) {
        const error = new Error('Pending Sales Orders changed while stock readiness was being refreshed. Retry the operation.');
        error.statusCode = 409;
        error.code = 'STOCK_QUEUE_REFRESH_CONFLICT';
        throw error;
      }
    }

    throw new Error('Stock readiness refresh exhausted unexpectedly');
  }

  static async refreshStockKeys(keys, dbConnection) {
    const normalizedKeys = [...new Set((keys || []).map((entry) => {
      if (typeof entry === 'string') return entry;
      return entry?.productId && entry?.warehouseId
        ? StockMovementService.stockKey(entry.productId, entry.warehouseId)
        : null;
    }).filter(Boolean))];

    const result = await this.refreshAllPendingOrders(dbConnection);
    return { ...result, stockKeys: normalizedKeys };
  }

  static async checkWaitingOrdersForStock(
    productId,
    warehouseId,
    arrivedQuantity = 0,
    dbConnection = null
  ) {
    console.log(`📦 [STOCK_ARRIVAL] Reallocating Pending orders for ${productId}:${warehouseId}`);
    const result = await this.refreshStockKeys([{ productId, warehouseId }], dbConnection);
    const currentStock = await StockMovementService.getCurrentStock(
      productId,
      warehouseId,
      dbConnection
    );
    return { ...result, currentStock, arrivedQuantity };
  }

  static async checkOrderStockStatus(orderId, dbConnection = null) {
    const { SalesOrder } = getModels(dbConnection);
    const existingOrder = await SalesOrder.findById(orderId)
      .select('status isExpired stockAvailable')
      .lean();
    if (!existingOrder) throw new Error('Order not found');
    if (existingOrder.isExpired || ['Delivered', 'Cancelled', 'Rejected', 'Expired'].includes(existingOrder.status)) {
      return {
        success: false,
        message: `Stock status is not actionable for ${existingOrder.status || 'closed'} orders`
      };
    }

    await this.refreshAllPendingOrders(dbConnection);
    const order = await SalesOrder.findById(orderId).lean();
    if (order.status !== 'Pending') {
      return {
        success: false,
        message: `Stock status allocation is only maintained for Pending orders`
      };
    }

    return {
      success: true,
      orderNumber: order.orderNumber,
      orderStockStatus: order.orderStockStatus,
      stockAvailable: order.stockAvailable === true,
      enteredReadyQueue: existingOrder.stockAvailable !== true && order.stockAvailable === true,
      products: (order.products || []).map((line) => ({
        productName: line.productName,
        productCode: line.productCode,
        quantity: line.quantity,
        availableQuantity: line.availableQuantity,
        stockStatus: line.stockStatus
      }))
    };
  }

  static async sendStockArrivalNotification(order) {
    const status = order.orderStockStatus?.overallStatus;
    const available = order.orderStockStatus?.availableProducts || 0;
    const total = order.orderStockStatus?.totalProducts || 0;
    const message = status === 'ready'
      ? `All products are now available for order ${order.orderNumber}. You can proceed with confirmation.`
      : `${available}/${total} products are now available for order ${order.orderNumber}.`;
    console.log(`📧 [NOTIFICATION] ${message}`);
    return { sent: true, message };
  }
}

export default StockArrivalService;
