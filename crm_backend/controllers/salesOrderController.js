// Sales Order Controller - Fixed duplicate function declarations
import { salesOrderSchema } from "../models/SalesOrder.js";
import { productSchema } from "../models/Product.js";
import { dealerSchema } from "../models/Dealer.js";
import { stockMovementSchema } from "../models/Stock.js";
import { userSchema } from "../models/User.js";
import { notificationSchema } from "../models/Notification.js";
import { warehouseSchema } from "../models/Warehouse.js";
import { regionSchema } from "../models/Region.js";
import { discountMappingSchema } from "../models/DiscountMapping.js";
import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { dealerLedgerSchema } from "../models/DealerLedger.js";
import { paymentAllocationSchema } from "../models/PaymentAllocation.js";
import { sendPushNotification } from '../services/firebaseNotificationService.js';

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    SalesOrder: dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema),
    Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
    Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema),
    StockMovement: dbConnection.models.StockMovement || dbConnection.model('StockMovement', stockMovementSchema),
    User: dbConnection.models.User || dbConnection.model('User', userSchema),
    Notification: dbConnection.models.Notification || dbConnection.model('Notification', notificationSchema),
    Warehouse: dbConnection.models.Warehouse || dbConnection.model('Warehouse', warehouseSchema),
    Region: dbConnection.models.Region || dbConnection.model('Region', regionSchema),
    DiscountMapping: dbConnection.models.DiscountMapping || dbConnection.model('DiscountMapping', discountMappingSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    DealerLedger: dbConnection.models.DealerLedger || dbConnection.model('DealerLedger', dealerLedgerSchema),
    PaymentAllocation: dbConnection.models.PaymentAllocation || dbConnection.model('PaymentAllocation', paymentAllocationSchema),
  };
};

/**
 * Calculate the true current credit outstanding for a dealer.
 * Matches the logic in dealerController.getDealerPaymentStatus:
 *   outstanding = (ledger debit - ledger credit) - paymentAllocations + confirmedOrdersNotYetInvoiced
 * 
 * @param {object} dbConnection - Company-specific database connection
 * @param {string} dealerId
 * @param {string|null} excludeOrderId  - pass a sales order _id to exclude it from confirmed-orders sum (for edit re-check)
 * @returns {Promise<number>}
 */
const getDealerCreditOutstanding = async (dbConnection, dealerId, excludeOrderId = null) => {
  const { DealerLedger, DealerInvoice, PaymentAllocation, SalesOrder, Dealer } = getModels(dbConnection);

  // 1. Ledger balance (invoices - payments)
  const ledgerEntries = await DealerLedger.find({ dealer: dealerId });
  const ledgerBalance = ledgerEntries.reduce(
    (sum, e) => sum + (e.debitAmount || 0) - (e.creditAmount || 0),
    0
  );

  // 2. Payment allocations (reduce outstanding)
  const paymentAllocations = await PaymentAllocation.find({ partyId: dealerId }).lean();
  const totalAllocated = paymentAllocations.reduce(
    (sum, a) => sum + (a.totalAllocated || 0),
    0
  );

  const invoiceOutstanding = ledgerBalance - totalAllocated;

  // 3. Confirmed/Processing orders not yet invoiced
  const confirmedOrders = await SalesOrder.find({
    dealer: dealerId,
    status: { $in: ['Confirmed', 'Processing', 'In Transit'] }
  }).populate('products.product', 'brand category subcategory').lean();

  const invoicedOrderIds = await DealerInvoice.distinct('salesOrder', {
    dealer: dealerId,
    salesOrder: { $ne: null },
    status: { $nin: ['Cancelled', 'Rejected', 'Draft'] },
    isDraft: { $ne: true }
  });
  const invoicedSet = new Set(invoicedOrderIds.map(id => id.toString()));

  // Fetch dealer extra discounts once for matching
  const dealerData = await Dealer.findById(dealerId).select('extraDiscounts').lean();
  const extraDiscounts = (dealerData?.extraDiscounts || []).filter(d => d.isActive !== false);

  // Helper: get dealer extra discount % for a product
  const getDealerExtraDiscountPct = (productDoc) => {
    if (!productDoc || !extraDiscounts.length) return 0;
    const productId = productDoc._id?.toString();
    const brandId = productDoc.brand?.toString();
    const categoryId = productDoc.category?.toString();
    const subcategoryId = productDoc.subcategory?.toString();
    for (const ed of extraDiscounts) {
      const targetId = ed.targetId?.toString();
      if (ed.targetType === 'product' && targetId === productId) return ed.discountPercentage || 0;
      if (ed.targetType === 'brand' && targetId === brandId) return ed.discountPercentage || 0;
      if (ed.targetType === 'category' && targetId === categoryId) return ed.discountPercentage || 0;
      if (ed.targetType === 'subcategory' && targetId === subcategoryId) return ed.discountPercentage || 0;
    }
    return 0;
  };

  const confirmedAmount = confirmedOrders.reduce((sum, order) => {
    if (invoicedSet.has(order._id.toString())) return sum;
    if (excludeOrderId && order._id.toString() === excludeOrderId.toString()) return sum;
    // Compute discounted total: direct discount (stored) + dealer extra discount
    const orderTotal = (order.products || []).reduce((s, p) => {
      const gross = p.quantity * p.unitPrice;
      const directDiscount = p.discountAmount || 0;
      const extraPct = getDealerExtraDiscountPct(p.product);
      const extraDiscount = (gross * extraPct) / 100;
      const base = gross - directDiscount - extraDiscount;
      const gst = (base * (p.gst || 0)) / 100;
      return s + base + gst;
    }, 0);
    return sum + orderTotal;
  }, 0);

  return invoiceOutstanding + confirmedAmount;
};

// Generate unique order number
const generateOrderNumber = async (dbConnection) => {
  try {
    const { SalesOrder } = getModels(dbConnection);
    const currentYear = new Date().getFullYear();
    const prefix = `SO-${currentYear}-`;
    
    // Find the highest order number for this year
    const lastOrder = await SalesOrder.findOne({
      orderNumber: { $regex: `^${prefix}` }
    }).sort({ orderNumber: -1 });
    
    let nextNumber = 1;
    if (lastOrder) {
      // Extract the number from the last order
      const lastNumber = parseInt(lastOrder.orderNumber.split('-')[2]);
      nextNumber = lastNumber + 1;
    }
    
    // Format with leading zeros (4 digits)
    const orderNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
    
    // Double-check uniqueness (in case of race conditions)
    const existingOrder = await SalesOrder.findOne({ orderNumber });
    if (existingOrder) {
      // If somehow it exists, try the next number
      return `${prefix}${(nextNumber + 1).toString().padStart(4, '0')}`;
    }
    
    return orderNumber;
  } catch (error) {
    console.error('Error generating order number:', error);
    // Fallback to timestamp-based number
    const timestamp = Date.now().toString().slice(-6);
    return `SO-${new Date().getFullYear()}-${timestamp}`;
  }
};

// @desc    Get all sales orders
// @route   GET /api/sales-orders
// @access  Private
export const getSalesOrders = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Dealer, Product, User, DealerInvoice } = getModels(req.dbConnection);
    
    const {
      page = 1,
      limit = 10,
      search,
      status,
      dealer,
      region,
      startDate,
      endDate,
      type,
      stockArrived,
      hideDelivered,
      // Advanced filters
      dateRange,
      expired,
      orderType,
      warehouse,
      dealerType,
      creditDaysRange,
      minAmount,
      maxAmount,
      product
    } = req.query;

    // Build query object
    const query = {};

    // Exclude Delivered orders by default unless explicitly requested
    if (hideDelivered === 'true') {
      query.status = { $ne: 'Delivered' };
    }

    // Search functionality
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { dealerName: { $regex: search, $options: "i" } },
        { "products.productName": { $regex: search, $options: "i" } }
      ];

    }

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Filter by stock arrived
    if (stockArrived === 'true' || stockArrived === true) {
      query.isOutOfStock = true;
      query.stockAvailable = true;
    }

    // Filter by dealer
    if (dealer) {
      query.dealer = dealer;
    }

    // Filter by product
    if (product) {
      query['products.product'] = product;
    }

    // Filter by region
    if (region) {
      query.region = region;
    }

    // Filter by order type (legacy param)
    if (type) {
      query.type = type;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.orderDate = {};
      if (startDate) query.orderDate.$gte = new Date(startDate);
      if (endDate) query.orderDate.$lte = new Date(endDate);
    }

    // Advanced: dateRange preset (overrides startDate/endDate if set)
    if (dateRange && dateRange !== "all" && !startDate && !endDate) {
      const now = new Date();
      const rangeStart = new Date();
      if (dateRange === "1day") rangeStart.setDate(now.getDate() - 1);
      else if (dateRange === "7days") rangeStart.setDate(now.getDate() - 7);
      else if (dateRange === "30days") rangeStart.setDate(now.getDate() - 30);
      else if (dateRange === "6months") rangeStart.setMonth(now.getMonth() - 6);
      else if (dateRange === "1year") rangeStart.setFullYear(now.getFullYear() - 1);
      query.orderDate = { $gte: rangeStart, $lte: now };
    }

    // Advanced: Expiry status filter
    if (expired && expired !== "all") {
      const now = new Date();
      if (expired === "expired") {
        query.isExpired = true;
      } else if (expired === "notExpired") {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { isExpired: false },
            { isExpired: { $exists: false } }
          ]
        });
      } else if (expired === "expiringSoon") {
        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(now.getDate() + 7);
        query.$and = query.$and || [];
        query.$and.push({
          expiryDate: { $gte: now, $lte: sevenDaysLater },
          isExpired: { $ne: true }
        });
      }
    }

    // Advanced: Order type (CD vs Regular vs Out of Stock)
    if (orderType && orderType !== "all") {
      if (orderType === "cd") {
        query.salesType = "CD Sales";
      } else if (orderType === "regular") {
        query.salesType = "Regular Sale";
      } else if (orderType === "outOfStock") {
        query.isOutOfStock = true;
      }
    }

    // Advanced: Warehouse filter (filter orders that have products in this warehouse)
    if (warehouse) {
      query['products.warehouse'] = warehouse;
    }

    // Advanced: Dealer type filter
    if (dealerType) {
      query.dealerType = dealerType;
    }

    // Advanced: Credit days range filter
    if (creditDaysRange && creditDaysRange !== "all") {
      if (creditDaysRange === "0") {
        query.creditDays = 0;
      } else if (creditDaysRange === "1-7") {
        query.creditDays = { $gte: 1, $lte: 7 };
      } else if (creditDaysRange === "8-15") {
        query.creditDays = { $gte: 8, $lte: 15 };
      } else if (creditDaysRange === "16-30") {
        query.creditDays = { $gte: 16, $lte: 30 };
      } else if (creditDaysRange === "30+") {
        query.creditDays = { $gt: 30 };
      }
    }

    // Advanced: Amount range filter
    if (minAmount || maxAmount) {
      query.totalAmount = {};
      if (minAmount) query.totalAmount.$gte = parseFloat(minAmount);
      if (maxAmount) query.totalAmount.$lte = parseFloat(maxAmount);
    }

    // Execute query with pagination
    const salesOrders = await SalesOrder.find(query)
      .populate("dealer", "name code contactPerson phone email address dealerType")
      .populate("region", "name")
      .populate("products.product", "productCode itemName HSNCode gst rateSlabs")
      .populate("products.warehouse", "name")
      .populate("products.appliedDiscount.discountId", "discountName discountType targetType")
      .populate("approvedBy", "name email")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Get total count for pagination
    const total = await SalesOrder.countDocuments(query);

    // Calculate additional analytics for each order
    // Bulk-lookup which orders have invoices (one query instead of N)
    const orderIds = salesOrders.map(o => o._id);
    const invoicedOrderIds = await DealerInvoice.distinct('salesOrder', {
      salesOrder: { $in: orderIds },
      status: { $nin: ['Cancelled', 'Rejected', 'Draft'] },
      isDraft: { $ne: true }
    });
    const invoicedSet = new Set(invoicedOrderIds.map(id => id.toString()));

    const ordersWithAnalytics = salesOrders.map(order => {
      const totalItems = order.products ? order.products.reduce((sum, product) => sum + (product.quantity || 0), 0) : 0;
      return {
        ...order,
        totalItems,
        hasInvoice: invoicedSet.has(order._id.toString()),
        isOverdue: order.dueDate && new Date(order.dueDate) < new Date() && order.status !== "Delivered" && order.status !== "Cancelled"
      };
    });

    res.json({
      success: true,
      salesOrders: ordersWithAnalytics,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get Sales Orders Error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      message: "Error fetching sales orders",
      error: error.message
    });
  }
};

// @desc    Get single sales order
// @route   GET /api/sales-orders/:id
// @access  Private
export const getSalesOrder = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);
    
    const salesOrder = await SalesOrder.findById(req.params.id)
      .populate("dealer", "name code contactPerson phone email address dealerType gstNumber panNumber")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("products.appliedDiscount.discountId", "discountName discountType targetType")
      .populate("approvedBy", "name email")
      .populate("createdBy", "name email");

    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    res.json({
      success: true,
      salesOrder
    });
  } catch (error) {
    console.error("Get Sales Order Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching sales order",
      error: error.message
    });
  }
};

