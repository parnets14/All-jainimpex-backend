import SalesOrder from "../models/SalesOrder.js";
import Product from "../models/Product.js";
import Dealer from "../models/Dealer.js";
import Stock from "../models/Stock.js";
import User from "../models/User.js";

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
      type
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
      .populate("dealer", "name contactPerson phone email address dealerType")
      .populate("region", "name")
      .populate("products.product", "productCode itemName HSNCode gst rateSlabs")
      .populate("products.warehouse", "name")
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
      .populate("dealer")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
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
      remarks,
      status
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

      // Validate warehouse exists
      if (item.warehouse) {
        const Warehouse = (await import("../models/Warehouse.js")).default;
        const warehouse = await Warehouse.findById(item.warehouse);
        
        if (!warehouse) {
          return res.status(400).json({
            success: false,
            message: `Warehouse not found: ${item.warehouse}`
          });
        }

        // For now, we'll skip stock validation since stock is calculated from GRNs
        // In a production system, you would check available stock here
        console.log(`Product ${product.itemName} validated for warehouse ${warehouse.name}`);
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
        warehouse: item.warehouse,
        warehouseName: item.warehouseName
      });
    }

    // Calculate order totals
    const grossAmount = validatedProducts.reduce((sum, product) => sum + (product.quantity * product.unitPrice), 0);
    const totalGst = validatedProducts.reduce((sum, product) => sum + product.gstAmount, 0);
    const totalAmount = grossAmount + totalGst;

    // Calculate due date
    let dueDate = null;
    if (orderDate && creditDays) {
      dueDate = new Date(orderDate);
      dueDate.setDate(dueDate.getDate() + parseInt(creditDays));
    }

    // Create sales order
    console.log("Creating sales order with orderNumber:", orderNumber);
    console.log("All values:", { orderNumber, dealer, dealerName: dealerData.name, dealerType: dealerData.dealerType, region, pinCode, products: validatedProducts.length, orderDate, deliveryDate, creditDays, grossAmount, totalGst, totalAmount, type, remarks });
    
    const salesOrder = new SalesOrder({
      orderNumber,
      dealer,
      dealerName: dealerData.name,
      dealerType: dealerData.dealerType,
      region,
      pinCode,
      products: validatedProducts,
      orderDate,
      deliveryDate,
      creditDays: parseInt(creditDays) || 30,
      dueDate,
      grossAmount,
      totalGst,
      totalAmount,
      type,
      remarks,
      status: status || "Pending",
      createdBy: req.user._id
    });

    // Save sales order
    await salesOrder.save();

    // Handle stock updates based on initial status
    if (salesOrder.status === "Confirmed") {
      console.log("Order created with Confirmed status - blocking stock");
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
    } else if (salesOrder.status === "Delivered") {
      console.log("Order created with Delivered status - permanently reducing stock");
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

    // Populate the created order for response
    const populatedOrder = await SalesOrder.findById(salesOrder._id)
      .populate("dealer")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Sales order created successfully",
      salesOrder: populatedOrder
    });
  } catch (error) {
    console.error("Create Sales Order Error:", error);
    
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

// @desc    Update sales order status (approval/rejection)
// @route   PATCH /api/sales-orders/:id/status
// @access  Private
export const updateSalesOrderStatus = async (req, res) => {
  try {
    const { status, remarks } = req.body;
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

    // Special handling for Confirmed status (stock allocation)
    if (status === "Confirmed") {
      // Verify stock availability for all products
      for (const product of salesOrder.products) {
        if (product.warehouse) {
          const stock = await Stock.findOne({
            productId: product.product,
            warehouseId: product.warehouse
          });

          if (!stock) {
            return res.status(400).json({
              success: false,
              message: `Cannot confirm order. Product ${product.productName} not available in selected warehouse`
            });
          }

          if (stock.netStock < product.quantity) {
            return res.status(400).json({
              success: false,
              message: `Cannot confirm order. Insufficient stock for ${product.productName} in ${stock.warehouse}. Available: ${stock.netStock}, Required: ${product.quantity}`
            });
          }
        }
      }

      // Allocate stock for all products
      for (const product of salesOrder.products) {
        if (product.warehouse) {
          await Stock.findOneAndUpdate(
            { 
              productId: product.product,
              warehouseId: product.warehouse
            },
            { 
              $inc: { 
                blockedQty: product.quantity,
                netStock: -product.quantity
              }
            }
          );

          // Update main product stock
          await Product.findByIdAndUpdate(
            product.product,
            { $inc: { stock: -product.quantity } }
          );
        }
      }

      // Update order with approval info
      salesOrder.approvedBy = req.user._id;
      salesOrder.approvedAt = new Date();
    }

    // Handle stock restoration for rejected or cancelled orders
    if ((status === "Rejected" || status === "Cancelled") && originalStatus === "Confirmed") {
      // Restore stock for all products
      for (const product of salesOrder.products) {
        if (product.warehouse) {
          await Stock.findOneAndUpdate(
            { 
              productId: product.product,
              warehouseId: product.warehouse
            },
            { 
              $inc: { 
                blockedQty: -product.quantity,
                netStock: product.quantity
              }
            }
          );

          // Restore main product stock
          await Product.findByIdAndUpdate(
            product.product,
            { $inc: { stock: product.quantity } }
          );
        }
      }
    }

    // Handle stock management based on status changes
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
        }
      }
    }

    // Update order status and remarks
    salesOrder.status = status;
    if (remarks) {
      salesOrder.remarks = remarks;
    }

    await salesOrder.save();

    // Populate updated order for response
    const updatedOrder = await SalesOrder.findById(id)
      .populate("dealer")
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

    // Only allow editing of pending orders
    if (salesOrder.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Can only edit pending orders"
      });
    }

    // Validate products if they are being updated
    if (req.body.products) {
      for (const item of req.body.products) {
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

    // Update the sales order
    const updatedOrder = await SalesOrder.findByIdAndUpdate(
      id,
      req.body,
      { 
        new: true, 
        runValidators: true 
      }
    )
      .populate("dealer")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("createdBy", "name email");

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