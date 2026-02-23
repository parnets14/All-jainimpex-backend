import mongoose from 'mongoose';
import DealerInvoice from "../models/DealerInvoice.js";
import SalesOrder from "../models/SalesOrder.js";
import Dealer from "../models/Dealer.js";
import Product from "../models/Product.js";
import DiscountMapping from "../models/DiscountMapping.js";
import Points from "../models/Points.js";
import Stock from "../models/Stock.js";
import StockMovement from "../models/Stock.js"; // StockMovement is exported from Stock.js
import DealerLedger from "../models/DealerLedger.js";
import Notification from "../models/Notification.js";

// Generate unique invoice number
const generateInvoiceNumber = async () => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `INV-${currentYear}-`;
    
    // Find the highest invoice number for this year
    const lastInvoice = await DealerInvoice.findOne({
      invoiceNumber: { $regex: `^${prefix}` }
    }).sort({ invoiceNumber: -1 });
    
    let nextNumber = 1;
    if (lastInvoice) {
      // Extract the number from the last invoice
      const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
      nextNumber = lastNumber + 1;
    }
    
    // Format with leading zeros (4 digits)
    const invoiceNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
    
    // Double-check uniqueness
    const existingInvoice = await DealerInvoice.findOne({ invoiceNumber });
    if (existingInvoice) {
      return `${prefix}${(nextNumber + 1).toString().padStart(4, '0')}`;
    }
    
    return invoiceNumber;
  } catch (error) {
    console.error('Error generating invoice number:', error);
    const timestamp = Date.now().toString().slice(-6);
    return `INV-${new Date().getFullYear()}-${timestamp}`;
  }
};

// @desc    Get all dealer invoices
// @route   GET /api/dealer-invoices
// @access  Private
export const getDealerInvoices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      paymentStatus,
      dealer,
      region,
      startDate,
      endDate,
      salesOrder,
      showCancelled = 'false' // New parameter to show/hide cancelled invoices
    } = req.query;

    // Build query object
    const query = {};
    
    // By default, exclude cancelled/deleted invoices
    if (showCancelled !== 'true') {
      query.isDeleted = { $ne: true };
    }

    // Search functionality
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { dealerName: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { salesOrderNumber: { $regex: search, $options: "i" } }
      ];
    }

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Filter by payment status
    if (paymentStatus && paymentStatus !== "all") {
      query.paymentStatus = paymentStatus;
    }

    // Filter by dealer
    if (dealer) {
      query.dealer = dealer;
    }

    // Filter by region
    if (region) {
      query.region = region;
    }

    // Filter by sales order
    if (salesOrder) {
      query.salesOrder = salesOrder;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const invoices = await DealerInvoice.find(query)
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("deletedBy", "name email") // Populate who cancelled the invoice
      .populate("items.product", "itemName productCode HSNCode")
      .populate("items.warehouse", "name")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get total count for pagination
    const total = await DealerInvoice.countDocuments(query);

    res.json({
      success: true,
      invoices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get dealer invoices error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching dealer invoices"
    });
  }
};

// @desc    Get single dealer invoice
// @route   GET /api/dealer-invoices/:id
// @access  Private
export const getDealerInvoice = async (req, res) => {
  try {
    const invoice = await DealerInvoice.findById(req.params.id)
      .populate("dealer", "name code dealerType contactPerson phone email address gst pan")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber orderDate deliveryDate")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("items.product", "itemName productCode HSNCode description")
      .populate("items.warehouse", "name address")
      .populate("items.appliedDiscounts.discountId", "mappingType levels validFrom validTo");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Dealer invoice not found"
      });
    }

    res.json({
      success: true,
      invoice
    });
  } catch (error) {
    console.error("Get dealer invoice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching dealer invoice"
    });
  }
};

// @desc    Get dealer's confirmed and above sales orders for invoice creation
// @route   GET /api/dealer-invoices/sales-orders/:dealerId
// @access  Private
export const getDealerSalesOrders = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { status = "Delivered" } = req.query;

    // Get sales orders that are confirmed or above (Confirmed, Processing, Delivered, Completed)
    const salesOrders = await SalesOrder.find({
      dealer: dealerId,
      status: { $in: ["Confirmed", "Processing", "Delivered", "Completed"] }
    })
      .populate("products.product", "itemName productCode HSNCode description brand category subcategory")
      .populate("products.warehouse", "name")
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .sort({ orderDate: -1 });

    res.json({
      success: true,
      salesOrders
    });
  } catch (error) {
    console.error("Get dealer sales orders error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching dealer sales orders"
    });
  }
};