// @desc    Create new sales order
// @route   POST /api/sales-orders
// @access  Private
export const createSalesOrder = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, Dealer, StockMovement, User, Notification, Warehouse } = getModels(req.dbConnection);
    
    console.log("Received request body:", req.body);
    
    const {
      dealer,
      region,
      pinCode,
      products,
      orderDate,
      deliveryDate,
      creditDays,
      type,
      salesType,
      remarks,
      status,
      isOutOfStock,
      stockValidation
    } = req.body;

    // Generate unique order number
    const orderNumber = await generateOrderNumber(req.dbConnection);
    console.log("Generated order number:", orderNumber);

    // Validate dealer exists
    const dealerData = await Dealer.findById(dealer);
    if (!dealerData) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }
    
    // Use dealer's credit days if not provided in request
    const finalCreditDays = creditDays !== undefined && creditDays !== null 
      ? parseInt(creditDays) 
      : (dealerData.creditDays || 30);

    // Validate credit days don't exceed dealer's limits
    if (creditDays !== undefined && creditDays !== null) {
      const requestedCreditDays = parseInt(creditDays);
      
      // Determine which limit to check based on salesType
      let maxCreditDays = 0;
      if (salesType === 'Regular Sale') {
        maxCreditDays = dealerData.creditDaysRegular || dealerData.creditDays || 0;
      } else if (salesType === 'CD Sales') {
        maxCreditDays = dealerData.creditDaysCD || dealerData.creditDays || 0;
      } else {
        // Default to regular if not specified
        maxCreditDays = dealerData.creditDaysRegular || dealerData.creditDays || 0;
      }
      
      if (requestedCreditDays > maxCreditDays && maxCreditDays > 0) {
        return res.status(400).json({
          success: false,
          message: `Credit days (${requestedCreditDays}) cannot exceed dealer's limit of ${maxCreditDays} days for ${salesType || 'Regular Sale'}.`
        });
      }
    }

    // Calculate order totals first (needed for credit limit check)
    // IMPORTANT: Only include IN-STOCK products in credit limit calculation
    const tempValidatedProducts = [];
    for (const item of products) {
      const product = await Product.findById(item.product);
      if (!product) continue;
      
      // Skip out-of-stock products (no warehouse or warehouse is "No Stock")
      const hasStock = item.warehouse && item.warehouse !== "No Stock";
      if (!hasStock) {
        console.log(`⏭️ Skipping product ${product.itemName} from credit limit calculation (out of stock)`);
        continue;
      }
      
      const unitPrice = item.unitPrice || product.rateSlabs[0]?.rate || 0;
      const gst = item.gst || product.gst || 0;
      // Use direct discount + dealer extra discount for credit limit calculation
      const directDiscountAmt = item.discountAmount || 0;
      const extraPct = (dealerData.extraDiscounts || [])
        .filter(d => d.isActive !== false)
        .reduce((pct, ed) => {
          if (pct > 0) return pct; // already found one
          const targetId = ed.targetId?.toString();
          if (ed.targetType === 'product' && targetId === product._id.toString()) return ed.discountPercentage || 0;
          if (ed.targetType === 'brand' && targetId === product.brand?.toString()) return ed.discountPercentage || 0;
          if (ed.targetType === 'category' && targetId === product.category?.toString()) return ed.discountPercentage || 0;
          if (ed.targetType === 'subcategory' && targetId === product.subcategory?.toString()) return ed.discountPercentage || 0;
          return 0;
        }, 0);
      const gross = item.quantity * unitPrice;
      const extraDiscountAmt = (gross * extraPct) / 100;
      const baseAmount = gross - directDiscountAmt - extraDiscountAmt;
      const gstAmount = (baseAmount * gst) / 100;
      
      tempValidatedProducts.push({
        quantity: item.quantity,
        unitPrice: unitPrice,
        gstAmount: gstAmount,
        discountAmount: directDiscountAmt + extraDiscountAmt,
        effectiveBaseAmount: baseAmount
      });
    }
    
    const orderGrossAmount = tempValidatedProducts.reduce((sum, p) => sum + p.effectiveBaseAmount, 0);
    const orderTotalGst = tempValidatedProducts.reduce((sum, p) => sum + p.gstAmount, 0);
    const orderTotalAmount = orderGrossAmount + orderTotalGst;

    console.log(`💰 Credit Limit Calculation - In-Stock Products Only:`, {
      totalProducts: products.length,
      inStockProducts: tempValidatedProducts.length,
      orderAmount: orderTotalAmount
    });

    // CREDIT LIMIT CHECK: If dealer has a credit limit and order exceeds it, force Pending status
    if (dealerData.creditLimit && dealerData.creditLimit > 0) {
      const currentOutstanding = await getDealerCreditOutstanding(req.dbConnection, dealerData._id);
      const newOutstanding = currentOutstanding + orderTotalAmount;
      
      console.log(`💳 Credit Limit Check (createSalesOrder):`, {
        creditLimit: dealerData.creditLimit,
        currentOutstanding,
        orderAmount: orderTotalAmount,
        newOutstanding,
        overlimit: newOutstanding - dealerData.creditLimit
      });
      
      if (newOutstanding > dealerData.creditLimit) {
        const overlimitAmount = newOutstanding - dealerData.creditLimit;
        console.log(`⚠️ Credit limit exceeded by ₹${overlimitAmount.toFixed(2)} - forcing status to Pending`);
        req.body.status = "Pending";
        req.body.creditOverlimit = {
          isOverlimit: true,
          creditLimit: dealerData.creditLimit,
          currentOutstanding,
          orderAmount: orderTotalAmount,
          newOutstanding,
          overlimitAmount,
          requiresApproval: true
        };
      }
    }

    // Validate and process each product
    const validatedProducts = [];

    for (const item of products) {
      // Validate product exists
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productName || item.product}`
        });
      }

      // Validate warehouse exists (skip if warehouse is "No Stock" for out-of-stock orders)
      if (item.warehouse && item.warehouse !== "No Stock") {
        const warehouse = await Warehouse.findById(item.warehouse);
        
        if (!warehouse) {
          return res.status(400).json({
            success: false,
            message: `Warehouse not found: ${item.warehouse}`
          });
        }

        // For out-of-stock orders, skip stock validation
        if (!isOutOfStock) {
          // For regular orders, validate stock availability
          const stock = await StockMovement.findOne({
            productId: item.product,
            warehouseId: item.warehouse
          });

          if (stock && stock.netStock < item.quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for ${product.itemName} in ${warehouse.name}. Available: ${stock.netStock}, Required: ${item.quantity}`
            });
          }
        }

        console.log(`Product ${product.itemName} validated for warehouse ${warehouse.name}`);
      } else if (item.warehouse === "No Stock") {
        console.log(`Product ${product.itemName} has no warehouse assigned (out-of-stock order)`);
      }

      // Calculate product details
      const unitPrice = item.unitPrice || product.rateSlabs[0]?.rate || 0;
      const gst = item.gst || product.gst || 0;
      const baseAmount = item.quantity * unitPrice;
      // Guard: discountAmount must never exceed baseAmount (prevents negative totals)
      const rawDiscountAmt = item.discountAmount || 0;
      const discountAmt = Math.min(rawDiscountAmt, baseAmount);
      if (rawDiscountAmt > baseAmount) {
        console.warn(`⚠️ discountAmount (${rawDiscountAmt}) exceeded baseAmount (${baseAmount}) for product ${product.itemName} — capped to baseAmount`);
      }
      const discountedBase = baseAmount - discountAmt;
      const gstAmount = (discountedBase * gst) / 100;
      const totalPrice = discountedBase + gstAmount;

      // Build product object
      validatedProducts.push({
        product: item.product,
        productCode: product.productCode,
        productName: product.itemName,
        HSNCode: product.HSNCode,
        quantity: item.quantity,
        unitPrice: unitPrice,
        gst: gst,
        gstAmount: gstAmount,
        totalPrice: totalPrice,
        salesType: product.salesType || 'Regular Sale', // Add salesType from product
        warehouse: item.warehouse === "No Stock" ? null : item.warehouse, // Set to null if "No Stock"
        warehouseName: item.warehouse === "No Stock" ? "No Stock" : item.warehouseName,
        discountPercentage: item.discountPercentage || 0,
        discountAmount: discountAmt,
        discountType: item.discountType || null,
        selectedDiscountLevel: item.selectedDiscountLevel || null,
        appliedDiscount: item.appliedDiscount || null
      });
    }

    // Calculate order totals
    const grossAmount = validatedProducts.reduce((sum, product) => sum + (product.quantity * product.unitPrice), 0);
    const totalGst = validatedProducts.reduce((sum, product) => sum + product.gstAmount, 0);
    const discountAmount = validatedProducts.reduce((sum, product) => sum + (product.discountAmount || 0), 0);
    const totalAmount = grossAmount + totalGst - discountAmount;

    // Calculate due date
    let dueDate = null;
    if (orderDate && finalCreditDays) {
      dueDate = new Date(orderDate);
      dueDate.setDate(dueDate.getDate() + finalCreditDays);
    }

    // Determine initial status based on stock availability
    // Use req.body.status in case credit limit check overrode it to "Pending"
    let initialStatus = req.body.status || status || "Pending";
    
    // For out-of-stock orders, force status to Pending and prevent status changes
    if (isOutOfStock) {
      initialStatus = "Pending";
      console.log("🚨 Creating out-of-stock sales order - status locked to Pending");
    }

    // Create sales order
    console.log("Creating sales order with orderNumber:", orderNumber);
    console.log("All values:", { 
      orderNumber, 
      dealer, 
      dealerName: dealerData.name, 
      dealerCode: dealerData.code, 
      dealerType: dealerData.dealerType, 
      region, 
      pinCode, 
      products: validatedProducts.length, 
      orderDate, 
      deliveryDate, 
      creditDays: finalCreditDays, 
      grossAmount, 
      totalGst, 
      totalAmount, 
      type, 
      remarks,
      isOutOfStock: isOutOfStock || false,
      stockValidation: stockValidation || []
    });
    
    // Initialize stock tracking fields for ALL orders (not just out-of-stock)
    // This ensures stock status is always available for display
    for (const product of validatedProducts) {
      if (isOutOfStock) {
        // Out-of-stock orders: mark as waiting
        product.stockStatus = 'waiting';
        product.availableQuantity = 0;
        product.stockCheckedAt = new Date();
      } else {
        // In-stock orders: mark as available (stock was validated during creation)
        product.stockStatus = 'available';
        product.availableQuantity = product.quantity;
        product.stockCheckedAt = new Date();
      }
    }
    
    const salesOrder = new SalesOrder({
      orderNumber,
      dealer,
      dealerName: dealerData.name,
      dealerCode: dealerData.code,
      dealerType: dealerData.dealerType,
      region,
      pinCode,
      products: validatedProducts,
      orderDate,
      deliveryDate,
      creditDays: finalCreditDays,
      dueDate,
      grossAmount,
      totalGst,
      discountAmount,
      totalAmount,
      type,
      salesType: salesType || 'Regular Sale',
      remarks,
      status: initialStatus,
      createdBy: req.user._id,
      // Out-of-stock fields
      isOutOfStock: isOutOfStock || false,
      stockValidation: stockValidation || [],
      // Credit overlimit fields
      creditOverlimit: req.body.creditOverlimit || undefined,
      // Initialize order-level stock status for ALL orders
      orderStockStatus: {
        totalProducts: validatedProducts.length,
        availableProducts: isOutOfStock ? 0 : validatedProducts.length,
        partialProducts: 0,
        waitingProducts: isOutOfStock ? validatedProducts.length : 0,
        overallStatus: isOutOfStock ? 'waiting' : 'ready',
        lastChecked: new Date()
      }
    });

    // Automatically set 15-day expiry for Pending orders
    if (salesOrder.status === "Pending") {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 15); // 15 days from now
      
      salesOrder.expiryDate = expiryDate;
      salesOrder.expiryReason = 'Automatic 15-day expiry for pending order';
      salesOrder.expiryHistory.push({
        action: 'set',
        previousDate: null,
        newDate: expiryDate,
        reason: 'Automatic 15-day expiry set on order creation',
        performedBy: req.user._id,
        performedAt: new Date()
      });
      
      console.log(`📅 Automatic expiry set for pending order ${orderNumber}: ${expiryDate.toISOString()}`);
    }

    // Save sales order
    await salesOrder.save();

    // Handle stock updates based on initial status (only for in-stock orders)
    if (!isOutOfStock) {
      if (salesOrder.status === "Confirmed") {
        console.log("Order created with Confirmed status - blocking stock");
        for (const product of salesOrder.products) {
          if (product.warehouse) { // Only process if warehouse is not null
            // Get current balance before creating the movement
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });
            
            const currentBalance = latestMovement ? latestMovement.balance : 0;
            const newBalance = currentBalance - product.quantity;
            
            const blockMovement = new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'OUT',
              quantity: product.quantity,
              balance: newBalance,
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Stock Blocked`,
              createdBy: req.user._id
            });
            await blockMovement.save();
            console.log(`Blocked ${product.quantity} units of product ${product.product} in warehouse ${product.warehouse}. Balance: ${currentBalance} -> ${newBalance}`);
          }
        }
      } else if (salesOrder.status === "Delivered") {
        console.log("Order created with Delivered status - permanently reducing stock");
        for (const product of salesOrder.products) {
          if (product.warehouse) { // Only process if warehouse is not null
            // Get current balance before creating the movement
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });
            
            const currentBalance = latestMovement ? latestMovement.balance : 0;
            const newBalance = currentBalance - product.quantity;
            
            // Create stock movement for delivered order (permanent reduction)
            const deliveryMovement = new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'OUT',
              quantity: product.quantity,
              balance: newBalance,
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
              createdBy: req.user._id
            });
            await deliveryMovement.save();
            console.log(`Order ${salesOrder.orderNumber} delivered - stock permanently reduced for product ${product.product} in warehouse ${product.warehouse}. Balance: ${currentBalance} -> ${newBalance}`);
          }
        }
      }
    } else {
      console.log("🚨 Out-of-stock order created - no stock movements will be made until stock is available");
    }

    // Populate the created order for response
    const populatedOrder = await SalesOrder.findById(salesOrder._id)
      .populate("dealer", "name code contactPerson phone email address dealerType")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: isOutOfStock ? 
        "Out-of-stock sales order created successfully. Status is locked to Pending until stock is available." :
        "Sales order created successfully",
      salesOrder: populatedOrder
    });

    // Send push notification to dealer (non-blocking, after response)
    try {
      const dealerDoc = await Dealer.findById(salesOrder.dealer).select('fcmToken').lean();
      if (dealerDoc?.fcmToken) {
        const soTitle = 'Sales Order Created';
        const soMsg   = `Sales order ${salesOrder.orderNumber} has been created for you. Total: Rs. ${(salesOrder.totalAmount || 0).toLocaleString('en-IN')}.`;
        await Notification.create({
          dealer: salesOrder.dealer,
          type: 'order_status',
          title: soTitle,
          message: soMsg,
          orderId: salesOrder._id,
          orderNumber: salesOrder.orderNumber,
          status: salesOrder.status,
          priority: 'high',
          metadata: { originalType: 'sales_order_created' },
        });
        await sendPushNotification({
          token: dealerDoc.fcmToken,
          title: soTitle,
          body: soMsg,
          data: { type: 'order_status', orderId: salesOrder._id.toString(), orderNumber: salesOrder.orderNumber },
        });
      }
    } catch (notifErr) { console.error('SO notification error (non-fatal):', notifErr.message); }
  } catch (error) {
    console.error("Create Sales Order Error:", error);
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    if (error.errors) {
      console.error("Validation errors:", JSON.stringify(error.errors, null, 2));
    }
    
    // Handle duplicate order number error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Order number already exists"
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      const details = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value,
        kind: error.errors[key].kind
      }));
      console.error('❌ Validation Error Details:', details);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages,
        details: details
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating sales order",
      error: error.message
    });
  }
};

// @desc    Update sales order status (approval/rejection)
// @route   PATCH /api/sales-orders/:id/status
// @access  Private
export const updateSalesOrderStatus = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, StockMovement, Dealer, User, Notification, DealerLedger } = getModels(req.dbConnection);
    
    const { status, remarks, products } = req.body; // products array with warehouse info
    const { id } = req.params;

    // Find the sales order
    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    // Validate status transition
    const allowedStatuses = ["Confirmed", "Rejected", "Cancelled", "Processing", "Delivered"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status update"
      });
    }

    // Store original status for rollback if needed
    const originalStatus = salesOrder.status;

    // Update product warehouses if provided in request (when status is updated from web)
    let warehouseAssigned = false;
    if (products && Array.isArray(products) && products.length > 0) {
      for (let i = 0; i < salesOrder.products.length && i < products.length; i++) {
        if (products[i].warehouse) {
          // Check if warehouse changed from null/"No Stock" to actual warehouse
          const oldWarehouse = salesOrder.products[i].warehouse;
          const newWarehouse = products[i].warehouse;
          
          if (!oldWarehouse && newWarehouse) {
            warehouseAssigned = true;
          }
          
          salesOrder.products[i].warehouse = newWarehouse;
          salesOrder.products[i].warehouseName = products[i].warehouseName || null;
        }
      }
    }

    // AUTOMATIC: If warehouse is assigned to out-of-stock order, keep tracking stock arrival
    // DO NOT clear isOutOfStock flag - we need it to track stock arrival status
    if (salesOrder.isOutOfStock && warehouseAssigned) {
      console.log("🎯 Warehouse assigned to out-of-stock order - keeping isOutOfStock=true for stock tracking");
      // salesOrder.isOutOfStock = false;  // REMOVED: Keep flag for stock tracking
      salesOrder.stockValidation = [];  // Clear validation since warehouse is now assigned
    }

    // CRITICAL: Prevent status changes for out-of-stock orders ONLY if stock is not ready
    // Allow status change if stock is ready (all products available)
    if (salesOrder.isOutOfStock && 
        status !== "Cancelled" && 
        status !== "Rejected" &&
        salesOrder.orderStockStatus?.overallStatus !== 'ready') {
      return res.status(400).json({
        success: false,
        message: "Cannot change status of out-of-stock orders until stock arrives. Current stock status: " + (salesOrder.orderStockStatus?.overallStatus || 'unknown')
      });
    }

    // CRITICAL: Prevent status change to Confirmed if credit limit is exceeded and not approved
    if (status === "Confirmed" &&
        salesOrder.creditOverlimit && 
        salesOrder.creditOverlimit.isOverlimit && 
        !salesOrder.creditOverlimit.approvedBy) {
      return res.status(400).json({
        success: false,
        message: `Cannot confirm order - Credit limit exceeded by ₹${(salesOrder.creditOverlimit.overlimitAmount || 0).toLocaleString()}. Super Admin approval required before this order can be confirmed.`
      });
    }

    // Also check live credit limit when confirming, in case it wasn't checked at creation
    // Skip if order was already approved by Super Admin
    if (status === "Confirmed" && originalStatus !== "Confirmed") {
      const alreadyApproved = salesOrder.creditOverlimit &&
                              salesOrder.creditOverlimit.isOverlimit &&
                              salesOrder.creditOverlimit.approvedBy;

      if (!alreadyApproved) {
        const dealerData = await Dealer.findById(salesOrder.dealer);
        if (dealerData && dealerData.creditLimit && dealerData.creditLimit > 0) {
          const currentOutstanding = await getDealerCreditOutstanding(req.dbConnection, salesOrder.dealer, salesOrder._id);
          const newOutstanding = currentOutstanding + salesOrder.totalAmount;
          if (newOutstanding > dealerData.creditLimit) {
            const overlimitAmount = newOutstanding - dealerData.creditLimit;
            salesOrder.creditOverlimit = {
              isOverlimit: true,
              creditLimit: dealerData.creditLimit,
              currentOutstanding,
              orderAmount: salesOrder.totalAmount,
              newOutstanding,
              overlimitAmount,
              requiresApproval: true
            };
            await salesOrder.save();
            return res.status(400).json({
              success: false,
              message: `Cannot confirm order - Credit limit exceeded by ₹${overlimitAmount.toLocaleString()}. Super Admin approval required.`,
              creditOverlimit: salesOrder.creditOverlimit
            });
          }
        }
      }
    }

    // Special handling for Confirmed status (stock allocation) - only for in-stock orders
    if (status === "Confirmed" && !salesOrder.isOutOfStock) {
      // CRITICAL: Verify stock availability for all products BEFORE confirming
      const stockShortages = [];
      
      for (const product of salesOrder.products) {
        if (product.warehouse) {
          // Get current balance
          const latestMovement = await StockMovement.findOne({
            productId: product.product,
            warehouseId: product.warehouse
          }).sort({ date: -1, createdAt: -1 });
          
          const currentBalance = latestMovement ? latestMovement.balance : 0;
          
          // Check if enough stock available
          if (currentBalance < product.quantity) {
            const productDetails = await Product.findById(product.product);
            stockShortages.push({
              productName: productDetails?.itemName || product.productName || 'Unknown',
              productCode: productDetails?.productCode || 'N/A',
              required: product.quantity,
              available: currentBalance,
              shortage: product.quantity - currentBalance
            });
          }
        }
      }
      
      // If there are stock shortages, provide guidance on splitting the order
      if (stockShortages.length > 0) {
        console.log("⚠️ Stock shortage detected during confirmation:", stockShortages);
        
        // Calculate total available vs required
        const totalRequired = stockShortages.reduce((sum, s) => sum + s.required, 0);
        const totalAvailable = stockShortages.reduce((sum, s) => sum + s.available, 0);
        const totalShortage = stockShortages.reduce((sum, s) => sum + s.shortage, 0);
        
        // Build detailed error message with splitting suggestion
        const shortageDetails = stockShortages.map(s => 
          `  • ${s.productName} (${s.productCode}): Need ${s.required}, Available ${s.available}, Short ${s.shortage}`
        ).join('\n');
        
        return res.status(400).json({
          success: false,
          message: `Cannot confirm order - Insufficient stock for ${stockShortages.length} product(s)`,
          stockShortages: stockShortages,
          details: shortageDetails,
          suggestion: {
            action: 'split_order',
            message: `This order should be split into two orders:
            
📦 Order 1 (In-Stock): ${totalAvailable} units - Can be confirmed immediately
⏳ Order 2 (Pending): ${totalShortage} units - Will be fulfilled when stock arrives

To split this order:
1. Cancel this order (${salesOrder.orderNumber})
2. Create a new order with ${totalAvailable} units (available stock)
3. Create another order with ${totalShortage} units (mark as out-of-stock)

OR wait for stock to arrive and this order will be auto-processed.`,
            totalRequired: totalRequired,
            totalAvailable: totalAvailable,
            totalShortage: totalShortage
          }
        });
      }

      // Update order with approval info
      salesOrder.approvedBy = req.user._id;
      salesOrder.approvedAt = new Date();
    }

    // Handle stock restoration for rejected or cancelled orders (only for previously confirmed orders)
    // Note: Stock restoration is handled via StockMovement IN records below
    
    // Handle stock management based on status changes (only for in-stock orders)
    if (!salesOrder.isOutOfStock) {
      if (status === "Confirmed" && originalStatus !== "Confirmed") {
        // Block stock for confirmed orders
        console.log("Blocking stock for confirmed order");
        for (const product of salesOrder.products) {
          if (product.warehouse) {
            // Get current balance before creating the movement

            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });
            
            const currentBalance = latestMovement ? latestMovement.balance : 0;
            const newBalance = currentBalance - product.quantity;
            
            const blockMovement = new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'OUT',
              quantity: product.quantity,
              balance: newBalance,
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Stock Blocked`,
              createdBy: req.user._id
            });
            await blockMovement.save();
            console.log(`Blocked ${product.quantity} units of product ${product.product} in warehouse ${product.warehouse}. Balance: ${currentBalance} -> ${newBalance}`);
          }
        }
      } else if (status === "Delivered") {
        // Handle delivered orders - either from Confirmed or directly from Pending
        console.log(`Order delivered - ${originalStatus === "Confirmed" ? "unblocking and permanently reducing stock" : "permanently reducing stock"}`);
        for (const product of salesOrder.products) {
          if (product.warehouse) {
            // Get current balance before creating the movement

            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });
            
            const currentBalance = latestMovement ? latestMovement.balance : 0;
            
            if (originalStatus === "Confirmed") {
              // Step 1: Unblock the previously blocked stock
              const unblockMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'IN',
                quantity: product.quantity,
                balance: currentBalance + product.quantity,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Stock Unblocked (Delivered)`,
                createdBy: req.user._id
              });
              await unblockMovement.save();
              console.log(`Unblocked ${product.quantity} units for order ${salesOrder.orderNumber} - product ${product.product} in warehouse ${product.warehouse}`);
              
              // Step 2: Permanently reduce stock
              const newBalance = currentBalance; // Balance stays same because we unblocked then reduced
              const deliveryMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'OUT',
                quantity: product.quantity,
                balance: newBalance,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
                createdBy: req.user._id
              });
              await deliveryMovement.save();
              console.log(`Order ${salesOrder.orderNumber} delivered - stock permanently reduced for product ${product.product} in warehouse ${product.warehouse}. Final balance: ${newBalance}`);
            } else {
              // Direct delivery from Pending - reduce stock permanently
              const newBalance = currentBalance - product.quantity;
              const deliveryMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'OUT',
                quantity: product.quantity,
                balance: newBalance,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
                createdBy: req.user._id
              });
              await deliveryMovement.save();
              console.log(`Order ${salesOrder.orderNumber} delivered - stock permanently reduced for product ${product.product} in warehouse ${product.warehouse}. Balance: ${currentBalance} -> ${newBalance}`);
            }
          }
        }
      } else if ((status === "Cancelled" || status === "Rejected") && originalStatus === "Confirmed") {
        // Unblock stock for cancelled/rejected orders
        console.log("Unblocking stock for cancelled/rejected order");
        
        // ALWAYS check stock movements first (more reliable than products array)

        
        // Find all OUT movements for this order that haven't been restored
        const outMovements = await StockMovement.find({
          referenceNo: salesOrder.orderNumber,
          type: 'OUT'
        });
        
        console.log(`Found ${outMovements.length} OUT movements for order ${salesOrder.orderNumber}`);
        
        if (outMovements.length > 0) {
          console.log("Restoring stock from stock movements...");
          
          for (const outMovement of outMovements) {
            // Check if already restored
            const existingInMovement = await StockMovement.findOne({
              referenceNo: salesOrder.orderNumber,
              type: 'IN',
              productId: outMovement.productId,
              warehouseId: outMovement.warehouseId
            });
            
            if (existingInMovement) {
              console.log(`Stock already restored for product ${outMovement.productId} in warehouse ${outMovement.warehouseId}`);
              continue;
            }
            
            // Get current balance
            const latestMovement = await StockMovement.findOne({
              productId: outMovement.productId,
              warehouseId: outMovement.warehouseId
            }).sort({ date: -1, createdAt: -1 });
            
            const currentBalance = latestMovement ? latestMovement.balance : 0;
            const newBalance = currentBalance + outMovement.quantity;
            
            // Create IN movement to restore stock
            const unblockMovement = new StockMovement({
              productId: outMovement.productId,
              warehouseId: outMovement.warehouseId,
              type: 'IN',
              quantity: outMovement.quantity,
              balance: newBalance,
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Stock Unblocked (${status})`,
              createdBy: req.user._id
            });
            await unblockMovement.save();
            console.log(`✅ Restored ${outMovement.quantity} units of product ${outMovement.productId} in warehouse ${outMovement.warehouseId}. Balance: ${currentBalance} -> ${newBalance}`);
          }
        } else if (!salesOrder.products || salesOrder.products.length === 0) {
          console.log("⚠️ WARNING: No OUT movements found and products array is empty!");
        } else {
          // Fallback: Use products array if no movements found (shouldn't happen normally)
          console.log("No OUT movements found, using products array as fallback");
          
          for (const product of salesOrder.products) {
            if (product.warehouse) {
              // Check if already restored
              const existingInMovement = await StockMovement.findOne({
                referenceNo: salesOrder.orderNumber,
                type: 'IN',
                productId: product.product,
                warehouseId: product.warehouse
              });
              
              if (existingInMovement) {
                console.log(`Stock already restored for product ${product.product} in warehouse ${product.warehouse}`);
                continue;
              }
              
              // Get current balance
              const latestMovement = await StockMovement.findOne({
                productId: product.product,
                warehouseId: product.warehouse
              }).sort({ date: -1, createdAt: -1 });
              
              const currentBalance = latestMovement ? latestMovement.balance : 0;
              const newBalance = currentBalance + product.quantity;
              
              const unblockMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'IN',
                quantity: product.quantity,
                balance: newBalance,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Stock Unblocked (${status})`,
                createdBy: req.user._id
              });
              await unblockMovement.save();
              console.log(`Unblocked ${product.quantity} units of product ${product.product} in warehouse ${product.warehouse}. Balance: ${currentBalance} -> ${newBalance}`);
            }
          }
        }
        
        // Check if any waiting orders can now be fulfilled
        for (const outMovement of outMovements) {
          try {
            const StockArrivalService = (await import("../services/stockArrivalService.js")).default;
            const checkResult = await StockArrivalService.checkWaitingOrdersForStock(
              outMovement.productId,
              outMovement.warehouseId,
              0,
              req.dbConnection
            );
            if (checkResult.notifiedOrders > 0) {
              console.log(`✅ Notified ${checkResult.notifiedOrders} waiting orders about stock availability`);
            }
          } catch (error) {
            console.error("Error checking waiting orders:", error);
          }
        }
      } else if ((status === "Cancelled" || status === "Rejected") && originalStatus !== "Confirmed") {
        console.log("Order was not confirmed, no stock to restore");
      }
    } else {
      console.log("🚨 Out-of-stock order - no stock movements will be made");
    }

    // Credit limit is tracked via getDealerCreditOutstanding which reads confirmed orders
    // directly from SalesOrder collection - no ledger entries needed for credit blocking.

    // Update order status and remarks
    salesOrder.status = status;
    if (remarks) {
      salesOrder.remarks = remarks;
    }

    // IMPORTANT: Cancel expiry when status changes from Pending to any other status
    if (originalStatus === "Pending" && status !== "Pending" && salesOrder.expiryDate) {
      console.log(`📅 Cancelling expiry for order ${salesOrder.orderNumber} - status changed from Pending to ${status}`);
      
      salesOrder.expiryHistory.push({
        action: 'cancelled',
        previousDate: salesOrder.expiryDate,
        newDate: null,
        reason: `Expiry automatically cancelled - order status changed from Pending to ${status}`,
        performedBy: req.user._id,
        performedAt: new Date()
      });
      
      salesOrder.expiryDate = null;
      salesOrder.expiryReason = null;
      salesOrder.isExpired = false;
    }

    await salesOrder.save();

    // NOTE: Credit limit blocking moved to invoice approval stage
    // Sales orders no longer block credit limit on confirmation
    // Credit limit is blocked when invoice is approved, not when order is confirmed
    
    // REMOVE/REVERSE LEDGER ENTRY when order is CANCELLED or REJECTED (if it was previously Confirmed)
    // NOTE: This is kept for backward compatibility with old orders that had ledger entries
    if ((status === "Cancelled" || status === "Rejected") && originalStatus === "Confirmed") {
      try {
        console.log(`💳 Checking for ledger entry to reverse for order ${salesOrder.orderNumber}`);
        


        
        // Check if there's a ledger entry for this order (old orders might have one)
        const existingLedgerEntry = await DealerLedger.findOne({
          dealer: salesOrder.dealer,
          transactionType: "Order Confirmed",
          description: { $regex: salesOrder.orderNumber }
        });
        
        if (existingLedgerEntry) {
          console.log(`✅ Found existing ledger entry to reverse`);
          
          // Get dealer details
          const dealer = await Dealer.findById(salesOrder.dealer);
          if (!dealer) {
            console.error(`❌ Dealer not found for order ${salesOrder.orderNumber}`);
          } else {
            // Create reverse ledger entry to unblock credit limit
            const reverseLedgerEntry = new DealerLedger({
              dealer: salesOrder.dealer,
              dealerName: dealer.name,
              dealerCode: dealer.code,
              entryDate: new Date(),
              transactionType: "Order Confirmed - Reversed",
              salesType: salesOrder.salesType || 'Regular Sale',
              debitAmount: 0,
              creditAmount: salesOrder.totalAmount, // Decrease outstanding (unblock credit)
              description: `Order ${status} - ${salesOrder.orderNumber}`,
              remarks: `Credit limit unblocked - order ${salesOrder.orderNumber} was ${status.toLowerCase()}. Amount released: ₹${salesOrder.totalAmount.toLocaleString()}`,
              status: "Active",
              createdBy: req.user._id
            });
            
            await reverseLedgerEntry.save();
            console.log(`✅ Reverse ledger entry created - Credit limit unblocked: ₹${salesOrder.totalAmount.toLocaleString()} for order ${salesOrder.orderNumber}`);
            console.log(`   Running Balance: ₹${reverseLedgerEntry.runningBalance.toLocaleString()}`);
          }
        } else {
          console.log(`ℹ️ No ledger entry found for order ${salesOrder.orderNumber} - nothing to reverse`);
        }
      } catch (ledgerError) {
        console.error('❌ Error creating reverse ledger entry:', ledgerError);
        // Don't fail the request if ledger creation fails
      }
    }

    // Create notification for dealer about status change (for any status change)
    if (originalStatus !== status) {
      try {
        const statusMessages = {
          'Confirmed': `Your order ${salesOrder.orderNumber} has been confirmed.`,
          'Processing': `Your order ${salesOrder.orderNumber} is now being processed.`,
          'Delivered': `Your order ${salesOrder.orderNumber} has been delivered.`,
          'Rejected': `Your order ${salesOrder.orderNumber} has been rejected.`,
          'Cancelled': `Your order ${salesOrder.orderNumber} has been cancelled.`
        };

        const statusTitles = {
          'Confirmed': 'Order Confirmed',
          'Processing': 'Order Processing',
          'Delivered': 'Order Delivered',
          'Rejected': 'Order Rejected',
          'Cancelled': 'Order Cancelled'
        };

        const message = statusMessages[status] || `Your order ${salesOrder.orderNumber} status has been updated to ${status}.`;
        const title = statusTitles[status] || `Order ${status}`;
        
        // Determine priority based on status
        let priority = 'medium';
        if (status === 'Delivered' || status === 'Confirmed') {
          priority = 'high';
        } else if (status === 'Rejected' || status === 'Cancelled') {
          priority = 'high';
        }
        
        // Create and save notification
        await Notification.create({
          dealer: salesOrder.dealer,
          type: 'order_status',
          title: title,
          message: message,
          orderId: salesOrder._id,
          orderNumber: salesOrder.orderNumber,
          status: status,
          read: false,
          priority: priority
        });

        // Send push notification to dealer
        try {
          const dealerForPush = await Dealer.findById(salesOrder.dealer).select('fcmToken').lean();
          if (dealerForPush?.fcmToken) {
            await sendPushNotification({
              token: dealerForPush.fcmToken,
              title,
              body: message,
              data: {
                type: 'order_status',
                orderId: salesOrder._id.toString(),
                orderNumber: salesOrder.orderNumber,
                status,
              },
            });
          }
        } catch (pushErr) {
          console.error('Push notification error (non-fatal):', pushErr.message);
        }

        console.log(`📧 Notification created for dealer ${salesOrder.dealer}: ${message} (Status changed from ${originalStatus} to ${status})`);
      } catch (notificationError) {
        console.error('Error creating notification:', notificationError);
        // Don't fail the request if notification fails
      }
    }

    // Populate updated order for response
    const updatedOrder = await SalesOrder.findById(id)
      .populate("dealer", "name code contactPerson phone email address dealerType")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("approvedBy", "name email")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: `Order ${status.toLowerCase()} successfully`,
      salesOrder: updatedOrder
    });
  } catch (error) {
    console.error("Update Sales Order Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating sales order status",
      error: error.message
    });
  }
};

// @desc    Assign warehouse to out-of-stock order and clear out-of-stock flag
// @route   PATCH /api/sales-orders/:id/assign-warehouse
// @access  Private
export const assignWarehouseToOutOfStockOrder = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, StockMovement } = getModels(req.dbConnection);
    
    const { id } = req.params;
    const { products } = req.body; // Array of { productIndex, warehouse, warehouseName }

    // Find the sales order
    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    // Verify this is an out-of-stock order
    if (!salesOrder.isOutOfStock) {
      return res.status(400).json({
        success: false,
        message: "This order is not marked as out-of-stock"
      });
    }

    // Verify stock availability for all products with assigned warehouses
    for (const productUpdate of products) {
      const product = salesOrder.products[productUpdate.productIndex];
      
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product at index ${productUpdate.productIndex} not found`
        });
      }

      if (productUpdate.warehouse) {
        // Check stock availability
        const stock = await StockMovement.findOne({
          productId: product.product,
          warehouseId: productUpdate.warehouse
        });

        if (!stock) {
          return res.status(400).json({
            success: false,
            message: `Product ${product.productName} not available in selected warehouse`
          });
        }

        if (stock.netStock < product.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.productName}. Available: ${stock.netStock}, Required: ${product.quantity}`
          });
        }
      }
    }

    // Update warehouses for products
    for (const productUpdate of products) {
      if (productUpdate.warehouse) {
        salesOrder.products[productUpdate.productIndex].warehouse = productUpdate.warehouse;
        salesOrder.products[productUpdate.productIndex].warehouseName = productUpdate.warehouseName;
      }
    }

    // Keep out-of-stock flag for stock tracking - DO NOT clear it
    // The flag is needed to track stock arrival status
    // salesOrder.isOutOfStock = false;  // REMOVED: Keep flag for stock tracking
    salesOrder.stockValidation = []; // Clear validation results since warehouse is assigned

    await salesOrder.save();

    // Populate updated order for response
    const updatedOrder = await SalesOrder.findById(id)
      .populate("dealer", "name code contactPerson phone email address dealerType")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("approvedBy", "name email")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: "Warehouse assigned successfully. Order is now ready to be confirmed.",
      salesOrder: updatedOrder
    });
  } catch (error) {
    console.error("Assign Warehouse Error:", error);
    res.status(500).json({
      success: false,
      message: "Error assigning warehouse",
      error: error.message
    });
  }
};

// @desc    Update sales order
// @route   PUT /api/sales-orders/:id
// @access  Private
export const updateSalesOrder = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, Dealer, StockMovement, User, Notification, DealerLedger } = getModels(req.dbConnection);
    
    const { id } = req.params;
    
    // Find the sales order
    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    // Only allow editing of Pending, Confirmed, and Processing orders
    // Delivered, Cancelled, and Rejected orders cannot be edited
    const editableStatuses = ["Pending", "Confirmed", "Processing"];
    
    // Normalize status for comparison (trim whitespace, ensure proper case)
    const currentStatus = salesOrder.status ? String(salesOrder.status).trim() : null;
    
    // Debug logging
    console.log("🔍 Update Sales Order - Status Check:");
    console.log("  - Order ID:", id);
    console.log("  - Order Number:", salesOrder.orderNumber);
    console.log("  - Current Status (raw):", salesOrder.status);
    console.log("  - Current Status (normalized):", currentStatus);
    console.log("  - Status Type:", typeof salesOrder.status);
    console.log("  - Editable Statuses:", editableStatuses);
    console.log("  - Is Editable:", editableStatuses.includes(currentStatus));
    
    if (!currentStatus || !editableStatuses.includes(currentStatus)) {
      const errorMessage = `Can only edit orders with status "Pending", "Confirmed", or "Processing". Current status: ${currentStatus || 'undefined'}. Orders with status "Delivered", "Cancelled", or "Rejected" cannot be edited.`;
      console.log("❌ Edit Rejected:", errorMessage);
      return res.status(400).json({
        success: false,
        message: errorMessage
      });
    }
    
    console.log("✅ Edit Allowed for status:", currentStatus);

    // Validate products if they are being updated
    if (req.body.products) {
      console.log("Update order - received products:", req.body.products);
      for (const item of req.body.products) {
        console.log("Validating product item:", item);
        console.log("Product ID to validate:", item.product);
        
        if (!item.product) {
          return res.status(400).json({
            success: false,
            message: `Product ID is missing in product data: ${JSON.stringify(item)}`
          });
        }
        
        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(404).json({
            success: false,
            message: `Product not found: ${item.product}`
          });
        }

        // Validate warehouse stock if warehouse is specified
        if (item.warehouse) {
          const stock = await StockMovement.findOne({
            productId: item.product,
            warehouseId: item.warehouse
          });

          if (!stock) {
            return res.status(400).json({
              success: false,
              message: `Product ${product.itemName} not available in selected warehouse`
            });
          }

          if (stock.netStock < item.quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for ${product.itemName} in ${stock.warehouse}. Available: ${stock.netStock}`
            });
          }
        }
      }
      
      // RE-CHECK CREDIT LIMIT when products are being edited
      // CRITICAL FIX: Only re-check credit limit when products ACTUALLY CHANGE (quantity, price, or products added/removed)
      // Do NOT recalculate when just changing status from Pending to Confirmed
      console.log("🔍 Checking if products actually changed...");
      
      // Compare new products with existing products to detect actual changes
      let productsActuallyChanged = false;

      // If order is already approved by Super Admin, still re-check if amount increased
      const orderAlreadyApproved = salesOrder.creditOverlimit &&
                                   salesOrder.creditOverlimit.isOverlimit &&
                                   salesOrder.creditOverlimit.approvedBy;

      if (orderAlreadyApproved) {
        console.log("   ℹ️ Order was previously approved - will still re-check if amount increased");
      }
      
      // Check if number of products changed
      if (req.body.products.length !== salesOrder.products.length) {
        productsActuallyChanged = true;
        console.log("   ✓ Product count changed");
      } else {
        // Check if any product quantity or price changed
        for (let i = 0; i < req.body.products.length; i++) {
          const newProduct = req.body.products[i];
          const oldProduct = salesOrder.products[i];
          
          // Extract IDs for comparison
          const newProductId = typeof newProduct.product === 'object' ? newProduct.product._id : newProduct.product;
          const oldProductId = typeof oldProduct.product === 'object' ? oldProduct.product._id : oldProduct.product;
          
          if (newProductId.toString() !== oldProductId.toString()) {
            productsActuallyChanged = true;
            console.log(`   ✓ Product changed at index ${i}`);
            break;
          }
          
          if (Number(newProduct.quantity) !== Number(oldProduct.quantity)) {
            productsActuallyChanged = true;
            console.log(`   ✓ Quantity changed at index ${i}: ${oldProduct.quantity} → ${newProduct.quantity}`);
            break;
          }
          
          if (Math.abs(Number(newProduct.unitPrice) - Number(oldProduct.unitPrice)) > 0.001) {
            productsActuallyChanged = true;
            console.log(`   ✓ Unit price changed at index ${i}: ${oldProduct.unitPrice} → ${newProduct.unitPrice}`);
            break;
          }
          
          if (Math.abs(Number(newProduct.discountAmount || 0) - Number(oldProduct.discountAmount || 0)) > 0.001) {
            productsActuallyChanged = true;
            console.log(`   ✓ Discount changed at index ${i}`);
            break;
          }
        }
      }
      
      if (!productsActuallyChanged) {
        console.log("   ✅ No product changes detected - skipping credit limit recalculation");
        console.log("   ℹ️ This is likely just a status change (e.g., Pending → Confirmed)");
      } else {
        console.log("   ⚠️ Products changed - performing credit limit re-check");
        console.log("   Order creditOverlimit:", salesOrder.creditOverlimit);
        console.log("   Previously approved?", salesOrder.creditOverlimit?.approvedBy ? 'YES' : 'NO');
        console.log("   Original order amount:", salesOrder.totalAmount);
        
        // Get dealer data
        const dealerData = await Dealer.findById(salesOrder.dealer);
        if (!dealerData) {
          return res.status(404).json({
            success: false,
            message: "Dealer not found"
          });
        }
        
        // Calculate new order totals with updated products
        const updatedValidatedProducts = [];
        for (const item of req.body.products) {
          const product = await Product.findById(item.product);
          if (!product) continue;
          
          // Skip out-of-stock products from credit calculation
          const hasStock = item.warehouse && item.warehouse !== "No Stock";
          if (!hasStock) {
            console.log(`⏭️ Skipping product ${product.itemName} from credit limit calculation (out of stock)`);
            continue;
          }
          
          const unitPrice = item.unitPrice || product.rateSlabs[0]?.rate || 0;
          const gst = item.gst || product.gst || 0;
          // Use direct discount + dealer extra discount for credit limit calculation
          const directDiscountAmt = item.discountAmount || 0;
          const extraPct = (dealerData.extraDiscounts || [])
            .filter(d => d.isActive !== false)
            .reduce((pct, ed) => {
              if (pct > 0) return pct;
              const targetId = ed.targetId?.toString();
              if (ed.targetType === 'product' && targetId === product._id.toString()) return ed.discountPercentage || 0;
              if (ed.targetType === 'brand' && targetId === product.brand?.toString()) return ed.discountPercentage || 0;
              if (ed.targetType === 'category' && targetId === product.category?.toString()) return ed.discountPercentage || 0;
              if (ed.targetType === 'subcategory' && targetId === product.subcategory?.toString()) return ed.discountPercentage || 0;
              return 0;
            }, 0);
          const gross = item.quantity * unitPrice;
          const extraDiscountAmt = (gross * extraPct) / 100;
          const baseAmount = gross - directDiscountAmt - extraDiscountAmt;
          const gstAmount = (baseAmount * gst) / 100;
          
          updatedValidatedProducts.push({
            quantity: item.quantity,
            unitPrice: unitPrice,
            gstAmount: gstAmount,
            discountAmount: directDiscountAmt + extraDiscountAmt,
            effectiveBaseAmount: baseAmount
          });
        }

        const newGrossAmount = updatedValidatedProducts.reduce((sum, p) => sum + p.effectiveBaseAmount, 0);
        const newTotalGst = updatedValidatedProducts.reduce((sum, p) => sum + p.gstAmount, 0);
        const newTotalAmount = newGrossAmount + newTotalGst;
        const originalOrderAmount = salesOrder.totalAmount || 0;
        
        console.log(`💰 Order Amount Comparison:`, {
          original: originalOrderAmount,
          new: newTotalAmount,
          difference: newTotalAmount - originalOrderAmount,
          increased: newTotalAmount > originalOrderAmount
        });
        
        // Check credit limit if dealer has one set
        if (dealerData.creditLimit && dealerData.creditLimit > 0) {
          // Get correct outstanding: exclude this order itself (it's being edited), then add new amount
          const baseOutstanding = await getDealerCreditOutstanding(req.dbConnection, salesOrder.dealer, salesOrder._id);
          // baseOutstanding already excludes this order, so just add the new total
          const newOutstanding = baseOutstanding + newTotalAmount;
          const adjustedOutstanding = baseOutstanding; // for logging clarity
          
          console.log(`💳 Credit Limit Re-Check:`, {
            creditLimit: dealerData.creditLimit,
            baseOutstanding,
            originalOrderAmount,
            newOrderAmount: newTotalAmount,
            newOutstanding,
            overlimit: newOutstanding - dealerData.creditLimit,
            wasApproved: !!salesOrder.creditOverlimit?.approvedBy
          });
          
          // If credit limit exceeded, check if we need new approval
          if (newOutstanding > dealerData.creditLimit) {
            const overlimitAmount = newOutstanding - dealerData.creditLimit;
            
            // Check if amount increased from previously approved amount
            const amountIncreased = newTotalAmount > originalOrderAmount;
            const wasApproved = salesOrder.creditOverlimit && salesOrder.creditOverlimit.approvedBy;
            
            if (amountIncreased && wasApproved) {
              console.log(`⚠️ CRITICAL: Order amount increased from ₹${originalOrderAmount.toFixed(2)} to ₹${newTotalAmount.toFixed(2)}`);
              console.log(`⚠️ Previous approval is NO LONGER VALID - Requires NEW Super Admin approval`);
              
              // Store previous approval info for audit trail
              const previousApproval = {
                approvedBy: salesOrder.creditOverlimit.approvedBy,
                approvedAt: salesOrder.creditOverlimit.approvedAt,
                approvedAmount: originalOrderAmount,
                approvalNotes: salesOrder.creditOverlimit.approvalNotes
              };
              
              // Reset credit approval and force status back to Pending
              req.body.status = "Pending";
              req.body.creditOverlimit = {
                isOverlimit: true,
                creditLimit: dealerData.creditLimit,
                currentOutstanding: baseOutstanding,
                orderAmount: newTotalAmount,
                newOutstanding,
                overlimitAmount,
                requiresApproval: true,
                approvedBy: null, // Reset approval
                approvedAt: null,
                approvalNotes: null,
                previousApproval: previousApproval // Store history
              };
              
              console.log(`🔄 Order status RESET to Pending - Requires NEW Super Admin approval`);
              console.log(`📋 Previous approval stored in history for audit trail`);
            } else if (!wasApproved) {
              console.log(`⚠️ Credit limit exceeded by ₹${overlimitAmount.toFixed(2)} - Requires approval`);
              
              // First time exceeding limit or not previously approved
              req.body.status = "Pending";
              req.body.creditOverlimit = {
                isOverlimit: true,
                creditLimit: dealerData.creditLimit,
                currentOutstanding: baseOutstanding,
                orderAmount: newTotalAmount,
                newOutstanding,
                overlimitAmount,
                requiresApproval: true,
                approvedBy: null,
                approvedAt: null
              };
              
              console.log(`🔄 Order status set to Pending - Requires Super Admin approval`);
            } else {
              // Amount decreased or stayed same, keep existing approval
              console.log(`✅ Order amount did not increase - keeping existing approval`);
            }
          } else {
            // Credit limit is fine - clear any previous overlimit flags
            console.log(`✅ Credit limit check passed - Order within limit`);
            req.body.creditOverlimit = {
              isOverlimit: false,
              creditLimit: dealerData.creditLimit,
              currentOutstanding: baseOutstanding,
              orderAmount: newTotalAmount,
              newOutstanding,
              overlimitAmount: 0,
              requiresApproval: false
            };
          }
        }
      }
    }

    // Store original status before update
    const originalStatus = salesOrder.status;
    const newStatus = req.body.status;

    // CRITICAL: Credit limit check when status is being changed to Confirmed
    if (newStatus === "Confirmed" && originalStatus !== "Confirmed") {
      // Check both the saved order AND any updated creditOverlimit from this request
      const effectiveCreditOverlimit = req.body.creditOverlimit || salesOrder.creditOverlimit;
      
      // Block if flagged as overlimit and not approved (including freshly reset approvals)
      if (effectiveCreditOverlimit &&
          effectiveCreditOverlimit.isOverlimit &&
          !effectiveCreditOverlimit.approvedBy) {
        return res.status(400).json({
          success: false,
          message: `Cannot confirm order - Credit limit exceeded by ₹${(effectiveCreditOverlimit.overlimitAmount || 0).toLocaleString()}. Super Admin approval required.`
        });
      }

      // Skip live check if order was already approved by Super Admin
      const alreadyApproved = effectiveCreditOverlimit &&
                              effectiveCreditOverlimit.isOverlimit &&
                              effectiveCreditOverlimit.approvedBy;

      if (!alreadyApproved) {
        // Live credit limit check in case it was never flagged
        const dealerForCheck = await Dealer.findById(salesOrder.dealer);
        if (dealerForCheck && dealerForCheck.creditLimit && dealerForCheck.creditLimit > 0) {
          const currentOutstanding = await getDealerCreditOutstanding(req.dbConnection, salesOrder.dealer, salesOrder._id);
          const orderAmount = req.body.totalAmount || salesOrder.totalAmount;
          const newOutstanding = currentOutstanding + orderAmount;

          if (newOutstanding > dealerForCheck.creditLimit) {
            const overlimitAmount = newOutstanding - dealerForCheck.creditLimit;
            await SalesOrder.findByIdAndUpdate(salesOrder._id, {
              creditOverlimit: {
                isOverlimit: true,
                creditLimit: dealerForCheck.creditLimit,
                currentOutstanding,
                orderAmount,
                newOutstanding,
                overlimitAmount,
                requiresApproval: true
              }
            });
            return res.status(400).json({
              success: false,
              message: `Cannot confirm order - Credit limit exceeded by ₹${overlimitAmount.toLocaleString()}. Super Admin approval required.`,
              creditOverlimit: { isOverlimit: true, overlimitAmount, creditLimit: dealerForCheck.creditLimit }
            });
          }
        }
      }
    }

    // If status is being changed, handle stock management
    if (newStatus && newStatus !== originalStatus) {
      // When changing to Confirmed, Processing, or Delivered, ensure warehouses are selected
      const statusesRequiringWarehouse = ['Confirmed', 'Processing', 'Delivered'];
      if (statusesRequiringWarehouse.includes(newStatus)) {
        const productsToCheck = req.body.products || salesOrder.products;
        for (const product of productsToCheck) {
          if (!product.warehouse) {
            return res.status(400).json({
              success: false,
              message: `Warehouse must be selected for all products before updating status to ${newStatus}`
            });
          }
        }
      }

      // Handle stock management for status changes (reuse logic from updateSalesOrderStatus)
      // For Confirmed status - block stock
      if (newStatus === "Confirmed" && originalStatus !== "Confirmed") {

        for (const product of req.body.products || salesOrder.products) {
          if (product.warehouse) {
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });
            
            const currentBalance = latestMovement ? latestMovement.balance : 0;
            const newBalance = currentBalance - product.quantity;
            
            const blockMovement = new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'OUT',
              quantity: product.quantity,
              balance: newBalance,
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Stock Blocked`,
              createdBy: req.user._id
            });
            await blockMovement.save();
          }
        }
      }
      // For Delivered status - permanently reduce stock
      else if (newStatus === "Delivered") {

        for (const product of req.body.products || salesOrder.products) {
          if (product.warehouse) {
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });
            
            const currentBalance = latestMovement ? latestMovement.balance : 0;
            if (originalStatus === "Confirmed") {
              // Step 1: Unblock the previously blocked stock
              const unblockMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'IN',
                quantity: product.quantity,
                balance: currentBalance + product.quantity,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Stock Unblocked (Delivered)`,
                createdBy: req.user._id
              });
              await unblockMovement.save();
              
              // Step 2: Permanently reduce stock
              const newBalance = currentBalance; // Balance stays same because we unblocked then reduced
              const deliveryMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'OUT',
                quantity: product.quantity,
                balance: newBalance,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
                createdBy: req.user._id
              });
              await deliveryMovement.save();
            } else {
              // Direct delivery - reduce stock permanently
              const newBalance = currentBalance - product.quantity;
              const deliveryMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'OUT',
                quantity: product.quantity,
                balance: newBalance,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
                createdBy: req.user._id
              });
              await deliveryMovement.save();
            }
          }
        }
      }
      // For Cancelled/Rejected - restore stock if it was Confirmed
      else if ((newStatus === "Cancelled" || newStatus === "Rejected") && originalStatus === "Confirmed") {

        for (const product of req.body.products || salesOrder.products) {
          if (product.warehouse) {
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });
            
            const currentBalance = latestMovement ? latestMovement.balance : 0;
            const newBalance = currentBalance + product.quantity;
            
            const unblockMovement = new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'IN',
              quantity: product.quantity,
              balance: newBalance,
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Stock Unblocked (${newStatus})`,
              createdBy: req.user._id
            });
            await unblockMovement.save();
          }
        }
      }
    }

    // Update the sales order
    // Preserve isOutOfStock from existing order if not explicitly set in request
    if (req.body.isOutOfStock === undefined || req.body.isOutOfStock === null) {
      req.body.isOutOfStock = salesOrder.isOutOfStock;
    }
    // If order was originally out-of-stock, keep it that way unless explicitly cleared
    if (salesOrder.isOutOfStock && req.body.isOutOfStock === false) {
      // Only allow clearing isOutOfStock if all products now have a real warehouse
      const allProductsHaveWarehouse = (req.body.products || salesOrder.products).every(
        p => p.warehouse && p.warehouse !== 'No Stock'
      );
      if (!allProductsHaveWarehouse) {
        req.body.isOutOfStock = true;
      }
    }

    // Recalculate product amounts with discounts (findByIdAndUpdate bypasses pre-save hook)
    if (req.body.products) {
      let recalcGross = 0;
      let recalcGst = 0;
      let recalcDiscount = 0;

      req.body.products = req.body.products.map(p => {
        const baseAmount = p.quantity * p.unitPrice;
        // Guard: discountAmount must never exceed baseAmount
        const rawDiscAmt = p.discountAmount || 0;
        const discAmt = Math.min(rawDiscAmt, baseAmount);
        const discountedBase = baseAmount - discAmt;
        const gstAmt = (discountedBase * (p.gst || 0)) / 100;
        const totalPrice = discountedBase + gstAmt;

        recalcGross += baseAmount;
        recalcGst += gstAmt;
        recalcDiscount += discAmt;

        return { ...p, gstAmount: gstAmt, totalPrice };
      });

      req.body.grossAmount = recalcGross;
      req.body.totalGst = recalcGst;
      req.body.discountAmount = recalcDiscount;
      req.body.totalAmount = recalcGross + recalcGst - recalcDiscount;
    }

    const updatedOrder = await SalesOrder.findByIdAndUpdate(
      id,
      req.body,
      { 
        new: true, 
        runValidators: true 
      }
    )
      .populate("dealer", "name code contactPerson phone email address dealerType")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("createdBy", "name email");

    // If status changed, trigger notification (for any status change)
    if (newStatus && newStatus !== originalStatus) {
      try {

        const statusMessages = {
          'Confirmed': `Your order ${updatedOrder.orderNumber} has been confirmed.`,
          'Processing': `Your order ${updatedOrder.orderNumber} is now being processed.`,
          'Delivered': `Your order ${updatedOrder.orderNumber} has been delivered.`,
          'Rejected': `Your order ${updatedOrder.orderNumber} has been rejected.`,
          'Cancelled': `Your order ${updatedOrder.orderNumber} has been cancelled.`
        };

        const statusTitles = {
          'Confirmed': 'Order Confirmed',
          'Processing': 'Order Processing',
          'Delivered': 'Order Delivered',
          'Rejected': 'Order Rejected',
          'Cancelled': 'Order Cancelled'
        };

        const message = statusMessages[newStatus] || `Your order ${updatedOrder.orderNumber} status has been updated to ${newStatus}.`;
        const title = statusTitles[newStatus] || `Order ${newStatus}`;
        
        let priority = 'medium';
        if (newStatus === 'Delivered' || newStatus === 'Confirmed') {
          priority = 'high';
        } else if (newStatus === 'Rejected' || newStatus === 'Cancelled') {
          priority = 'high';
        }
        
        await Notification.create({
          dealer: updatedOrder.dealer,
          type: 'order_status',
          title: title,
          message: message,
          orderId: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
          status: newStatus,
          read: false,
          priority: priority
        });

        // Send push notification to dealer
        try {
          const dealerForPush = await Dealer.findById(updatedOrder.dealer).select('fcmToken').lean();
          if (dealerForPush?.fcmToken) {
            await sendPushNotification({
              token: dealerForPush.fcmToken,
              title,
              body: message,
              data: {
                type: 'order_status',
                orderId: updatedOrder._id.toString(),
                orderNumber: updatedOrder.orderNumber,
                status: newStatus,
              },
            });
          }
        } catch (pushErr) {
          console.error('Push notification error (non-fatal):', pushErr.message);
        }

        console.log(`📧 Notification created for dealer ${updatedOrder.dealer}: ${message} (Status changed from ${originalStatus} to ${newStatus})`);
      } catch (notificationError) {
        console.error('Error creating notification:', notificationError);
      }
      
      // NOTE: Credit limit blocking moved to invoice approval stage
      // Sales orders no longer block credit limit on confirmation
      // Credit limit is blocked when invoice is approved, not when order is confirmed
      
      // REMOVE/REVERSE LEDGER ENTRY when order is CANCELLED or REJECTED (if it was previously Confirmed)
      // NOTE: This is kept for backward compatibility with old orders that had ledger entries
      if ((newStatus === "Cancelled" || newStatus === "Rejected") && originalStatus === "Confirmed") {
        try {
          console.log(`💳 Checking for ledger entry to reverse for order ${updatedOrder.orderNumber}`);
          
  
  
          
          // Check if there's a ledger entry for this order (old orders might have one)
          const existingLedgerEntry = await DealerLedger.findOne({
            dealer: updatedOrder.dealer._id || updatedOrder.dealer,
            transactionType: "Order Confirmed",
            description: { $regex: updatedOrder.orderNumber }
          });
          
          if (existingLedgerEntry) {
            console.log(`✅ Found existing ledger entry to reverse`);
            
            // Get dealer details
            const dealer = await Dealer.findById(updatedOrder.dealer);
            if (!dealer) {
              console.error(`❌ Dealer not found for order ${updatedOrder.orderNumber}`);
            } else {
              // Create reverse ledger entry to unblock credit limit
              const reverseLedgerEntry = new DealerLedger({
                dealer: updatedOrder.dealer._id || updatedOrder.dealer,
                dealerName: dealer.name,
                dealerCode: dealer.code,
                entryDate: new Date(),
                transactionType: "Adjustment",
                salesType: updatedOrder.salesType || 'Regular Sale',
                debitAmount: 0,
                creditAmount: updatedOrder.totalAmount, // Decrease outstanding (unblock credit)
                description: `Order ${newStatus} - ${updatedOrder.orderNumber}`,
                remarks: `Credit limit unblocked - order ${updatedOrder.orderNumber} was ${newStatus.toLowerCase()}. Amount released: ₹${updatedOrder.totalAmount.toLocaleString()}`,
                status: "Active",
                createdBy: req.user._id
              });
              
              await reverseLedgerEntry.save();
              console.log(`✅ Reverse ledger entry created - Credit limit unblocked: ₹${updatedOrder.totalAmount.toLocaleString()} for order ${updatedOrder.orderNumber}`);
              console.log(`   Running Balance: ₹${reverseLedgerEntry.runningBalance.toLocaleString()}`);
            }
          } else {
            console.log(`ℹ️ No ledger entry found for order ${updatedOrder.orderNumber} - nothing to reverse`);
          }
        } catch (ledgerError) {
          console.error('❌ Error creating reverse ledger entry:', ledgerError);
          // Don't fail the request if ledger creation fails
        }
      }
    }

    res.json({
      success: true,
      message: "Sales order updated successfully",
      salesOrder: updatedOrder
    });
  } catch (error) {
    console.error("Update Sales Order Error:", error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating sales order",
      error: error.message
    });
  }
};

// @desc    Delete sales order
// @route   DELETE /api/sales-orders/:id
// @access  Private
export const deleteSalesOrder = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);
    
    const { id } = req.params;

    // Find the sales order
    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    // Only allow deletion of pending orders
    if (salesOrder.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Can only delete pending orders"
      });
    }

    // Delete the sales order
    await SalesOrder.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Sales order deleted successfully"
    });
  } catch (error) {
    console.error("Delete Sales Order Error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting sales order",
      error: error.message
    });
  }
};

// @desc    Get available stock for a product
// @route   GET /api/sales-orders/product/:productId/stock
// @access  Private
export const getProductStock = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Product, StockMovement } = getModels(req.dbConnection);
    
    const { productId } = req.params;
    const { warehouse } = req.query;

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // Build query for stock
    let query = { productId };
    if (warehouse) {
      query.warehouseId = warehouse;
    }

    // Get stock information
    const stock = await StockMovement.find(query)
      .populate("warehouseId", "name code address")
      .sort({ netStock: -1 })
      .lean();

    // Format response
    const formattedStock = stock.map(item => ({
      _id: item._id,
      productId: item.productId,
      productCode: item.productCode,
      itemName: item.itemName,
      warehouseId: item.warehouseId,
      warehouse: item.warehouse,
      basePrice: item.basePrice,
      gst: item.gst,
      totalPrice: item.totalPrice,
      totalQty: item.totalQty,
      damagedQty: item.damagedQty,
      blockedQty: item.blockedQty,
      netStock: item.netStock,
      minStockLevel: item.minStockLevel,
      isLowStock: item.netStock <= item.minStockLevel
    }));

    res.json({
      success: true,
      product: {
        _id: product._id,
        itemName: product.itemName,
        productCode: product.productCode,
        HSNCode: product.HSNCode,
        gst: product.gst
      },
      stock: formattedStock
    });
  } catch (error) {
    console.error("Get Product Stock Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching product stock",
      error: error.message
    });
  }
};

// @desc    Get sales order statistics
// @route   GET /api/sales-orders/stats/summary
// @access  Private
export const getSalesOrderStats = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);
    
    const { startDate, endDate, dealer, region, type } = req.query;

    // Build match query for filters
    const matchQuery = {};
    
    if (startDate || endDate) {
      matchQuery.orderDate = {};
      if (startDate) matchQuery.orderDate.$gte = new Date(startDate);
      if (endDate) matchQuery.orderDate.$lte = new Date(endDate);
    }
    
    if (dealer) matchQuery.dealer = dealer;
    if (region) matchQuery.region = region;
    if (type) matchQuery.type = type;

    // Get overall statistics
    const stats = await SalesOrder.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalValue: { $sum: "$totalAmount" },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] }
          },
          confirmedOrders: {
            $sum: { $cond: [{ $eq: ["$status", "Confirmed"] }, 1, 0] }
          },
          processingOrders: {
            $sum: { $cond: [{ $eq: ["$status", "Processing"] }, 1, 0] }
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] }
          },
          totalItems: { $sum: { $sum: "$products.quantity" } }
        }
      }
    ]);

    // Get status-wise statistics
    const statusStats = await SalesOrder.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalValue: { $sum: "$totalAmount" },
          avgOrderValue: { $avg: "$totalAmount" },
          minOrderValue: { $min: "$totalAmount" },
          maxOrderValue: { $max: "$totalAmount" }
        }
      }
    ]);

    // Get monthly trends
    const monthlyTrends = await SalesOrder.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            year: { $year: "$orderDate" },
            month: { $month: "$orderDate" }
          },
          orderCount: { $sum: 1 },
          totalValue: { $sum: "$totalAmount" },
          avgOrderValue: { $avg: "$totalAmount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      { $limit: 12 }
    ]);

    // Get top dealers
    const topDealers = await SalesOrder.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$dealer",
          dealerName: { $first: "$dealerName" },
          orderCount: { $sum: 1 },
          totalValue: { $sum: "$totalAmount" },
          avgOrderValue: { $avg: "$totalAmount" }
        }
      },
      { $sort: { totalValue: -1 } },
      { $limit: 10 }
    ]);

    // Get top products
    const topProducts = await SalesOrder.aggregate([
      { $match: matchQuery },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.product",
          productName: { $first: "$products.productName" },
          totalQuantity: { $sum: "$products.quantity" },
          totalValue: { $sum: "$products.totalPrice" },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalValue: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      stats: stats[0] || {
        totalOrders: 0,
        totalValue: 0,
        pendingOrders: 0,
        confirmedOrders: 0,
        processingOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        totalItems: 0
      },
      statusStats,
      monthlyTrends,
      topDealers,
      topProducts
    });
  } catch (error) {
    console.error("Get Sales Order Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching sales order statistics",
      error: error.message
    });
  }
};

// @desc    Get sales orders for a specific dealer
// @route   GET /api/sales-orders/dealer/:dealerId
// @access  Private
export const getSalesOrdersByDealer = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);
    
    const { dealerId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    // Validate dealer exists
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    // Build query
    const query = { dealer: dealerId };
    if (status && status !== "all") {
      query.status = status;
    }

    // Get sales orders
    const salesOrders = await SalesOrder.find(query)
      .populate("region", "name")
      .populate("products.product", "productCode itemName HSNCode")
      .populate("products.warehouse", "name")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Get total count
    const total = await SalesOrder.countDocuments(query);

    // Calculate dealer statistics
    const dealerStats = await SalesOrder.aggregate([
      { $match: { dealer: dealerId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalValue: { $sum: "$totalAmount" },
          pendingOrders: { $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] } },
          completedOrders: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] } },
          avgOrderValue: { $avg: "$totalAmount" }
        }
      }
    ]);

    res.json({
      success: true,
      salesOrders,
      dealer: {
        _id: dealer._id,
        name: dealer.name,
        dealerType: dealer.dealerType,
        phone: dealer.phone,
        email: dealer.email
      },
      stats: dealerStats[0] || {
        totalOrders: 0,
        totalValue: 0,
        pendingOrders: 0,
        completedOrders: 0,
        avgOrderValue: 0
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get Sales Orders By Dealer Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer sales orders",
      error: error.message
    });
  }
};

// @desc    Get overdue sales orders
// @route   GET /api/sales-orders/overdue
// @access  Private
export const getOverdueSalesOrders = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);
    
    const { page = 1, limit = 10 } = req.query;
    const today = new Date();

    // Find orders that are overdue (due date passed but not delivered/cancelled)
    const query = {
      dueDate: { $lt: today },
      status: { $nin: ["Delivered", "Cancelled", "Rejected"] }
    };

    const overdueOrders = await SalesOrder.find(query)
      .populate("dealer", "name contactPerson phone email")
      .populate("region", "name")
      .populate("products.product", "productCode itemName")
      .sort({ dueDate: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await SalesOrder.countDocuments(query);

    // Calculate overdue days for each order
    const ordersWithOverdueDays = overdueOrders.map(order => {
      const dueDate = new Date(order.dueDate);
      const overdueDays = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24));
      return {
        ...order,
        overdueDays,
        isCritical: overdueDays > 30 // Critical if overdue more than 30 days
      };
    });

    res.json({
      success: true,
      overdueOrders: ordersWithOverdueDays,
      totalOverdue: total,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get Overdue Sales Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching overdue sales orders",
      error: error.message
    });
  }
};

// @desc    Get pending quantities from out-of-stock orders
// @route   GET /api/sales-orders/pending-quantities
// @access  Private
export const getPendingQuantities = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);
    
    const { productId, warehouseId } = req.query;

    // Build query for out-of-stock orders that are still pending (exclude expired)
    const query = {
      isOutOfStock: true,
      status: "Pending",
      $or: [
        { isExpired: { $ne: true } }, // Not expired
        { isExpired: { $exists: false } } // Or isExpired field doesn't exist
      ]
    };

    // If specific product or warehouse requested, filter further
    if (productId || warehouseId) {
      query.$and = [];
      
      if (productId) {
        query.$and.push({ "products.product": productId });
      }
      
      if (warehouseId) {
        query.$and.push({ "products.warehouse": warehouseId });
      }
    }

    // Get all out-of-stock pending orders
    const outOfStockOrders = await SalesOrder.find(query)
      .populate("dealer", "name")
      .populate("products.product") // Populate ALL product fields for wishlist compatibility
      .populate("products.warehouse", "name")
      .lean();

    // Aggregate pending quantities by product and warehouse
    const pendingQuantities = {};

    outOfStockOrders.forEach(order => {
      order.products.forEach(product => {
        const productKey = `${product.product._id}-${product.warehouse}`;
        
        if (!pendingQuantities[productKey]) {
          pendingQuantities[productKey] = {
            productId: product.product._id,
            productName: product.product.itemName,
            productCode: product.product.productCode,
            warehouseId: product.warehouse,
            warehouseName: product.warehouseName,
            totalPendingQuantity: 0,
            orders: []
          };
        }
        
        pendingQuantities[productKey].totalPendingQuantity += product.quantity;
        pendingQuantities[productKey].orders.push({
          orderNumber: order.orderNumber,
          dealerName: order.dealer?.name || order.dealerName,
          quantity: product.quantity,
          orderDate: order.orderDate,
          dueDate: order.dueDate
        });
      });
    });

    // Convert to array format
    const pendingQuantitiesArray = Object.values(pendingQuantities);

    res.json({
      success: true,
      pendingQuantities: pendingQuantitiesArray,
      totalOutOfStockOrders: outOfStockOrders.length,
      summary: {
        totalProducts: pendingQuantitiesArray.length,
        totalPendingQuantity: pendingQuantitiesArray.reduce((sum, item) => sum + item.totalPendingQuantity, 0)
      }
    });
  } catch (error) {
    console.error("Get Pending Quantities Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching pending quantities",
      error: error.message
    });
  }
};


// ============================================================================
// DUAL CREDIT DAYS & AUTO-SPLIT ORDERS IMPLEMENTATION
// ============================================================================

/**
 * Helper function to create a single sales order
 * Extracted from createSalesOrder for reusability in auto-split logic
 */
async function createSingleSalesOrder(dbConnection, orderData, userId) {
  const { SalesOrder, Product, Dealer, StockMovement, User, Notification, Warehouse } = getModels(dbConnection);
  
  const {
    dealer,
    region,
    pinCode,
    deliveryAddress,
    deliveryCity,
    deliveryArea,
    deliveryPinCode,
    deliveryLatitude,
    deliveryLongitude,
    products,
    orderDate,
    deliveryDate,
    creditDays,
    type,
    remarks,
    status,
    isOutOfStock,
    stockValidation,
    salesType, // NEW: 'Regular Sale' or 'CD Sales'
    creditDaysApplied // NEW: Actual credit days applied
  } = orderData;

  // Generate unique order number
  const orderNumber = await generateOrderNumber(dbConnection);
  console.log("Generated order number:", orderNumber);

  // Validate dealer exists
  const dealerData = await Dealer.findById(dealer);
  if (!dealerData) {
    throw new Error("Dealer not found");
  }

  // Validate credit days don't exceed dealer's limits
  if (creditDays !== undefined && creditDays !== null) {
    const requestedCreditDays = parseInt(creditDays);
    
    // Determine which limit to check based on salesType
    let maxCreditDays = 0;
    if (salesType === 'Regular Sale') {
      maxCreditDays = dealerData.creditDaysRegular || dealerData.creditDays || 0;
    } else if (salesType === 'CD Sales') {
      maxCreditDays = dealerData.creditDaysCD || dealerData.creditDays || 0;
    } else {
      // Default to regular if not specified
      maxCreditDays = dealerData.creditDaysRegular || dealerData.creditDays || 0;
    }
    
    if (requestedCreditDays > maxCreditDays && maxCreditDays > 0) {
      throw new Error(`Credit days (${requestedCreditDays}) cannot exceed dealer's limit of ${maxCreditDays} days for ${salesType || 'Regular Sale'}.`);
    }
  }

  // Validate and process each product
  const validatedProducts = [];

  for (const item of products) {
    // Validate product exists
    const product = await Product.findById(item.product);
    if (!product) {
      throw new Error(`Product not found: ${item.productName || item.product}`);
    }

    // Validate warehouse exists (skip if warehouse is "No Stock" for out-of-stock orders)
    if (item.warehouse && item.warehouse !== "No Stock") {
      const warehouse = await Warehouse.findById(item.warehouse);
      
      if (!warehouse) {
        throw new Error(`Warehouse not found: ${item.warehouse}`);
      }

      // For out-of-stock orders, skip stock validation
      if (!isOutOfStock) {
        // For regular orders, validate stock availability
        const stock = await StockMovement.findOne({
          productId: item.product,
          warehouseId: item.warehouse
        });

        if (stock && stock.netStock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.itemName} in ${warehouse.name}. Available: ${stock.netStock}, Required: ${item.quantity}`);
        }
      }

      console.log(`Product ${product.itemName} validated for warehouse ${warehouse.name}`);
    } else if (item.warehouse === "No Stock") {
      console.log(`Product ${product.itemName} has no warehouse assigned (out-of-stock order)`);
    }

    // Calculate product details
    const unitPrice = item.unitPrice || product.rateSlabs[0]?.rate || 0;
    const gst = item.gst || product.gst || 0;
    const baseAmount = item.quantity * unitPrice;
    // Guard: discountAmount must never exceed baseAmount
    const rawDiscountAmt = item.discountAmount || 0;
    const discountAmt = Math.min(rawDiscountAmt, baseAmount);
    if (rawDiscountAmt > baseAmount) {
      console.warn(`⚠️ discountAmount (${rawDiscountAmt}) exceeded baseAmount (${baseAmount}) for product ${product.itemName} — capped`);
    }
    const discountedBase = baseAmount - discountAmt;
    const gstAmount = (discountedBase * gst) / 100;
    const totalPrice = discountedBase + gstAmount;

    // Build product object
    validatedProducts.push({
      product: item.product,
      productCode: product.productCode,
      productName: product.itemName,
      HSNCode: product.HSNCode,
      quantity: item.quantity,
      unitPrice: unitPrice,
      gst: gst,
      gstAmount: gstAmount,
      totalPrice: totalPrice,
      salesType: item.salesType || product.salesType || 'Regular Sale', // Add salesType from item or product
      warehouse: item.warehouse === "No Stock" ? null : item.warehouse,
      warehouseName: item.warehouse === "No Stock" ? "No Stock" : item.warehouseName,
      // Copy discount fields if present
      discountPercentage: item.discountPercentage || 0,
      discountAmount: discountAmt,
      discountType: item.discountType || null,
      selectedDiscountLevel: item.selectedDiscountLevel || null,
      appliedDiscount: item.appliedDiscount || null
    });
  }

  // Calculate order totals
  const grossAmount = validatedProducts.reduce((sum, product) => sum + (product.quantity * product.unitPrice), 0);
  const totalGst = validatedProducts.reduce((sum, product) => sum + product.gstAmount, 0);
  const discountAmount = validatedProducts.reduce((sum, product) => sum + (product.discountAmount || 0), 0);
  const totalAmount = grossAmount + totalGst - discountAmount;

  // Determine initial status (declare before credit limit check)
  let initialStatus = status || "Pending";
  
  // For out-of-stock orders, force status to Pending
  if (isOutOfStock) {
    initialStatus = "Pending";
    console.log("🚨 Creating out-of-stock sales order - status locked to Pending");
  }

  // Check credit limit if dealer has one set
  // IMPORTANT: Only count IN-STOCK products towards credit limit
  let creditOverlimitData = undefined;
  if (dealerData.creditLimit && dealerData.creditLimit > 0) {
    // Calculate amount for IN-STOCK products only
    const inStockProducts = validatedProducts.filter(p => p.warehouse !== null);
    const inStockGrossAmount = inStockProducts.reduce((sum, product) => sum + (product.quantity * product.unitPrice), 0);
    const inStockTotalGst = inStockProducts.reduce((sum, product) => sum + product.gstAmount, 0);
    const inStockDiscountAmount = inStockProducts.reduce((sum, product) => sum + (product.discountAmount || 0), 0);
    const inStockTotalAmount = inStockGrossAmount + inStockTotalGst - inStockDiscountAmount;
    
    console.log(`� Credit Limit Calculation - In-eStock Products Only:`, {
      totalProducts: validatedProducts.length,
      inStockProducts: inStockProducts.length,
      outOfStockProducts: validatedProducts.length - inStockProducts.length,
      inStockAmount: inStockTotalAmount,
      totalOrderAmount: totalAmount
    });
    
    // Get dealer's current outstanding balance (correct calculation)
    const currentOutstanding = await getDealerCreditOutstanding(dbConnection, dealer);
    const newOutstanding = currentOutstanding + inStockTotalAmount;
    
    console.log(`💳 Credit Limit Check (Single Order):`, {
      creditLimit: dealerData.creditLimit,
      currentOutstanding,
      orderAmount: inStockTotalAmount,
      newOutstanding,
      overlimit: newOutstanding - dealerData.creditLimit
    });
    
    // If credit limit exceeded, force status to Pending and add credit overlimit info
    if (newOutstanding > dealerData.creditLimit) {
      const overlimitAmount = newOutstanding - dealerData.creditLimit;
      console.log(`⚠️ Credit limit exceeded by ₹${overlimitAmount.toFixed(2)}`);
      
      // Force status to Pending for approval
      initialStatus = "Pending";
      creditOverlimitData = {
        isOverlimit: true,
        creditLimit: dealerData.creditLimit,
        currentOutstanding,
        orderAmount: inStockTotalAmount, // Show in-stock amount
        newOutstanding,
        overlimitAmount,
        requiresApproval: true
      };
    }
  }

  // Calculate due date
  let dueDate = null;
  if (orderDate && creditDays) {
    dueDate = new Date(orderDate);
    dueDate.setDate(dueDate.getDate() + creditDays);
  }

  // Create sales order
  const salesOrder = new SalesOrder({
    orderNumber,
    dealer,
    dealerName: dealerData.name,
    dealerCode: dealerData.code,
    dealerType: dealerData.dealerType,
    region,
    pinCode,
    deliveryAddress,
    deliveryCity,
    deliveryArea,
    deliveryPinCode,
    deliveryLatitude,
    deliveryLongitude,
    products: validatedProducts,
    orderDate,
    deliveryDate,
    creditDays,
    salesType, // NEW: Set the sales type
    creditDaysApplied, // NEW: Set the applied credit days
    dueDate,
    grossAmount,
    totalGst,
    discountAmount,
    totalAmount,
    type,
    remarks,
    status: initialStatus,
    createdBy: userId,
    isOutOfStock: isOutOfStock || false,
    stockValidation: stockValidation || [],
    creditOverlimit: creditOverlimitData // Add credit overlimit data
  });

  // Automatically set 15-day expiry for Pending orders
  if (salesOrder.status === "Pending") {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 15); // 15 days from now
    
    salesOrder.expiryDate = expiryDate;
    salesOrder.expiryReason = 'Automatic 15-day expiry for pending order';
    salesOrder.expiryHistory.push({
      action: 'set',
      previousDate: null,
      newDate: expiryDate,
      reason: 'Automatic 15-day expiry set on order creation',
      performedBy: userId,
      performedAt: new Date()
    });
    
    console.log(`📅 Automatic expiry set for pending order ${orderNumber}: ${expiryDate.toISOString()}`);
  }

  // Save sales order
  await salesOrder.save();

  // Handle stock updates based on initial status (only for in-stock orders)
  if (!isOutOfStock) {
    if (salesOrder.status === "Confirmed") {
      console.log("Order created with Confirmed status - blocking stock");
      for (const product of salesOrder.products) {
        if (product.warehouse) {
          const latestMovement = await StockMovement.findOne({
            productId: product.product,
            warehouseId: product.warehouse
          }).sort({ date: -1, createdAt: -1 });
          
          const currentBalance = latestMovement ? latestMovement.balance : 0;
          const newBalance = currentBalance - product.quantity;
          
          const blockMovement = new StockMovement({
            productId: product.product,
            warehouseId: product.warehouse,
            type: 'OUT',
            quantity: product.quantity,
            balance: newBalance,
            referenceNo: salesOrder.orderNumber,
            referenceType: 'SALE',
            date: new Date(),
            remarks: `Order ${salesOrder.orderNumber} - Stock Blocked`,
            createdBy: userId
          });
          await blockMovement.save();
        }
      }
    } else if (salesOrder.status === "Delivered") {
      console.log("Order created with Delivered status - permanently reducing stock");
      for (const product of salesOrder.products) {
        if (product.warehouse) {
          const latestMovement = await StockMovement.findOne({
            productId: product.product,
            warehouseId: product.warehouse
          }).sort({ date: -1, createdAt: -1 });
          
          const currentBalance = latestMovement ? latestMovement.balance : 0;
          const newBalance = currentBalance - product.quantity;
          
          const deliveryMovement = new StockMovement({
            productId: product.product,
            warehouseId: product.warehouse,
            type: 'OUT',
            quantity: product.quantity,
            balance: newBalance,
            referenceNo: salesOrder.orderNumber,
            referenceType: 'SALE',
            date: new Date(),
            remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
            createdBy: userId
          });
          await deliveryMovement.save();
        }
      }
    }
  }

  // Populate the created order for response
  const populatedOrder = await SalesOrder.findById(salesOrder._id)
    .populate("dealer", "name code contactPerson phone email address dealerType creditDaysRegular creditDaysCD")
    .populate("region", "name")
    .populate("products.product")
    .populate("products.warehouse", "name")
    .populate("createdBy", "name email");

  return populatedOrder;
}

/**
 * @desc    Create sales order with auto-split for CD Sales and Regular Sales
 * @route   POST /api/sales-orders/auto-split
 * @access  Private
 */
export const createSalesOrderWithAutoSplit = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, Dealer, StockMovement, User, Notification } = getModels(req.dbConnection);
    
    console.log("🚀 createSalesOrderWithAutoSplit called");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    
    const { dealer, products, ...orderData } = req.body;
    
    // Validate dealer exists
    const dealerData = await Dealer.findById(dealer);
    if (!dealerData) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }
    
    console.log("✅ Dealer found:", dealerData.name);
    console.log("📊 Dealer credit days - Regular:", dealerData.creditDaysRegular, "CD:", dealerData.creditDaysCD);
    
    // Get full product details to check salesType
    const productDetails = await Promise.all(
      products.map(async (item) => {
        const product = await Product.findById(item.product);
        if (!product) {
          throw new Error(`Product not found: ${item.product}`);
        }
        return {
          ...item,
          salesType: product.salesType
        };
      })
    );
    
    console.log("📦 Product details loaded:", productDetails.length, "products");
    
    // Separate products by salesType
    const regularProducts = productDetails.filter(p => p.salesType === 'Regular Sale');
    const cdProducts = productDetails.filter(p => p.salesType === 'CD Sales');
    
    console.log("🔵 Regular Sale products:", regularProducts.length);
    console.log("🟢 CD Sales products:", cdProducts.length);
    
    const createdOrders = [];
    
    // Create Regular Sales Order if there are regular products
    if (regularProducts.length > 0) {
      console.log("\n📝 Creating Regular Sales Order...");
      const regularOrderData = {
        ...orderData,
        dealer,
        products: regularProducts,
        salesType: 'Regular Sale',
        creditDays: dealerData.creditDaysRegular || dealerData.creditDays || 30,
        creditDaysApplied: dealerData.creditDaysRegular || dealerData.creditDays || 30
      };
      
      const regularOrder = await createSingleSalesOrder(req.dbConnection, regularOrderData, req.user._id);
      createdOrders.push(regularOrder);
      console.log("✅ Regular Sales Order created:", regularOrder.orderNumber);
    }
    
    // Create CD Sales Order if there are CD products
    if (cdProducts.length > 0) {
      console.log("\n📝 Creating CD Sales Order...");
      const cdOrderData = {
        ...orderData,
        dealer,
        products: cdProducts,
        salesType: 'CD Sales',
        creditDays: dealerData.creditDaysCD || dealerData.creditDays || 30,
        creditDaysApplied: dealerData.creditDaysCD || dealerData.creditDays || 30
      };
      
      const cdOrder = await createSingleSalesOrder(req.dbConnection, cdOrderData, req.user._id);
      createdOrders.push(cdOrder);
      console.log("✅ CD Sales Order created:", cdOrder.orderNumber);
    }
    
    // Return response
    if (createdOrders.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No products to create order"
      });
    } else if (createdOrders.length === 1) {
      console.log("\n✅ Single order created successfully");
      res.status(201).json({
        success: true,
        message: "Sales order created successfully",
        salesOrder: createdOrders[0],
        isSplit: false
      });
    } else {
      console.log("\n✅ Orders split successfully - 2 orders created");
      res.status(201).json({
        success: true,
        message: "Orders created successfully! Your order was split into Regular and CD Sales orders.",
        salesOrders: createdOrders,
        isSplit: true,
        regularOrder: createdOrders.find(o => o.salesType === 'Regular Sale'),
        cdOrder: createdOrders.find(o => o.salesType === 'CD Sales')
      });
    }
    
  } catch (error) {
    console.error("❌ Create Sales Order with Auto-Split Error:", error);
    
    // Handle duplicate order number error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Order number already exists"
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating sales order",
      error: error.message
    });
  }
};


// @desc    Set expiry date for pending order
// @route   PATCH /api/sales-orders/:id/set-expiry
// @access  Private
export const setOrderExpiry = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { expiryDate, reason } = req.body;
    const { id } = req.params;

    if (!expiryDate) {
      return res.status(400).json({
        success: false,
        message: "Expiry date is required"
      });
    }

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    // Only allow setting expiry for pending orders
    if (salesOrder.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Can only set expiry for pending orders"
      });
    }

    const newExpiryDate = new Date(expiryDate);
    const now = new Date();

    if (newExpiryDate <= now) {
      return res.status(400).json({
        success: false,
        message: "Expiry date must be in the future"
      });
    }

    // Add to expiry history
    salesOrder.expiryHistory.push({
      action: 'set',
      previousDate: salesOrder.expiryDate,
      newDate: newExpiryDate,
      reason: reason || 'Initial expiry date set',
      performedBy: req.user._id,
      performedAt: new Date()
    });

    salesOrder.expiryDate = newExpiryDate;
    salesOrder.expiryReason = reason || 'Pending order expiry';
    salesOrder.isExpired = false;

    await salesOrder.save();

    res.json({
      success: true,
      message: "Expiry date set successfully",
      salesOrder
    });
  } catch (error) {
    console.error("Set Order Expiry Error:", error);
    res.status(500).json({
      success: false,
      message: "Error setting expiry date",
      error: error.message
    });
  }
};

// @desc    Extend expiry date for pending order
// @route   PATCH /api/sales-orders/:id/extend-expiry
// @access  Private
export const extendOrderExpiry = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { newExpiryDate, reason } = req.body;
    const { id } = req.params;

    if (!newExpiryDate) {
      return res.status(400).json({
        success: false,
        message: "New expiry date is required"
      });
    }

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    if (!salesOrder.expiryDate) {
      return res.status(400).json({
        success: false,
        message: "Order does not have an expiry date set"
      });
    }

    const extendedDate = new Date(newExpiryDate);
    const now = new Date();

    if (extendedDate <= now) {
      return res.status(400).json({
        success: false,
        message: "New expiry date must be in the future"
      });
    }

    // Allow extending even if order is expired - just check that new date is in future
    // Remove the check: if (extendedDate <= salesOrder.expiryDate)

    // Add to expiry history
    salesOrder.expiryHistory.push({
      action: 'extended',
      previousDate: salesOrder.expiryDate,
      newDate: extendedDate,
      reason: reason || 'Expiry date extended',
      performedBy: req.user._id,
      performedAt: new Date()
    });

    salesOrder.expiryDate = extendedDate;
    salesOrder.expiryExtendedCount += 1;
    salesOrder.isExpired = false; // Reset if was expired
    
    // If order was expired, change status back to Pending
    if (salesOrder.status === "Expired") {
      salesOrder.status = "Pending";
    }

    await salesOrder.save();

    res.json({
      success: true,
      message: "Expiry date extended successfully",
      salesOrder
    });
  } catch (error) {
    console.error("Extend Order Expiry Error:", error);
    res.status(500).json({
      success: false,
      message: "Error extending expiry date",
      error: error.message
    });
  }
};

// @desc    Expire order immediately
// @route   PATCH /api/sales-orders/:id/expire-now
// @access  Private
export const expireOrderNow = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { reason } = req.body;
    const { id } = req.params;

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    if (salesOrder.isExpired) {
      return res.status(400).json({
        success: false,
        message: "Order is already expired"
      });
    }

    // Add to expiry history
    salesOrder.expiryHistory.push({
      action: 'expired',
      previousDate: salesOrder.expiryDate,
      newDate: new Date(),
      reason: reason || 'Manually expired',
      performedBy: req.user._id,
      performedAt: new Date()
    });

    salesOrder.isExpired = true;
    salesOrder.expiredAt = new Date();
    salesOrder.status = "Cancelled"; // Auto-cancel expired orders
    salesOrder.remarks = (salesOrder.remarks || '') + ` [EXPIRED: ${reason || 'Manually expired'}]`;

    await salesOrder.save();

    res.json({
      success: true,
      message: "Order expired successfully",
      salesOrder
    });
  } catch (error) {
    console.error("Expire Order Now Error:", error);
    res.status(500).json({
      success: false,
      message: "Error expiring order",
      error: error.message
    });
  }
};

// @desc    Get orders expiring soon (within specified days)
// @route   GET /api/sales-orders/expiring-soon
// @access  Private
export const getOrdersExpiringSoon = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { days = 1 } = req.query; // Default to 1 day

    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(days));

    const expiringOrders = await SalesOrder.find({
      expiryDate: {
        $gte: now,
        $lte: futureDate
      },
      isExpired: false,
      status: "Pending"
    })
      .populate("dealer", "name code contactPerson phone email")
      .populate("region", "name")
      .populate("products.product", "productCode itemName")
      .sort({ expiryDate: 1 })
      .lean();

    // Calculate hours until expiry for each order
    const ordersWithTimeLeft = expiringOrders.map(order => {
      const timeLeft = order.expiryDate - now;
      const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
      const daysLeft = Math.floor(hoursLeft / 24);
      
      return {
        ...order,
        hoursUntilExpiry: hoursLeft,
        daysUntilExpiry: daysLeft,
        isUrgent: hoursLeft <= 24
      };
    });

    res.json({
      success: true,
      count: ordersWithTimeLeft.length,
      orders: ordersWithTimeLeft
    });
  } catch (error) {
    console.error("Get Expiring Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching expiring orders",
      error: error.message
    });
  }
};

// @desc    Cancel expiry (remove expiry date)
// @route   PATCH /api/sales-orders/:id/cancel-expiry
// @access  Private
export const cancelOrderExpiry = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { reason } = req.body;
    const { id } = req.params;

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    if (!salesOrder.expiryDate) {
      return res.status(400).json({
        success: false,
        message: "Order does not have an expiry date set"
      });
    }

    // Add to expiry history
    salesOrder.expiryHistory.push({
      action: 'cancelled',
      previousDate: salesOrder.expiryDate,
      newDate: null,
      reason: reason || 'Expiry cancelled',
      performedBy: req.user._id,
      performedAt: new Date()
    });

    salesOrder.expiryDate = null;
    salesOrder.expiryReason = null;
    salesOrder.isExpired = false;

    await salesOrder.save();

    res.json({
      success: true,
      message: "Expiry cancelled successfully",
      salesOrder
    });
  } catch (error) {
    console.error("Cancel Order Expiry Error:", error);
    res.status(500).json({
      success: false,
      message: "Error cancelling expiry",
      error: error.message
    });
  }
};

// @desc    Approve credit overlimit order
// @route   PATCH /api/sales-orders/:id/approve-credit-overlimit
// @access  Private (Super Admin only)
export const approveCreditOverlimit = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { approvalNotes } = req.body;
    const { id } = req.params;

    // Check if user is super admin
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can approve credit overlimit orders"
      });
    }

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    if (!salesOrder.creditOverlimit || !salesOrder.creditOverlimit.isOverlimit) {
      return res.status(400).json({
        success: false,
        message: "Order does not have credit overlimit"
      });
    }

    if (salesOrder.creditOverlimit.approvedBy) {
      return res.status(400).json({
        success: false,
        message: "Order already approved"
      });
    }

    // Update credit overlimit approval
    salesOrder.creditOverlimit.approvedBy = req.user._id;
    salesOrder.creditOverlimit.approvedAt = new Date();
    salesOrder.creditOverlimit.approvalNotes = approvalNotes || 'Credit overlimit approved';
    salesOrder.creditOverlimit.requiresApproval = false;

    // DON'T auto-confirm the order - keep it Pending for manual review
    // The order should be manually confirmed after credit approval
    // This allows for additional verification before stock is blocked

    await salesOrder.save();

    res.json({
      success: true,
      message: "Credit overlimit approved successfully. Order remains Pending - please confirm manually to proceed.",
      salesOrder
    });
  } catch (error) {
    console.error("Approve Credit Overlimit Error:", error);
    res.status(500).json({
      success: false,
      message: "Error approving credit overlimit",
      error: error.message
    });
  }
};

// Check stock availability for out-of-stock orders (called after purchase order received)
export const checkStockAvailabilityForOutOfStockOrders = async (req, res) => {
  try {
    const { SalesOrder, StockMovement, Notification } = getModels(req.dbConnection);
    const { productIds, warehouseId } = req.body;

    console.log('🔍 Checking stock availability for products:', productIds);
    console.log('📦 Warehouse:', warehouseId);

    // Find all out-of-stock orders that contain these products
    const outOfStockOrders = await SalesOrder.find({
      isOutOfStock: true,
      stockAvailable: false,
      status: 'Pending',
      'products.product': { $in: productIds }
    }).populate('dealer', 'name code');

    console.log(`📋 Found ${outOfStockOrders.length} out-of-stock orders to check`);

    let notifiedCount = 0;
    const notifiedOrders = [];

    for (const order of outOfStockOrders) {
      let allProductsAvailable = true;
      const stockStatus = [];

      // Check each product in the order
      for (const orderProduct of order.products) {
        const stock = await StockMovement.findOne({
          productId: orderProduct.product,
          warehouseId: warehouseId
        });

        const availableStock = stock ? stock.netStock : 0;
        const hasEnoughStock = availableStock >= orderProduct.quantity;

        stockStatus.push({
          productName: orderProduct.productName,
          required: orderProduct.quantity,
          available: availableStock,
          sufficient: hasEnoughStock
        });

        if (!hasEnoughStock) {
          allProductsAvailable = false;
        }
      }

      // If all products are now available, mark order
      if (allProductsAvailable && stockStatus.length > 0) {
        order.stockAvailable = true;
        order.stockAvailableNotifiedAt = new Date();
        await order.save();

        console.log(`✅ Stock available for order ${order.orderNumber}`);

        notifiedOrders.push({
          orderNumber: order.orderNumber,
          dealerName: order.dealerName,
          stockStatus
        });

        notifiedCount++;
      } else {
        console.log(`⏳ Stock not yet sufficient for order ${order.orderNumber}`);
      }
    }

    console.log(`📢 Notified ${notifiedCount} orders about stock arrival`);

    res.json({
      success: true,
      notifiedCount,
      notifiedOrders,
      message: `Checked ${outOfStockOrders.length} orders, notified ${notifiedCount} about stock arrival`
    });

  } catch (error) {
    console.error('❌ Error checking stock availability:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};





// Auto-expire orders that have passed their expiry date
export const autoExpireOrders = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const now = new Date();
    
    // Find all orders with expiry date in the past that are not yet expired
    const ordersToExpire = await SalesOrder.find({
      expiryDate: { $lt: now },
      isExpired: false,
      status: { $in: ["Pending"] } // Only expire pending orders
    });

    let expiredCount = 0;

    for (const order of ordersToExpire) {
      order.isExpired = true;
      order.expiredAt = now;
      order.status = "Expired"; // Change status to Expired
      
      order.expiryHistory.push({
        action: 'expired',
        previousDate: order.expiryDate,
        newDate: null,
        reason: 'Order automatically expired after deadline passed',
        performedBy: null, // System action
        performedAt: now
      });

      await order.save();
      expiredCount++;
    }

    console.log(`✅ Auto-expired ${expiredCount} orders`);

    res.json({
      success: true,
      expiredCount,
      message: `${expiredCount} orders automatically expired`
    });
  } catch (error) {
    console.error("Auto Expire Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Error auto-expiring orders",
      error: error.message
    });
  }
};


// @desc    Get stock status for a specific order
// @route   GET /api/sales-orders/:id/stock-status
// @access  Private
export const getOrderStockStatus = async (req, res) => {
  try {
    const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
    
    const result = await StockArrivalService.checkOrderStockStatus(req.params.id, req.dbConnection);
    
    res.json(result);
  } catch (error) {
    console.error('Get Order Stock Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting order stock status',
      error: error.message
    });
  }
};

// @desc    Manually refresh stock status for an order
// @route   POST /api/sales-orders/:id/refresh-stock-status
// @access  Private
export const refreshOrderStockStatus = async (req, res) => {
  try {
    const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
    
    const result = await StockArrivalService.checkOrderStockStatus(req.params.id, req.dbConnection);
    
    res.json({
      success: true,
      message: 'Stock status refreshed successfully',
      ...result
    });
  } catch (error) {
    console.error('Refresh Order Stock Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error refreshing order stock status',
      error: error.message
    });
  }
};

// @desc    Manually refresh stock status for an order by order number
// @route   POST /api/sales-orders/refresh-by-order-number/:orderNumber
// @access  Private
export const refreshOrderStockStatusByOrderNumber = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    
    // Find order by order number
    const order = await SalesOrder.findOne({ orderNumber });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order ${orderNumber} not found`
      });
    }
    
    const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
    
    const result = await StockArrivalService.checkOrderStockStatus(order._id, req.dbConnection);
    
    res.json({
      success: true,
      message: `Stock status refreshed successfully for order ${orderNumber}`,
      ...result
    });
  } catch (error) {
    console.error('Refresh Order Stock Status By Order Number Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error refreshing order stock status',
      error: error.message
    });
  }
};

