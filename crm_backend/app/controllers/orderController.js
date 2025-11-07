import SalesOrder from '../../models/SalesOrder.js';
import Product from '../../models/Product.js';
import Dealer from '../../models/Dealer.js';
import StockMovement from '../../models/Stock.js';
import GRN from '../../models/GRN.js';
import StockMovementService from '../../services/stockMovementService.js';
import DealerPricing from '../../models/DealerPricing.js';

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

    // Handle status filter - check for both 'all' and 'All'
    if (status && status.toLowerCase() !== 'all') {
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
      .populate('products.product', 'itemName productCode')
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
    let grossAmount = 0;
    let totalGst = 0;
    const orderProducts = [];

    for (const item of products) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product ${item.productId} not found`
        });
      }

      // Check total stock availability across all warehouses
      let totalAvailableStock = 0;
      try {
        const grnQuery = { 'items.productId': product._id };
        const grns = await GRN.find(grnQuery).select('warehouseId items');

        const warehouseStock = {};
        
        grns.forEach(grn => {
          if (!grn.warehouseId) return;
          
          const warehouseId = grn.warehouseId.toString();
          
          if (!warehouseStock[warehouseId]) {
            warehouseStock[warehouseId] = {
              totalQty: 0,
              damagedQty: 0
            };
          }
          
          grn.items.forEach(grnItem => {
            const itemProductId = grnItem.productId?._id ? grnItem.productId._id.toString() : grnItem.productId.toString();
            if (itemProductId === product._id.toString()) {
              warehouseStock[warehouseId].totalQty += grnItem.acceptedQuantity || 0;
              warehouseStock[warehouseId].damagedQty += grnItem.damageQuantity || 0;
            }
          });
        });

        for (const warehouseId of Object.keys(warehouseStock)) {
          try {
            const currentStock = await StockMovementService.getCurrentStock(product._id, warehouseId);
            
            const blockedMovements = await StockMovement.find({
              productId: product._id,
              warehouseId: warehouseId,
              type: 'OUT',
              referenceType: 'SALE'
            });
            
            const unblockedMovements = await StockMovement.find({
              productId: product._id,
              warehouseId: warehouseId,
              type: 'IN',
              referenceType: 'SALE',
              remarks: { $regex: /Stock Unblocked/ }
            });
            
            let blockedQty = 0;
            blockedMovements.forEach(movement => {
              blockedQty += movement.quantity;
            });
            
            unblockedMovements.forEach(movement => {
              blockedQty -= movement.quantity;
            });
            
            blockedQty = Math.max(0, blockedQty);
            
            const currentStockValue = currentStock !== undefined ? currentStock : warehouseStock[warehouseId].totalQty;
            const netStock = currentStockValue - warehouseStock[warehouseId].damagedQty - blockedQty;
            
            totalAvailableStock += Math.max(0, netStock);
          } catch (error) {
            const netStock = warehouseStock[warehouseId].totalQty - warehouseStock[warehouseId].damagedQty;
            totalAvailableStock += Math.max(0, netStock);
          }
        }
      } catch (error) {
        console.error(`Error calculating stock for product ${product._id}:`, error);
      }

      if (totalAvailableStock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product ${product.itemName}. Available: ${totalAvailableStock}, Requested: ${item.quantity}`
        });
      }

      // Get dealer pricing
      const dealerPricing = await DealerPricing.findOne({ 
        product: product._id, 
        isActive: true 
      });

      let unitPrice = 0;
      if (dealerPricing) {
        unitPrice = dealerPricing.sellingPrice;
      } else {
        unitPrice = product.rateSlabs && product.rateSlabs.length > 0
          ? product.rateSlabs[0].rate
          : product.totalAmount || 0;
      }

      const baseAmount = unitPrice * item.quantity;
      const gstAmount = (baseAmount * product.gst) / 100;
      const itemTotal = baseAmount + gstAmount;

      grossAmount += baseAmount;
      totalGst += gstAmount;

      orderProducts.push({
        product: item.productId,
        productName: product.itemName,
        productCode: product.productCode,
        HSNCode: product.HSNCode,
        quantity: item.quantity,
        unitPrice: unitPrice,
        gst: product.gst,
        gstAmount: gstAmount,
        totalPrice: itemTotal,
        warehouse: null, // Will be assigned later in dashboard
        warehouseName: null
      });
    }

    const totalAmount = grossAmount + totalGst;

    const orderNumber = await generateOrderNumber();

    // Determine order type based on dealer type
    let orderType = 'Independent Sales Order';
    if (dealer.type) {
      const typeMap = {
        'Retail': 'Retail Sales Order',
        'Wholesale': 'Wholesale Sales Order',
        'Enterprise': 'Enterprise Sales Order',
        'Reseller': 'Reseller Sales Order'
      };
      orderType = typeMap[dealer.type] || 'Independent Sales Order';
    }

    const salesOrder = await SalesOrder.create({
      orderNumber,
      dealer: dealerId,
      dealerName: dealer.name,
      dealerCode: dealer.code,
      dealerType: dealer.type,
      region: dealer.regionId,
      pinCode: dealer.pinCode,
      products: orderProducts,
      grossAmount,
      totalGst,
      totalAmount,
      deliveryAddress: deliveryAddress || dealer.address,
      notes,
      status: 'Pending',
      type: orderType,
      orderDate: new Date(),
      createdBy: req.user._id
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

    // Allow cancellation for Pending and Confirmed orders from app
    if (order.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Order is already cancelled'
      });
    }

    // Allow cancellation for Pending and Confirmed orders
    // Processing, Delivered, and Rejected orders cannot be cancelled from app
    if (!['Pending', 'Confirmed'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `You can only cancel orders with "Pending" or "Confirmed" status. Current status: ${order.status}. Orders in "Processing" or "Delivered" status cannot be cancelled.`
      });
    }

    // Restore stock when cancelling
    const StockMovement = (await import("../../models/Stock.js")).default;
    const StockMovementService = (await import("../../services/stockMovementService.js")).default;
    
    for (const product of order.products) {
      if (product.warehouse) {
        // Create stock movement to restore blocked stock
        const latestMovement = await StockMovement.findOne({
          productId: product.product,
          warehouseId: product.warehouse
        }).sort({ date: -1, createdAt: -1 });
        
        const currentBalance = latestMovement ? latestMovement.balance : 0;
        const newBalance = currentBalance + product.quantity;
        
        // Create IN movement to unblock stock
        const unblockMovement = new StockMovement({
          productId: product.product,
          warehouseId: product.warehouse,
          type: 'IN',
          quantity: product.quantity,
          balance: newBalance,
          referenceNo: order.orderNumber,
          referenceType: 'SALE',
          date: new Date(),
          remarks: `Order ${order.orderNumber} - Cancelled (Stock Unblocked)`,
          createdBy: req.user._id
        });
        await unblockMovement.save();
        
        console.log(`Order ${order.orderNumber} cancelled - stock unblocked for product ${product.product} in warehouse ${product.warehouse}. Balance: ${currentBalance} -> ${newBalance}`);
      }
    }

    order.status = 'Cancelled';
    order.cancelledAt = new Date();
    await order.save();

    // Create notification for dealer
    try {
      const message = `Your order ${order.orderNumber} has been cancelled.`;
      console.log(`📧 Notification for dealer ${order.dealer}: ${message}`);
      // TODO: Create Notification document and save to database
    } catch (notificationError) {
      console.error('Error creating notification:', notificationError);
    }

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

