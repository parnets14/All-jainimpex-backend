// Sales Order Controller - Fixed duplicate function declarations
import SalesOrder from "../models/SalesOrder.js";
import Product from "../models/Product.js";
import Dealer from "../models/Dealer.js";
import Stock from "../models/Stock.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

// Generate unique order number
const generateOrderNumber = async () => {
  try {
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
      stockArrived
    } = req.query;

    // Build query object
    const query = {};

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

    // Filter by region
    if (region) {
      query.region = region;
    }

    // Filter by order type
    if (type) {
      query.type = type;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.orderDate = {};
      if (startDate) query.orderDate.$gte = new Date(startDate);
      if (endDate) query.orderDate.$lte = new Date(endDate);
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
    const ordersWithAnalytics = salesOrders.map(order => {
      const totalItems = order.products ? order.products.reduce((sum, product) => sum + (product.quantity || 0), 0) : 0;
      return {
        ...order,
        totalItems,
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
    const orderNumber = await generateOrderNumber();
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
      const baseAmount = item.quantity * unitPrice;
      const gstAmount = (baseAmount * gst) / 100;
      
      tempValidatedProducts.push({
        quantity: item.quantity,
        unitPrice: unitPrice,
        gstAmount: gstAmount
      });
    }
    
    const orderGrossAmount = tempValidatedProducts.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
    const orderTotalGst = tempValidatedProducts.reduce((sum, p) => sum + p.gstAmount, 0);
    const orderTotalAmount = orderGrossAmount + orderTotalGst;

    console.log(`💰 Credit Limit Calculation - In-Stock Products Only:`, {
      totalProducts: products.length,
      inStockProducts: tempValidatedProducts.length,
      orderAmount: orderTotalAmount
    });

    // Check credit limit if dealer has one set
    if (dealerData.creditLimit && dealerData.creditLimit > 0) {
      // Get dealer's current outstanding balance from ledger
      const DealerLedger = (await import("../models/DealerLedger.js")).default;
      const lastLedgerEntry = await DealerLedger.findOne({ dealer: dealer })
        .sort({ createdAt: -1 });
      
      const currentOutstanding = lastLedgerEntry ? lastLedgerEntry.runningBalance : 0;
      const newOutstanding = currentOutstanding + orderTotalAmount;
      
      console.log(`💳 Credit Limit Check:`, {
        creditLimit: dealerData.creditLimit,
        currentOutstanding,
        orderAmount: orderTotalAmount,
        newOutstanding,
        overlimit: newOutstanding - dealerData.creditLimit
      });
      
      // If credit limit exceeded, force status to Pending and add credit overlimit info
      if (newOutstanding > dealerData.creditLimit) {
        const overlimitAmount = newOutstanding - dealerData.creditLimit;
        console.log(`⚠️ Credit limit exceeded by ₹${overlimitAmount.toFixed(2)}`);
        
        // Force status to Pending for approval
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
        const Warehouse = (await import("../models/Warehouse.js")).default;
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
          const stock = await Stock.findOne({
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
      const gstAmount = (baseAmount * gst) / 100;
      const totalPrice = baseAmount + gstAmount;

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
        warehouseName: item.warehouse === "No Stock" ? "No Stock" : item.warehouseName
      });
    }

    // Calculate order totals
    const grossAmount = validatedProducts.reduce((sum, product) => sum + (product.quantity * product.unitPrice), 0);
    const totalGst = validatedProducts.reduce((sum, product) => sum + product.gstAmount, 0);
    const totalAmount = grossAmount + totalGst;

    // Calculate due date
    let dueDate = null;
    if (orderDate && finalCreditDays) {
      dueDate = new Date(orderDate);
      dueDate.setDate(dueDate.getDate() + finalCreditDays);
    }

    // Determine initial status based on stock availability
    let initialStatus = status || "Pending";
    
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
            const StockMovement = (await import("../models/Stock.js")).default;
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
            const StockMovement = (await import("../models/Stock.js")).default;
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

    // CRITICAL: Prevent status changes for orders with unapproved credit overlimit
    if (salesOrder.creditOverlimit && 
        salesOrder.creditOverlimit.isOverlimit && 
        !salesOrder.creditOverlimit.approvedBy &&
        status !== "Cancelled" && 
        status !== "Rejected") {
      return res.status(400).json({
        success: false,
        message: `Cannot change status - Credit limit exceeded by ₹${(salesOrder.creditOverlimit.overlimitAmount || 0).toLocaleString()}. Super Admin approval required before this order can proceed.`
      });
    }

    // Special handling for Confirmed status (stock allocation) - only for in-stock orders
    if (status === "Confirmed" && !salesOrder.isOutOfStock) {
      // CRITICAL: Verify stock availability for all products BEFORE confirming
      const StockMovement = (await import("../models/Stock.js")).default;
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
            const StockMovement = (await import("../models/Stock.js")).default;
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
        console.log(`Order delivered - ${originalStatus === "Confirmed" ? "permanently reducing already blocked stock" : "permanently reducing stock"}`);
        for (const product of salesOrder.products) {
          if (product.warehouse) {
            // Get current balance before creating the movement
            const StockMovement = (await import("../models/Stock.js")).default;
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });
            
            const currentBalance = latestMovement ? latestMovement.balance : 0;
            
            if (originalStatus === "Confirmed") {
              // Stock is already blocked, just create tracking record
              const deliveryMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'OUT',
                quantity: 0, // No quantity change, just tracking
                balance: currentBalance, // Keep same balance
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
                createdBy: req.user._id
              });
              await deliveryMovement.save();
              console.log(`Order ${salesOrder.orderNumber} delivered - stock permanently reduced for product ${product.product} in warehouse ${product.warehouse}`);
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
        for (const product of salesOrder.products) {
          if (product.warehouse) {
            // Get current balance before creating the movement
            const StockMovement = (await import("../models/Stock.js")).default;
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
            
            // Check if any waiting orders can now be fulfilled with the restored stock
            try {
              const StockArrivalService = (await import("../services/stockArrivalService.js")).default;
              const checkResult = await StockArrivalService.checkWaitingOrdersForStock(
                product.product,
                product.warehouse,
                product.quantity
              );
              
              if (checkResult.ordersUpdated > 0) {
                console.log(`✅ Stock restored from cancellation - ${checkResult.ordersUpdated} waiting orders updated (${checkResult.ordersReady} ready, ${checkResult.ordersPartial} partial)`);
              }
            } catch (stockCheckError) {
              console.error('Error checking waiting orders after cancellation:', stockCheckError);
              // Don't fail the cancellation if stock check fails
            }
          }
        }
      }
    } else {
      console.log("🚨 Out-of-stock order - no stock movements will be made");
    }

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
        const stock = await Stock.findOne({
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
          const stock = await Stock.findOne({
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
    }

    // Store original status before update
    const originalStatus = salesOrder.status;
    const newStatus = req.body.status;

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
        const StockMovement = (await import("../models/Stock.js")).default;
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
        const StockMovement = (await import("../models/Stock.js")).default;
        for (const product of req.body.products || salesOrder.products) {
          if (product.warehouse) {
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });
            
            const currentBalance = latestMovement ? latestMovement.balance : 0;
            if (originalStatus === "Confirmed") {
              // Stock already blocked, just create tracking record
              const deliveryMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'OUT',
                quantity: 0,
                balance: currentBalance,
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
        const StockMovement = (await import("../models/Stock.js")).default;
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
        const Notification = (await import("../models/Notification.js")).default;
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
        
        console.log(`📧 Notification created for dealer ${updatedOrder.dealer}: ${message} (Status changed from ${originalStatus} to ${newStatus})`);
      } catch (notificationError) {
        console.error('Error creating notification:', notificationError);
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
    const stock = await Stock.find(query)
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
async function createSingleSalesOrder(orderData, userId) {
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
  const orderNumber = await generateOrderNumber();
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
      const Warehouse = (await import("../models/Warehouse.js")).default;
      const warehouse = await Warehouse.findById(item.warehouse);
      
      if (!warehouse) {
        throw new Error(`Warehouse not found: ${item.warehouse}`);
      }

      // For out-of-stock orders, skip stock validation
      if (!isOutOfStock) {
        // For regular orders, validate stock availability
        const stock = await Stock.findOne({
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
    const gstAmount = (baseAmount * gst) / 100;
    const totalPrice = baseAmount + gstAmount;

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
      discountAmount: item.discountAmount || 0,
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
    
    // Get dealer's current outstanding balance from ledger
    const DealerLedger = (await import("../models/DealerLedger.js")).default;
    const lastLedgerEntry = await DealerLedger.findOne({ dealer: dealer })
      .sort({ createdAt: -1 });
    
    const currentOutstanding = lastLedgerEntry ? lastLedgerEntry.runningBalance : 0;
    const newOutstanding = currentOutstanding + inStockTotalAmount; // Use in-stock amount only
    
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
          const StockMovement = (await import("../models/Stock.js")).default;
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
          const StockMovement = (await import("../models/Stock.js")).default;
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
      
      const regularOrder = await createSingleSalesOrder(regularOrderData, req.user._id);
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
      
      const cdOrder = await createSingleSalesOrder(cdOrderData, req.user._id);
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
// Check stock availability for out-of-stock orders (called after purchase order received)

    });
  }
};

// Check stock availability for out-of-stock orders (called after purchase order received)
export const checkStockAvailabilityForOutOfStockOrders = async (req, res) => {
  try {
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
        const stock = await Stock.findOne({
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
    
    const result = await StockArrivalService.checkOrderStockStatus(req.params.id);
    
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
    
    const result = await StockArrivalService.checkOrderStockStatus(req.params.id);
    
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
    
    const result = await StockArrivalService.checkOrderStockStatus(order._id);
    
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