// @desc    Migrate/fix orderStockStatus for all existing orders that have 'unknown' overallStatus
// @route   POST /api/sales-orders/migrate-stock-status
// @access  Private (Admin only)
export const migrateOrderStockStatus = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    // Find all orders where overallStatus is 'unknown' or orderStockStatus is missing
    const orders = await SalesOrder.find({
      $or: [
        { 'orderStockStatus.overallStatus': 'unknown' },
        { 'orderStockStatus.overallStatus': { $exists: false } },
        { orderStockStatus: { $exists: false } }
      ]
    });

    let updated = 0;
    let skipped = 0;

    for (const order of orders) {
      const products = order.products || [];
      const total = products.length;

      let overallStatus;
      let availableCount = 0;
      let waitingCount = 0;
      let partialCount = 0;

      // Cancelled/Rejected: mark as ready (no stock tracking needed)
      if (['Cancelled', 'Rejected'].includes(order.status)) {
        overallStatus = 'ready';
        availableCount = total;
      } else if (order.status === 'Delivered') {
        overallStatus = 'ready';
        availableCount = total;
      } else {
        // Compute from product-level stockStatus
        const unknownProducts = products.filter(p => !p.stockStatus || p.stockStatus === 'unknown');

        if (unknownProducts.length === total) {
          // All unknown — infer from order flags
          if (order.isOutOfStock) {
            overallStatus = 'waiting';
            waitingCount = total;
          } else {
            // Confirmed/Processing/In Transit without explicit tracking = stock was available
            overallStatus = 'ready';
            availableCount = total;
          }
        } else {
          availableCount = products.filter(p => p.stockStatus === 'available').length;
          waitingCount = products.filter(p => p.stockStatus === 'waiting').length;
          partialCount = products.filter(p => p.stockStatus === 'partial').length;

          if (availableCount === total) overallStatus = 'ready';
          else if (waitingCount === total) overallStatus = 'waiting';
          else if (availableCount > 0 || partialCount > 0) overallStatus = 'partial';
          else overallStatus = 'waiting';
        }
      }

      order.orderStockStatus = {
        totalProducts: total,
        availableProducts: availableCount,
        partialProducts: partialCount,
        waitingProducts: waitingCount,
        overallStatus,
        lastChecked: new Date()
      };

      await order.save();
      updated++;
    }

    res.json({
      success: true,
      message: `Migration complete: ${updated} orders updated, ${skipped} skipped`,
      updated,
      skipped
    });
  } catch (error) {
    console.error('Migrate Order Stock Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error migrating order stock status',
      error: error.message
    });
  }
};