// @desc    Calculate discounts and points for products
// @route   POST /api/dealer-invoices/calculate-discounts
// @access  Private
export const calculateDiscountsAndPoints = async (req, res) => {
  try {
    const { items, dealerId } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Items array is required"
      });
    }

    const processedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId)
        .populate("brand", "name")
        .populate("category", "name")
        .populate("subcategory", "name");

      if (!product) {
        continue;
      }

      // Find applicable discounts
      const discounts = await DiscountMapping.find({
        mappingType: "sales",
        status: "Approved",
        brand: product.brand._id,
        category: product.category._id,
        subcategory: product.subcategory._id,
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() }
      }).populate("brand category subcategory", "name");

      // Calculate discount amount
      let totalDiscountPercentage = 0;
      let appliedDiscounts = [];

      if (discounts.length > 0) {
        // Use the highest discount percentage
        const maxDiscount = discounts.reduce((max, discount) => {
          const maxLevelDiscount = Math.max(...discount.levels.map(level => level.discountPercentage));
          return maxLevelDiscount > max ? maxLevelDiscount : max;
        }, 0);

        totalDiscountPercentage = maxDiscount;
        
        // Store applied discounts
        appliedDiscounts = discounts.map(discount => ({
          discountId: discount._id,
          discountName: `${discount.brand.name} - ${discount.category.name} - ${discount.subcategory.name}`,
          discountValue: maxDiscount,
          discountType: "percentage"
        }));
      }

      // Find applicable points
      const points = await Points.find({
        type: "sale",
        brand: product.brand._id,
        category: product.category._id,
        subcategory: product.subcategory._id
      });

      let pointsEarned = 0;
      if (points.length > 0) {
        const point = points[0]; // Use first matching point rule
        if (point.calculationType === "amount") {
          const amountAfterDiscount = (item.quantity * item.unitPrice) * (1 - totalDiscountPercentage / 100);
          pointsEarned = Math.floor(amountAfterDiscount / point.inputValue) * point.points;
        } else if (point.calculationType === "units") {
          pointsEarned = Math.floor(item.quantity / point.inputValue) * point.points;
        }
      }

      processedItems.push({
        product: product._id,
        productCode: product.productCode,
        productName: product.itemName,
        HSNCode: product.HSNCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        gst: product.gst || 0,
        discountPercentage: totalDiscountPercentage,
        appliedDiscounts,
        pointsEarned,
        warehouse: item.warehouseId,
        warehouseName: item.warehouseName
      });
    }

    res.json({
      success: true,
      items: processedItems
    });
  } catch (error) {
    console.error("Calculate discounts and points error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while calculating discounts and points"
    });
  }
};

