import { salesOrderSchema }   from '../../models/SalesOrder.js';
import { productSchema }       from '../../models/Product.js';
import { dealerSchema }        from '../../models/Dealer.js';
import { stockMovementSchema } from '../../models/Stock.js';
import { grnSchema }           from '../../models/GRN.js';
import { dealerPricingSchema } from '../../models/DealerPricing.js';

const getModels = (db) => ({
  SalesOrder:    db.models.SalesOrder    || db.model('SalesOrder',    salesOrderSchema),
  Product:       db.models.Product       || db.model('Product',       productSchema),
  Dealer:        db.models.Dealer        || db.model('Dealer',        dealerSchema),
  StockMovement: db.models.StockMovement || db.model('StockMovement', stockMovementSchema),
  GRN:           db.models.GRN           || db.model('GRN',           grnSchema),
  DealerPricing: db.models.DealerPricing || db.model('DealerPricing', dealerPricingSchema),
});

const generateOrderNumber = async (SalesOrder) => {
  try {
    const year   = new Date().getFullYear();
    const prefix = `SO-${year}-`;
    const last   = await SalesOrder.findOne({ orderNumber: { $regex: `^${prefix}` } }).sort({ orderNumber: -1 });
    let next = 1;
    if (last) next = parseInt(last.orderNumber.split('-')[2]) + 1;
    const num = `${prefix}${next.toString().padStart(4, '0')}`;
    const exists = await SalesOrder.findOne({ orderNumber: num });
    return exists ? `${prefix}${(next + 1).toString().padStart(4, '0')}` : num;
  } catch {
    return `SO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  }
};

// @desc    Get dealer's orders
// @route   GET /api/app/orders
export const getMyOrders = async (req, res) => {
  try {
    const { SalesOrder, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { page = 1, limit = 20, status, startDate, endDate } = req.query;
    const query = { dealer: dealer._id };
    if (status && status.toLowerCase() !== 'all') query.status = status;
    if (startDate || endDate) {
      query.orderDate = {};
      if (startDate) query.orderDate.$gte = new Date(startDate);
      if (endDate)   query.orderDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      SalesOrder.find(query)
        .populate('dealer', 'name code')
        .populate('products.product', 'itemName productCode')
        .sort({ orderDate: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      SalesOrder.countDocuments(query),
    ]);

    res.json({
      success: true, orders,
      pagination: {
        currentPage: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)),
        totalOrders: total, hasNext: skip + orders.length < total, hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('getMyOrders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get order details
// @route   GET /api/app/orders/:id
export const getOrderDetails = async (req, res) => {
  try {
    const { SalesOrder, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const order = await SalesOrder.findOne({ _id: req.params.id, dealer: dealer._id })
      .populate('dealer', 'name code phone email address')
      .populate('products.product', 'itemName productCode mrp');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.json({ success: true, order });
  } catch (error) {
    console.error('getOrderDetails error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new order (legacy — now dealers use order requests)
// @route   POST /api/app/orders
export const createOrder = async (req, res) => {
  try {
    const { SalesOrder, Product, Dealer, GRN, StockMovement, DealerPricing } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { products, deliveryAddress, notes } = req.body;
    if (!products?.length) return res.status(400).json({ success: false, message: 'Products are required' });

    let grossAmount = 0, totalGst = 0;
    const orderProducts = [];

    for (const item of products) {
      const product = await Product.findById(item.productId);
      if (!product) return res.status(400).json({ success: false, message: `Product ${item.productId} not found` });

      const pricing = await DealerPricing.findOne({ product: product._id, isActive: true });
      const unitPrice = pricing?.sellingPrice || product.rateSlabs?.[0]?.rate || product.totalAmount || 0;
      const baseAmount = unitPrice * item.quantity;
      const gstAmount  = (baseAmount * (product.gst || 0)) / 100;

      grossAmount += baseAmount;
      totalGst    += gstAmount;

      orderProducts.push({
        product:     item.productId,
        productName: product.itemName,
        productCode: product.productCode,
        HSNCode:     product.HSNCode,
        quantity:    item.quantity,
        unitPrice,
        gst:         product.gst || 0,
        gstAmount,
        totalPrice:  baseAmount + gstAmount,
        warehouse:   null,
        warehouseName: null,
      });
    }

    const orderNumber = await generateOrderNumber(SalesOrder);
    const typeMap = { Retail: 'Retail Sales Order', Wholesale: 'Wholesale Sales Order', Enterprise: 'Enterprise Sales Order', Reseller: 'Reseller Sales Order' };
    const orderType = typeMap[dealer.type] || 'Independent Sales Order';

    const salesOrder = await SalesOrder.create({
      orderNumber, dealer: dealer._id, dealerName: dealer.name, dealerCode: dealer.code,
      dealerType: dealer.type, region: dealer.regionId, pinCode: dealer.pinCode,
      products: orderProducts, grossAmount, totalGst, totalAmount: grossAmount + totalGst,
      deliveryAddress: deliveryAddress || dealer.address, notes,
      status: 'Pending', type: orderType, orderDate: new Date(), createdBy: req.user._id,
    });

    res.status(201).json({ success: true, message: 'Order created successfully', order: salesOrder });

    // Notify admin (non-blocking)
    try {
      const { notifyNewOrderRequest } = await import('../../services/adminNotificationService.js');
      const company = req.company || 'jain-impex';
      notifyNewOrderRequest(company, {
        dealerName: dealer.name,
        orderNumber,
        amount: grossAmount + totalGst,
      });
    } catch (e) { /* non-blocking */ }
  } catch (error) {
    console.error('createOrder error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Cancel order
// @route   PATCH /api/app/orders/:id/cancel
export const cancelOrder = async (req, res) => {
  try {
    const { SalesOrder, Dealer, StockMovement } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const order = await SalesOrder.findOne({ _id: req.params.id, dealer: dealer._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status === 'Cancelled') return res.status(400).json({ success: false, message: 'Order is already cancelled' });
    if (!['Pending', 'Confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel a ${order.status} order from the app` });
    }

    // Restore stock for products that had a warehouse assigned
    for (const product of order.products) {
      if (product.warehouse) {
        const latest = await StockMovement.findOne({ productId: product.product, warehouseId: product.warehouse }).sort({ date: -1, createdAt: -1 });
        const newBalance = (latest?.balance || 0) + product.quantity;
        await StockMovement.create({
          productId: product.product, warehouseId: product.warehouse,
          type: 'IN', quantity: product.quantity, balance: newBalance,
          referenceNo: order.orderNumber, referenceType: 'SALE', date: new Date(),
          remarks: `Order ${order.orderNumber} - Cancelled (Stock Unblocked)`,
          createdBy: req.user._id,
        });
      }
    }

    order.status = 'Cancelled';
    order.cancelledAt = new Date();
    await order.save();

    res.json({ success: true, message: 'Order cancelled successfully', order });
  } catch (error) {
    console.error('cancelOrder error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get order history
// @route   GET /api/app/orders/history
export const getOrderHistory = async (req, res) => {
  try {
    const { SalesOrder, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { limit = 10 } = req.query;
    const orders = await SalesOrder.find({ dealer: dealer._id, status: { $in: ['Delivered', 'Cancelled'] } })
      .sort({ orderDate: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, orders });
  } catch (error) {
    console.error('getOrderHistory error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