// @desc    Manually trigger stock status refresh for all waiting/partial orders
// @route   POST /api/sales-orders/auto-refresh-stock-status
// @access  Private
export const autoRefreshAllStockStatus = async (req, res) => {
  try {
    const { runStockStatusRefresh } = await import('../cron/stockStatusRefresh.js');
    const result = await runStockStatusRefresh();
    res.json({
      success: true,
      message: `Stock status refreshed: ${result.updated} orders updated`,
      ...result
    });
  } catch (error) {
    console.error('Auto Refresh Stock Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error refreshing stock status',
      error: error.message
    });
  }
};

// @desc    Migrate/fix all existing orders to recalculate discount-aware totals
// @route   POST /api/sales-orders/migrate-discount-totals
// @access  Private (Super Admin)
// @desc    Partial dispatch — reduce confirmed order qty, unblock stock, optionally create new SO or deviation
// @route   PATCH /api/sales-orders/:id/partial-dispatch
// @access  Private
export const partialDispatch = async (req, res) => {
  try {
    const { SalesOrder, DealerInvoice, StockMovement } = getModels(req.dbConnection);
    const { id } = req.params;
    const { products, action } = req.body;
    // products: [{ productId, newQty, reason }]
    // action: 'new_order' | 'deviation'

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) return res.status(404).json({ success: false, message: 'Sales order not found' });
    if (salesOrder.status !== 'Confirmed') return res.status(400).json({ success: false, message: 'Partial dispatch only allowed for Confirmed orders' });

    // Check no APPROVED invoice exists (draft invoices don't block partial dispatch)
    const existingInvoice = await DealerInvoice.findOne({
      salesOrder: id,
      status: { $nin: ['Cancelled', 'Rejected', 'Draft'] },
      isDraft: { $ne: true }
    });
    if (existingInvoice) return res.status(400).json({ success: false, message: 'Cannot do partial dispatch — invoice already created for this order' });

    const deviations = [];
    const remainingProducts = []; // for new order

    for (const update of products) {
      const orderProduct = salesOrder.products.find(p => p.product.toString() === update.productId.toString());
      if (!orderProduct) continue;

      const originalQty = orderProduct.quantity;
      const newQty = parseInt(update.newQty);
      if (newQty >= originalQty) continue; // no reduction, skip
      // newQty = 0 means "skip this product entirely — move full qty to new order / deviation"
      if (newQty < 0) return res.status(400).json({ success: false, message: `Quantity cannot be negative for ${orderProduct.productName}` });

      const reducedQty = originalQty - newQty;

      // Unblock the reduced qty from stock (for qty=0 this unblocks the full original qty)
      if (orderProduct.warehouse) {
        const latestMovement = await StockMovement.findOne({
          productId: orderProduct.product,
          warehouseId: orderProduct.warehouse
        }).sort({ date: -1, createdAt: -1 });

        const currentBalance = latestMovement ? latestMovement.balance : 0;
        const newBalance = currentBalance + reducedQty;

        await new StockMovement({
          productId: orderProduct.product,
          warehouseId: orderProduct.warehouse,
          type: 'IN',
          quantity: reducedQty,
          balance: newBalance,
          referenceNo: salesOrder.orderNumber,
          referenceType: 'SALE',
          date: new Date(),
          remarks: newQty === 0
            ? `Stock Fully Unblocked - Order ${salesOrder.orderNumber} (product skipped in dispatch)`
            : `Stock Unblocked - Order ${salesOrder.orderNumber} Partial Dispatch (${originalQty} → ${newQty})`,
          createdBy: req.user._id
        }).save();
      }

      if (newQty === 0) {
        // Remove the product from the current order entirely
        salesOrder.products = salesOrder.products.filter(
          p => p.product.toString() !== update.productId.toString()
        );
      } else {
        // Update quantity on the order
        orderProduct.quantity = newQty;
        // Recalculate discountAmount for the reduced quantity
        const discPct = orderProduct.discountPercentage || 0;
        orderProduct.discountAmount = discPct > 0
          ? parseFloat(((newQty * orderProduct.unitPrice * discPct) / 100).toFixed(2))
          : 0;
      }

      // Record deviation
      deviations.push({
        productId: orderProduct.product,
        productName: orderProduct.productName,
        originalQty,
        dispatchedQty: newQty,
        reducedQty,
        reason: update.reason || (newQty === 0 ? 'Product not available — skipped from dispatch' : ''),
        createdAt: new Date(),
        createdBy: req.user._id,
        newOrderCreated: action === 'new_order',
        newOrderNumber: '' // filled after new order created
      });

      if (action === 'new_order') {
        remainingProducts.push({
          ...orderProduct.toObject(),
          quantity: reducedQty
        });
      }
    }

    if (deviations.length === 0) {
      return res.status(400).json({ success: false, message: 'No quantity reductions found. All new quantities must be less than original.' });
    }

    // Push deviations to order
    salesOrder.deviations.push(...deviations);

    // Recalculate order totals (pre-save hook will do this, but mark modified)
    salesOrder.markModified('products');
    await salesOrder.save();

    let newOrder = null;
    if (action === 'new_order' && remainingProducts.length > 0) {
      const orderNumber = await generateOrderNumber();
      newOrder = new SalesOrder({
        orderNumber,
        dealer: salesOrder.dealer,
        dealerName: salesOrder.dealerName,
        dealerCode: salesOrder.dealerCode,
        dealerType: salesOrder.dealerType,
        region: salesOrder.region,
        pinCode: salesOrder.pinCode,
        products: remainingProducts.map(p => {
          // Recalculate discountAmount for the remaining quantity using discount percentage
          const discPct = p.discountPercentage || 0;
          const newDiscountAmount = discPct > 0
            ? parseFloat(((p.quantity * p.unitPrice * discPct) / 100).toFixed(2))
            : 0;
          // pre-save hook will recalculate gstAmount and totalPrice from these values
          return {
            product: p.product,
            productCode: p.productCode,
            productName: p.productName,
            HSNCode: p.HSNCode,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            gst: p.gst,
            gstAmount: 0, // recalculated by pre-save
            totalPrice: 0, // recalculated by pre-save
            warehouse: p.warehouse,
            warehouseName: p.warehouseName,
            discountPercentage: discPct,
            discountAmount: newDiscountAmount,
            discountType: p.discountType || null,
            appliedDiscount: p.appliedDiscount || null
          };
        }),
        orderDate: salesOrder.orderDate,
        deliveryDate: salesOrder.deliveryDate,
        creditDays: salesOrder.creditDays,
        salesType: salesOrder.salesType,
        type: salesOrder.type,
        status: 'Pending',
        remarks: `Remaining qty from partial dispatch of ${salesOrder.orderNumber}`,
        grossAmount: 0, totalGst: 0, totalAmount: 0, // recalculated by pre-save
        createdBy: req.user._id
      });

      // Set 15-day auto-expiry for the new pending order
      const newOrderExpiry = new Date();
      newOrderExpiry.setDate(newOrderExpiry.getDate() + 15);
      newOrder.expiryDate = newOrderExpiry;
      newOrder.expiryReason = 'Automatic 15-day expiry for pending order (partial dispatch remainder)';
      newOrder.expiryHistory.push({
        action: 'set',
        previousDate: null,
        newDate: newOrderExpiry,
        reason: `Automatic 15-day expiry set — remaining qty from partial dispatch of ${salesOrder.orderNumber}`,
        performedBy: req.user._id,
        performedAt: new Date()
      });

      await newOrder.save();

      // Update deviation records with new order number
      for (const dev of salesOrder.deviations.slice(-deviations.length)) {
        dev.newOrderNumber = newOrder.orderNumber;
      }
      salesOrder.markModified('deviations');
      await salesOrder.save();
    }

    const updatedOrder = await SalesOrder.findById(id)
      .populate('dealer', 'name code')
      .populate('products.product')
      .populate('products.warehouse', 'name')
      .lean();

    res.json({
      success: true,
      message: `Partial dispatch saved. ${deviations.length} product(s) reduced.`,
      salesOrder: updatedOrder,
      deviations,
      newOrder: newOrder ? { orderNumber: newOrder.orderNumber, _id: newOrder._id } : null
    });
  } catch (error) {
    console.error('partialDispatch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all sales orders that have dispatch deviations
// @route   GET /api/sales-orders/dispatch-deviations
// @access  Private
export const getDispatchDeviations = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const {
      fromDate, toDate, search, dealer,
      page = 1, limit = 20
    } = req.query;

    const query = { 'deviations.0': { $exists: true } }; // only orders with at least 1 deviation

    if (dealer) query.dealer = dealer;
    if (fromDate || toDate) {
      query.orderDate = {};
      if (fromDate) query.orderDate.$gte = new Date(fromDate);
      if (toDate) query.orderDate.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
    }
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { dealerName: { $regex: search, $options: 'i' } },
        { 'deviations.productName': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await SalesOrder.countDocuments(query);

    const orders = await SalesOrder.find(query)
      .select('orderNumber dealerName orderDate status deviations')
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Flatten: one row per deviation entry
    const rows = [];
    for (const order of orders) {
      for (const dev of order.deviations || []) {
        rows.push({
          _id: `${order._id}_${dev._id || dev.productId}`,
          orderNumber: order.orderNumber,
          dealerName: order.dealerName,
          orderDate: order.orderDate,
          orderStatus: order.status,
          productName: dev.productName,
          originalQty: dev.originalQty,
          dispatchedQty: dev.dispatchedQty,
          reducedQty: dev.reducedQty,
          reason: dev.reason,
          createdAt: dev.createdAt,
          newOrderCreated: dev.newOrderCreated,
          newOrderNumber: dev.newOrderNumber
        });
      }
    }

    res.json({
      success: true,
      data: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalCount: total,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('getDispatchDeviations error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const migrateDiscountTotals = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);
    
    const orders = await SalesOrder.find({}).lean();
    let fixed = 0;
    let skipped = 0;

    for (const order of orders) {
      if (!order.products || order.products.length === 0) { skipped++; continue; }

      let gross = 0, totalGst = 0, totalDiscount = 0;
      const updatedProducts = order.products.map(p => {
        const baseAmount = p.quantity * p.unitPrice;
        const discAmt = p.discountAmount || 0;
        const discountedBase = baseAmount - discAmt;
        const gstAmt = (discountedBase * (p.gst || 0)) / 100;
        const totalPrice = discountedBase + gstAmt;
        gross += baseAmount;
        totalGst += gstAmt;
        totalDiscount += discAmt;
        return { ...p, gstAmount: gstAmt, totalPrice };
      });

      const correctTotal = gross - totalDiscount + totalGst;

      // Only update if something actually changed
      const needsUpdate =
        Math.abs((order.discountAmount || 0) - totalDiscount) > 0.01 ||
        Math.abs((order.totalGst || 0) - totalGst) > 0.01 ||
        Math.abs((order.totalAmount || 0) - correctTotal) > 0.01;

      if (!needsUpdate) { skipped++; continue; }

      await SalesOrder.findByIdAndUpdate(order._id, {
        $set: {
          grossAmount: gross,
          discountAmount: totalDiscount,
          totalGst,
          totalAmount: correctTotal,
          products: updatedProducts
        }
      });
      fixed++;
    }

    res.json({
      success: true,
      message: `Migration complete: ${fixed} orders fixed, ${skipped} skipped (already correct or empty)`,
      fixed,
      skipped,
      total: orders.length
    });
  } catch (error) {
    console.error('Migrate Discount Totals Error:', error);
    res.status(500).json({ success: false, message: 'Migration failed', error: error.message });
  }
};