// @desc    Create new dealer invoice
// @route   POST /api/dealer-invoices
// @access  Private
export const createDealerInvoice = async (req, res) => {
  try {
    console.log("Creating dealer invoice with data:", {
      dealerId: req.body.dealerId,
      itemsCount: req.body.items?.length,
      subtotal: req.body.subtotal,
      totalAmount: req.body.totalAmount
    });
    
    const {
      dealerId,
      salesOrderId,
      customerInfo,
      items,
      creditDays = 30, // This will be overridden based on sales type
      remarks,
      internalNotes,
      subtotal,
      totalDiscount,
      totalGst,
      totalAmount,
      totalPoints
    } = req.body;

    // Validate required fields
    if (!dealerId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Dealer ID and items are required"
      });
    }

    // Get dealer information
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    // Determine sales type from items and calculate appropriate credit days
    let determinedSalesType = 'Regular Sale'; // Default
    let appropriateCreditDays = creditDays; // Start with provided value
    
    console.log('🔍 Analyzing items for sales type:', items.map(item => ({
      productName: item.productName,
      salesType: item.salesType
    })));
    
    // Check if any item has CD Sales type
    const hasCDSales = items.some(item => item.salesType === 'CD Sales');
    const hasRegularSales = items.some(item => item.salesType === 'Regular Sale' || !item.salesType);
    
    console.log('📊 Sales type analysis:', { hasCDSales, hasRegularSales });
    
    if (hasCDSales && !hasRegularSales) {
      // All items are CD Sales
      determinedSalesType = 'CD Sales';
      appropriateCreditDays = dealer.creditDaysCD || dealer.creditDays || creditDays;
      console.log('✅ All CD Sales - Using CD credit days:', appropriateCreditDays);
    } else if (hasRegularSales && !hasCDSales) {
      // All items are Regular Sales
      determinedSalesType = 'Regular Sale';
      appropriateCreditDays = dealer.creditDaysRegular || dealer.creditDays || creditDays;
      console.log('✅ All Regular Sales - Using Regular credit days:', appropriateCreditDays);
    } else if (hasCDSales && hasRegularSales) {
      // Mixed sales - use the longer credit period (typically CD Sales has longer credit)
      const cdDays = dealer.creditDaysCD || dealer.creditDays || 0;
      const regularDays = dealer.creditDaysRegular || dealer.creditDays || 0;
      appropriateCreditDays = Math.max(cdDays, regularDays, creditDays);
      determinedSalesType = 'Mixed'; // Indicate mixed sales
      console.log('✅ Mixed Sales - Using longer credit period:', appropriateCreditDays);
    }
    
    console.log(`📋 Sales Type Determination:`, {
      hasCDSales,
      hasRegularSales,
      determinedSalesType,
      providedCreditDays: creditDays,
      appropriateCreditDays,
      dealerCreditDaysCD: dealer.creditDaysCD,
      dealerCreditDaysRegular: dealer.creditDaysRegular,
      dealerCreditDays: dealer.creditDays
    });

    // Backend validation for discount limits
    console.log("🔍 Starting backend discount validation...");
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`📋 Validating item ${i + 1}: ${item.productName}`);
      
      // Skip validation if no discount applied
      if (!item.discountPercentage || item.discountPercentage === 0) {
        console.log(`  ✅ No discount applied, skipping validation`);
        continue;
      }
      
      // Get applicable discount mappings for this product
      try {
        const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
          item.product,
          'sales',
          dealer.dealerType
        );
        
        console.log(`  📊 Found ${applicableDiscounts.length} applicable discounts`);
        
        if (applicableDiscounts.length === 0) {
          console.log(`  ⚠️ No applicable discounts found, but discount applied: ${item.discountPercentage}%`);
          return res.status(400).json({
            success: false,
            message: `Invalid discount applied to ${item.productName}. No applicable discount mapping found.`
          });
        }
        
        // Use the first (highest priority) discount mapping
        const discountMapping = applicableDiscounts[0];
        const maxDiscountLimit = discountMapping.maxDiscountPercentage || 100; // Fallback to 100% if undefined
        
        console.log(`  🎯 Max discount limit: ${maxDiscountLimit}%`);
        console.log(`  💰 Applied discount: ${item.discountPercentage}%`);
        
        // NEW LOGIC: Validate discount limit excluding direct discount
        // Calculate level-based discount and dealer extra discount for validation
        let levelBasedDiscount = 0;
        let directDiscount = 0;
        let dealerExtraDiscount = item.dealerExtraDiscount || 0;
        
        // If discount type is 'both', separate direct discount from level-based
        if (discountMapping.discountType === 'both') {
          directDiscount = discountMapping.directDiscountPercentage || 0;
          levelBasedDiscount = (item.discountPercentage || 0) - directDiscount;
        } else if (discountMapping.discountType === 'direct') {
          directDiscount = item.discountPercentage || 0;
          levelBasedDiscount = 0;
        } else {
          // level_based only
          levelBasedDiscount = item.discountPercentage || 0;
          directDiscount = 0;
        }
        
        // Only validate level-based + dealer extra against max limit (exclude direct discount)
        const discountToValidate = levelBasedDiscount + dealerExtraDiscount;
        
        console.log(`  💡 NEW DISCOUNT VALIDATION LOGIC for ${item.productName}:`);
        console.log(`    - Direct Discount: ${directDiscount}% (not limited)`);
        console.log(`    - Level-based Discount: ${levelBasedDiscount}%`);
        console.log(`    - Dealer Extra Discount: ${dealerExtraDiscount}%`);
        console.log(`    - Discount to Validate: ${discountToValidate}% (≤ ${maxDiscountLimit}%)`);
        console.log(`    - Total Applied: ${item.discountPercentage + dealerExtraDiscount}%`);
        
        if (discountToValidate > maxDiscountLimit) {
          console.log(`  ❌ Discount validation failed: ${discountToValidate}% > ${maxDiscountLimit}%`);
          return res.status(400).json({
            success: false,
            message: `Level-based and dealer extra discount for ${item.productName} (${discountToValidate}%) exceeds maximum allowed limit of ${maxDiscountLimit}%. Direct discount (${directDiscount}%) is not limited. Please reduce the level-based or dealer extra discount and try again.`,
            validationError: {
              type: 'DISCOUNT_LIMIT_EXCEEDED',
              productName: item.productName,
              levelBasedDiscount: levelBasedDiscount,
              dealerExtraDiscount: dealerExtraDiscount,
              directDiscount: directDiscount,
              validatedDiscount: discountToValidate,
              totalAppliedDiscount: item.discountPercentage + dealerExtraDiscount,
              maxLimit: maxDiscountLimit,
              discountMappingName: discountMapping.discountName
            }
          });
        }
        
        // Additional validation for level-based discounts
        if (item.selectedDiscountLevels && item.selectedDiscountLevels.length > 0) {
          console.log(`  🎚️ Validating selected levels: ${item.selectedDiscountLevels.join(', ')}`);
          
          // Calculate expected discount from selected levels
          let expectedLevelDiscount = 0;
          let directDiscount = 0;
          
          // Add direct discount if discount type is 'both'
          if (discountMapping.discountType === 'both') {
            directDiscount = discountMapping.directDiscountPercentage || 0;
          }
          
          // Add level discounts (using manual percentages if available)
          for (const levelName of item.selectedDiscountLevels) {
            const level = discountMapping.levels?.find(l => l.levelName === levelName);
            if (level) {
              // Use manual percentage if available, otherwise use default level percentage
              const manualPercentage = item.manualDiscountLevels?.[levelName];
              const percentage = manualPercentage !== undefined ? manualPercentage : level.discountPercentage;
              expectedLevelDiscount += percentage;
            } else {
              console.log(`  ❌ Invalid level selected: ${levelName}`);
              return res.status(400).json({
                success: false,
                message: `Invalid discount level "${levelName}" selected for ${item.productName}.`
              });
            }
          }
          
          // NEW LOGIC: Calculate expected discount and validate excluding direct discount
          const expectedTotalDiscount = directDiscount + expectedLevelDiscount;
          const expectedValidatedDiscount = expectedLevelDiscount + (item.dealerExtraDiscount || 0);
          
          console.log(`  📊 Expected discount breakdown:`);
          console.log(`    - Direct: ${directDiscount}% (not limited)`);
          console.log(`    - Levels: ${expectedLevelDiscount}%`);
          console.log(`    - Dealer Extra: ${item.dealerExtraDiscount || 0}%`);
          console.log(`    - Total Expected: ${expectedTotalDiscount}%`);
          console.log(`    - Validated Amount: ${expectedValidatedDiscount}% (≤ ${maxDiscountLimit}%)`);
          console.log(`    - Applied: ${item.discountPercentage}%`);
          
          // Validate that level + dealer extra doesn't exceed max limit
          if (expectedValidatedDiscount > maxDiscountLimit) {
            console.log(`  ❌ Level + dealer extra discount validation failed: ${expectedValidatedDiscount}% > ${maxDiscountLimit}%`);
            return res.status(400).json({
              success: false,
              message: `Level-based and dealer extra discount for ${item.productName} (${expectedValidatedDiscount}%) exceeds maximum allowed limit of ${maxDiscountLimit}%. Direct discount (${directDiscount}%) is not limited.`,
              validationError: {
                type: 'LEVEL_DISCOUNT_LIMIT_EXCEEDED',
                productName: item.productName,
                levelBasedDiscount: expectedLevelDiscount,
                dealerExtraDiscount: item.dealerExtraDiscount || 0,
                directDiscount: directDiscount,
                validatedDiscount: expectedValidatedDiscount,
                maxLimit: maxDiscountLimit
              }
            });
          }
          
          // Allow small rounding differences (0.01%)
          if (Math.abs(item.discountPercentage - expectedTotalDiscount) > 0.01) {
            console.log(`  ❌ Discount calculation mismatch`);
            return res.status(400).json({
              success: false,
              message: `Discount calculation error for ${item.productName}. Expected ${expectedTotalDiscount}% but got ${item.discountPercentage}%.`
            });
          }
        }
        
        console.log(`  ✅ Discount validation passed for ${item.productName}`);
        
      } catch (discountError) {
        console.error(`  ❌ Error validating discount for ${item.productName}:`, discountError);
        return res.status(500).json({
          success: false,
          message: `Error validating discount for ${item.productName}. Please try again.`
        });
      }
    }
    
    console.log("✅ All discount validations passed, proceeding with invoice creation...");

    // Get sales order if provided
    let salesOrder = null;
    if (salesOrderId) {
      salesOrder = await SalesOrder.findById(salesOrderId);
      if (!salesOrder) {
        return res.status(404).json({
          success: false,
          message: "Sales order not found"
        });
      }
    }

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber();

    // Create invoice data
    const invoiceData = {
      invoiceNumber,
      dealer: dealerId,
      dealerName: dealer.name,
      dealerCode: dealer.code,
      dealerType: dealer.dealerType,
      region: dealer.regionId,
      pinCode: dealer.address?.split(',').pop()?.trim() || "",
      salesOrder: salesOrderId,
      salesOrderNumber: salesOrder?.orderNumber || "",
      creditDays: appropriateCreditDays, // Use the determined credit days based on sales type
      items,
      remarks,
      internalNotes,
      subtotal: subtotal || 0,
      totalDiscount: totalDiscount || 0,
      totalGst: totalGst || 0,
      totalAmount: totalAmount || 0,
      totalPoints: totalPoints || 0,
      createdBy: req.user.id
    };

    // Add customer information if provided
    if (customerInfo) {
      invoiceData.customerName = customerInfo.name || dealer.name;
      invoiceData.customerAddress = customerInfo.address || dealer.address;
      invoiceData.customerPhone = customerInfo.phone || dealer.phone;
      invoiceData.customerEmail = customerInfo.email || dealer.email;
      invoiceData.customerGST = customerInfo.gst || dealer.gst;
    }

    // Create the invoice
    const invoice = new DealerInvoice(invoiceData);
    await invoice.save();

    // Create dealer ledger entry for the invoice
    try {
      // Get the last entry for this dealer to calculate running balance
      const lastEntry = await DealerLedger.findOne(
        { dealer: dealerId },
        {},
        { sort: { 'createdAt': -1 } }
      );
      
      let previousBalance = 0;
      if (lastEntry) {
        previousBalance = lastEntry.runningBalance;
      }
      
      const ledgerEntry = new DealerLedger({
        dealer: dealerId,
        dealerName: dealer.name,
        dealerCode: dealer.code,
        entryDate: invoice.invoiceDate,
        transactionType: "Invoice",
        invoice: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceValue: invoice.totalAmount,
        // Use the determined sales type from invoice creation
        salesType: determinedSalesType,
        // Use the appropriate credit days that were calculated
        creditDaysApplied: appropriateCreditDays,
        debitAmount: invoice.totalAmount,
        creditAmount: 0,
        runningBalance: previousBalance + invoice.totalAmount,
        description: `Invoice ${invoice.invoiceNumber} (${determinedSalesType})`,
        creditDays: appropriateCreditDays,
        dueDate: invoice.dueDate,
        pointsEarned: invoice.totalPoints || 0,
        schemeAmount: invoice.totalDiscount || 0,
        createdBy: req.user.id
      });
      
      await ledgerEntry.save();
      console.log(`Created ledger entry for invoice: ${invoice.invoiceNumber}`);
    } catch (ledgerError) {
      console.error("Error creating ledger entry for invoice:", ledgerError);
      // Don't fail the invoice creation if ledger entry fails
    }

    // Create notification for dealer about invoice generation
    try {
      // Build notification message
      let message = `Invoice ${invoice.invoiceNumber} has been generated for an amount of ₹${invoice.totalAmount.toLocaleString()}.`;
      
      // Include sales order number if available
      if (salesOrder && salesOrder.orderNumber) {
        message = `Invoice ${invoice.invoiceNumber} has been generated for your purchase order ${salesOrder.orderNumber} with an amount of ₹${invoice.totalAmount.toLocaleString()}.`;
      }
      
      const title = salesOrder && salesOrder.orderNumber 
        ? `Invoice Generated for Order ${salesOrder.orderNumber}`
        : `Invoice ${invoice.invoiceNumber} Generated`;
      
      // Create notification
      await Notification.create({
        dealer: dealerId,
        type: 'system',
        title: title,
        message: message,
        orderId: salesOrderId || null,
        orderNumber: salesOrder?.orderNumber || null,
        status: null,
        read: false,
        priority: 'high',
        metadata: {
          originalType: 'invoice_created',
          invoiceId: invoice._id.toString(),
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmount: invoice.totalAmount,
          salesOrderNumber: salesOrder?.orderNumber || null
        }
      });
      
      console.log(`📧 Notification created for dealer ${dealerId} (${dealer.name}): Invoice ${invoice.invoiceNumber} generated`);
    } catch (notificationError) {
      console.error('Error creating notification for invoice:', notificationError);
      // Don't fail the invoice creation if notification fails
    }

    // Create notification for points earned if points > 0
    if (invoice.totalPoints && invoice.totalPoints > 0) {
      try {
        const pointsMessage = salesOrder && salesOrder.orderNumber
          ? `You have earned ${invoice.totalPoints} points from invoice ${invoice.invoiceNumber} for your purchase order ${salesOrder.orderNumber}.`
          : `You have earned ${invoice.totalPoints} points from invoice ${invoice.invoiceNumber}.`;
        
        await Notification.create({
          dealer: dealerId,
          type: 'system',
          title: 'Points Earned! 🎉',
          message: pointsMessage,
          orderId: salesOrderId || null,
          orderNumber: salesOrder?.orderNumber || null,
          status: null,
          read: false,
          priority: 'high',
          metadata: {
            originalType: 'points_earned',
            invoiceId: invoice._id.toString(),
            invoiceNumber: invoice.invoiceNumber,
            pointsEarned: invoice.totalPoints,
            salesOrderNumber: salesOrder?.orderNumber || null
          }
        });
        
        console.log(`🎉 Points notification created for dealer ${dealerId} (${dealer.name}): ${invoice.totalPoints} points earned from invoice ${invoice.invoiceNumber}`);
      } catch (pointsNotificationError) {
        console.error('Error creating points notification:', pointsNotificationError);
        // Don't fail the invoice creation if notification fails
      }
    }

    // Populate the created invoice
    const populatedInvoice = await DealerInvoice.findById(invoice._id)
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber")
      .populate("items.product", "itemName productCode HSNCode")
      .populate("items.warehouse", "name");

    res.status(201).json({
      success: true,
      message: "Dealer invoice created successfully",
      invoice: populatedInvoice
    });
  } catch (error) {
    console.error("Create dealer invoice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating dealer invoice"
    });
  }
};

