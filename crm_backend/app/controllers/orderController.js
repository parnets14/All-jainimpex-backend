import SalesOrder from '../../models/SalesOrder.js';
import Product from '../../models/Product.js';
import Dealer from '../../models/Dealer.js';
import Stock from '../../models/Stock.js';

// Generate unique order number
const generateOrderNumber = async () => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `SO-${currentYear}-`;
    
    const lastOrder = await SalesOrder.findOne({
      orderNumber: { $regex: `^${prefix}` }
    }).sort({ orderNumber: -1 });
    
    let nextNumber = 1;
    if (lastOrder) {
      const lastNumber = parseInt(lastOrder.orderNumber.split('-')[2]);
      nextNumber = lastNumber + 1;
    }
    
    const orderNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
    
    const existingOrder = await SalesOrder.findOne({ orderNumber });
    if (existingOrder) {
      return `${prefix}${(nextNumber + 1).toString().padStart(4, '0')}`;
    }
    
    return orderNumber;
  } catch (error) {
    console.error('Error generating order number:', error);
    const timestamp = Date.now().toString().slice(-6);
    return `SO-${new Date().getFullYear()}-${timestamp}`;
  }
};

// @desc    Get dealer's orders
// @route   GET /api/app/orders
// @access  Private (Dealer)
export const getMyOrders = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;

    const query = { dealer: dealerId };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (startDate || endDate) {
      query.orderDate = {};
      if (startDate) query.orderDate.$gte = new Date(startDate);
      if (endDate) query.orderDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await SalesOrder.find(query)
      .populate('dealer', 'name code')
      .sort({ orderDate: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await SalesOrder.countDocuments(query);

    res.json({
      success: true,
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalOrders: total,
        hasNext: skip + orders.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error getting dealer orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

// @desc    Get order details
// @route   GET /api/app/orders/:id
// @access  Private (Dealer)
export const getOrderDetails = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    const order = await SalesOrder.findOne({
      _id: req.params.id,
      dealer: dealerId
    })
      .populate('dealer', 'name code phone email address')
      .populate('products.product', 'itemName productCode mrp');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Error getting order details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order details',
      error: error.message
    });
  }
};

// @desc    Create new order
// @route   POST /api/app/orders
// @access  Private (Dealer)
export const createOrder = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;

    const { products, deliveryAddress, notes } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Products are required'
      });
    }

    // Calculate totals and validate products
    let totalAmount = 0;
    const orderProducts = [];

    for (const item of products) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product ${item.productId} not found`
        });
      }

      // Check stock availability
      const stock = await Stock.findOne({
        product: item.productId,
        warehouse: dealer.regionId // Assuming warehouse by region
      });

      if (!stock || stock.availableQuantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product ${product.itemName}`
        });
      }

      const itemTotal = product.dealerPrice * item.quantity;
      totalAmount += itemTotal;

      orderProducts.push({
        product: item.productId,
        productName: product.itemName,
        productCode: product.productCode,
        quantity: item.quantity,
        unitPrice: product.dealerPrice,
        total: itemTotal
      });
    }

    const orderNumber = await generateOrderNumber();

    const salesOrder = await SalesOrder.create({
      orderNumber,
      dealer: dealerId,
      dealerName: dealer.name,
      dealerCode: dealer.code,
      products: orderProducts,
      totalAmount,
      deliveryAddress: deliveryAddress || dealer.address,
      notes,
      status: 'Pending',
      orderDate: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: salesOrder
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
};

// @desc    Cancel order
// @route   PATCH /api/app/orders/:id/cancel
// @access  Private (Dealer)
export const cancelOrder = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    const order = await SalesOrder.findOne({
      _id: req.params.id,
      dealer: dealerId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status === 'Delivered' || order.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status: ${order.status}`
      });
    }

    order.status = 'Cancelled';
    order.cancelledAt = new Date();
    await order.save();

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling order',
      error: error.message
    });
  }
};

// @desc    Get order history
// @route   GET /api/app/orders/history
// @access  Private (Dealer)
export const getOrderHistory = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    const { limit = 10 } = req.query;

    const orders = await SalesOrder.find({
      dealer: dealerId,
      status: { $in: ['Delivered', 'Cancelled'] }
    })
      .sort({ orderDate: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      orders
    });
  } catch (error) {
    console.error('Error getting order history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order history',
      error: error.message
    });
  }
};