// @desc    Update dealer invoice
// @route   PUT /api/dealer-invoices/:id
// @access  Private
export const updateDealerInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.invoiceNumber;
    delete updateData.createdBy;
    delete updateData.createdAt;

    const invoice = await DealerInvoice.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber")
      .populate("items.product", "itemName productCode HSNCode")
      .populate("items.warehouse", "name");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Dealer invoice not found"
      });
    }

    res.json({
      success: true,
      message: "Dealer invoice updated successfully",
      invoice
    });
  } catch (error) {
    console.error("Update dealer invoice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating dealer invoice"
    });
  }
};

// @desc    Update invoice status
// @route   PATCH /api/dealer-invoices/:id/status
// @access  Private
export const updateInvoiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }

    const updateData = { status };
    
    if (status === "Approved") {
      updateData.approvedBy = req.user.id;
      updateData.approvedAt = new Date();
    }

    if (remarks) {
      updateData.remarks = remarks;
    }

    const invoice = await DealerInvoice.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber")
      .populate("items.product", "itemName productCode HSNCode")
      .populate("items.warehouse", "name");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Dealer invoice not found"
      });
    }

    res.json({
      success: true,
      message: `Invoice status updated to ${status}`,
      invoice
    });
  } catch (error) {
    console.error("Update invoice status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating invoice status"
    });
  }
};

// @desc    Approve dealer invoice
// @route   PATCH /api/dealer-invoices/:id/approve
// @access  Private
export const approveInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await DealerInvoice.findById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Dealer invoice not found"
      });
    }

    // Check if already approved
    if (invoice.status === "Approved") {
      return res.status(400).json({
        success: false,
        message: "Invoice is already approved"
      });
    }

    // Update invoice to approved status
    invoice.status = "Approved";
    invoice.approvedBy = req.user.id;
    invoice.approvedAt = new Date();
    await invoice.save();

    // Populate the invoice for response
    const populatedInvoice = await DealerInvoice.findById(id)
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber")
      .populate("items.product", "itemName productCode HSNCode")
      .populate("items.warehouse", "name")
      .populate("approvedBy", "name email");

    res.json({
      success: true,
      message: "Invoice approved successfully",
      invoice: populatedInvoice
    });
  } catch (error) {
    console.error("Approve invoice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while approving invoice"
    });
  }
};

// @desc    Delete dealer invoice
// @desc    Cancel (Soft Delete) Dealer Invoice
// @route   DELETE /api/dealer-invoices/:id
// @access  Private
export const deleteDealerInvoice = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();
    
    const { reason } = req.body;
    console.log(`🗑️ Attempting to cancel invoice ${req.params.id} with reason: ${reason}`);
    
    const invoice = await DealerInvoice.findById(req.params.id).session(session);

    if (!invoice) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Dealer invoice not found"
      });
    }

    console.log(`📄 Found invoice: ${invoice.invoiceNumber}, Status: ${invoice.status}`);

    // Prevent cancellation of approved/paid invoices
    if (['Approved', 'Dispatched', 'Delivered'].includes(invoice.status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Cannot cancel approved/dispatched invoices. Please create a Credit Note instead."
      });
    }

    // Prevent cancellation if payment has been made
    if (invoice.paidAmount && invoice.paidAmount > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Cannot cancel invoice with payments. Please refund payments first."
      });
    }

    console.log(`🗑️ Cancelling invoice ${invoice.invoiceNumber}`);

    // SOFT DELETE: Mark as cancelled instead of deleting
    invoice.isDeleted = true;
    invoice.deletedAt = new Date();
    invoice.deletedBy = req.user._id;
    invoice.deletionReason = reason || 'No reason provided';
    invoice.cancellationReason = reason || 'No reason provided';
    invoice.status = 'Cancelled';
    
    await invoice.save({ session });
    console.log(`✅ Invoice marked as cancelled`);
    
    // RELEASE SALES ORDER: Set status back to "Confirmed" so new invoice can be created
    let salesOrderReleased = false;
    if (invoice.salesOrder) {
      try {
        const salesOrder = await SalesOrder.findById(invoice.salesOrder).session(session);
        
        if (salesOrder) {
          console.log(`📋 Releasing sales order ${salesOrder.orderNumber} - setting status back to Confirmed`);
          
          // Set status back to Confirmed so it can be invoiced again
          salesOrder.status = 'Confirmed';
          await salesOrder.save({ session });
          salesOrderReleased = true;
          
          console.log(`✅ Sales order ${salesOrder.orderNumber} released - can create new invoice`);
        }
      } catch (soError) {
        console.error(`⚠️ Error releasing sales order:`, soError.message);
        // Continue even if sales order release fails
      }
    }
    
    // REVERSE STOCK MOVEMENTS: Restore stock that was deducted
    let stockReversed = false;
    try {
      const stockMovements = await StockMovement.find({
        referenceNo: invoice.invoiceNumber,
        referenceType: 'INVOICE'
      }).session(session);
      
      if (stockMovements.length > 0) {
        console.log(`📦 Reversing ${stockMovements.length} stock movements`);
        
        for (const movement of stockMovements) {
          // Create reverse movement
          const reverseMovement = new StockMovement({
            productId: movement.productId,
            warehouseId: movement.warehouseId,
            type: movement.type === 'OUT' ? 'IN' : 'OUT', // Reverse the type
            quantity: movement.quantity,
            balance: 0, // Will be calculated
            referenceNo: invoice.invoiceNumber,
            referenceType: 'INVOICE_CANCELLATION',
            date: new Date(),
            remarks: `Reversal of invoice ${invoice.invoiceNumber} cancellation`,
            createdBy: req.user._id
          });
          
          // Calculate new balance
          const lastMovement = await StockMovement.findOne({
            productId: movement.productId,
            warehouseId: movement.warehouseId
          }).sort({ date: -1, createdAt: -1 }).session(session);
          
          if (lastMovement) {
            if (reverseMovement.type === 'IN') {
              reverseMovement.balance = lastMovement.balance + reverseMovement.quantity;
            } else {
              reverseMovement.balance = lastMovement.balance - reverseMovement.quantity;
            }
          } else {
            reverseMovement.balance = reverseMovement.type === 'IN' ? reverseMovement.quantity : -reverseMovement.quantity;
          }
          
          await reverseMovement.save({ session });
        }
        
        stockReversed = true;
        console.log(`✅ Stock movements reversed`);
      } else {
        console.log(`ℹ️ No stock movements found for invoice ${invoice.invoiceNumber}`);
      }
    } catch (stockError) {
      console.error(`⚠️ Error reversing stock movements:`, stockError.message);
      // Continue even if stock reversal fails
    }
    
    // REVERSE LEDGER ENTRIES: Remove dealer ledger entries
    let ledgerReversed = false;
    try {
      const ledgerEntries = await DealerLedger.find({
        invoiceNumber: invoice.invoiceNumber
      }).session(session);
      
      if (ledgerEntries.length > 0) {
        console.log(`💰 Reversing ${ledgerEntries.length} ledger entries`);
        
        for (const entry of ledgerEntries) {
          // Create reverse entry
          const reverseEntry = new DealerLedger({
            dealer: entry.dealer,
            transactionType: 'Adjustment', // Use valid enum value
            invoiceNumber: invoice.invoiceNumber,
            entryDate: new Date(),
            debitAmount: entry.creditAmount || 0, // Reverse: debit becomes credit
            creditAmount: entry.debitAmount || 0, // Reverse: credit becomes debit
            runningBalance: 0, // Will be calculated by pre-save hook
            description: `Cancellation of invoice ${invoice.invoiceNumber}`,
            remarks: `Reversal entry for cancelled invoice ${invoice.invoiceNumber}. Reason: ${reason || 'No reason provided'}`,
            createdBy: req.user._id
          });
          
          await reverseEntry.save({ session });
        }
        
        ledgerReversed = true;
        console.log(`✅ Ledger entries reversed`);
      } else {
        console.log(`ℹ️ No ledger entries found for invoice ${invoice.invoiceNumber}`);
      }
    } catch (ledgerError) {
      console.error(`⚠️ Error reversing ledger entries:`, ledgerError.message);
      // Continue even if ledger reversal fails
    }
    
    await session.commitTransaction();
    
    console.log(`✅ Invoice ${invoice.invoiceNumber} cancelled successfully`);

    res.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} cancelled successfully. Sales order released for new invoice.`,
      data: {
        invoiceNumber: invoice.invoiceNumber,
        salesOrderReleased,
        stockReversed,
        ledgerReversed
      }
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Cancel dealer invoice error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Server error while cancelling dealer invoice",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get invoice statistics
// @route   GET /api/dealer-invoices/stats/overview
// @access  Private
export const getInvoiceStats = async (req, res) => {
  try {
    const { startDate, endDate, dealerId } = req.query;

    // Build filter object
    const filter = {};
    if (dealerId) filter.dealer = dealerId;
    if (startDate || endDate) {
      filter.invoiceDate = {};
      if (startDate) filter.invoiceDate.$gte = new Date(startDate);
      if (endDate) filter.invoiceDate.$lte = new Date(endDate);
    }

    // Get statistics
    const [
      totalInvoices,
      totalAmount,
      pendingInvoices,
      approvedInvoices,
      dispatchedInvoices,
      paidInvoices,
      overdueInvoices
    ] = await Promise.all([
      DealerInvoice.countDocuments(filter),
      DealerInvoice.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } }
      ]),
      DealerInvoice.countDocuments({ ...filter, status: "Pending" }),
      DealerInvoice.countDocuments({ ...filter, status: "Approved" }),
      DealerInvoice.countDocuments({ ...filter, status: "Dispatched" }),
      DealerInvoice.countDocuments({ ...filter, paymentStatus: "Paid" }),
      DealerInvoice.countDocuments({ 
        ...filter, 
        paymentStatus: "Pending",
        dueDate: { $lt: new Date() }
      })
    ]);

    res.json({
      success: true,
      stats: {
        totalInvoices,
        totalAmount: totalAmount[0]?.total || 0,
        pendingInvoices,
        approvedInvoices,
        dispatchedInvoices,
        paidInvoices,
        overdueInvoices
      }
    });
  } catch (error) {
    console.error("Get invoice stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching invoice statistics"
    });
  }
};
