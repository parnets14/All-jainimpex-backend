import mongoose from 'mongoose';
import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { salesOrderSchema } from "../models/SalesOrder.js";
import { dealerSchema } from "../models/Dealer.js";
import { productSchema } from "../models/Product.js";
import { discountMappingSchema } from "../models/DiscountMapping.js";
import { pointsSchema } from "../models/Points.js";
import { stockMovementSchema } from "../models/Stock.js";
import { dealerLedgerSchema } from "../models/DealerLedger.js";
import { notificationSchema } from "../models/Notification.js";
import { paymentAllocationSchema } from "../models/PaymentAllocation.js";
import { dealerPaymentSchema } from "../models/DealerPayment.js";
import { voucherSchema } from "../models/Voucher.js";
import { userSchema } from "../models/User.js";
import { regionSchema } from "../models/Region.js";
import { warehouseSchema } from "../models/Warehouse.js";
import { sendPushNotification } from '../services/firebaseNotificationService.js';
import { assertPeriodOpen, handlePeriodLockError } from '../services/periodLockService.js';
import { recordUpdate, recordStatusChange, recordCancel } from '../services/auditTrailService.js';

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    SalesOrder: dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema),
    Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema),
    Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
    DiscountMapping: dbConnection.models.DiscountMapping || dbConnection.model('DiscountMapping', discountMappingSchema),
    Points: dbConnection.models.Points || dbConnection.model('Points', pointsSchema),
    StockMovement: dbConnection.models.StockMovement || dbConnection.model('StockMovement', stockMovementSchema),
    DealerLedger: dbConnection.models.DealerLedger || dbConnection.model('DealerLedger', dealerLedgerSchema),
    Notification: dbConnection.models.Notification || dbConnection.model('Notification', notificationSchema),
    PaymentAllocation: dbConnection.models.PaymentAllocation || dbConnection.model('PaymentAllocation', paymentAllocationSchema),
    DealerPayment: dbConnection.models.DealerPayment || dbConnection.model('DealerPayment', dealerPaymentSchema),
    Voucher: dbConnection.models.Voucher || dbConnection.model('Voucher', voucherSchema),
    User: dbConnection.models.User || dbConnection.model('User', userSchema),
    Region: dbConnection.models.Region || dbConnection.model('Region', regionSchema),
    Warehouse: dbConnection.models.Warehouse || dbConnection.model('Warehouse', warehouseSchema),
  };
};

// Generate unique invoice number
const generateInvoiceNumber = async (dbConnection) => {
  try {
    const { DealerInvoice } = getModels(dbConnection);
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
    // Get models from company-specific connection
    const { DealerInvoice, Dealer, SalesOrder, PaymentAllocation, DealerPayment } = getModels(req.dbConnection);
    
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
      .lean() // Convert to plain JavaScript objects for modification
      .exec();

    // Fetch payment allocations for each invoice
    for (const invoice of invoices) {
      // Get new system payment allocations
      const allocations = await PaymentAllocation.find({
        'allocations.invoiceId': invoice._id
      })
      .populate('voucherId', 'voucherNumber voucherDate voucherType transactionMode')
      .lean();
      
      // Extract relevant allocation details
      invoice.paymentAllocations = allocations.map(pa => {
        const alloc = pa.allocations.find(a => a.invoiceId.toString() === invoice._id.toString());
        return {
          allocationNumber: pa.allocationNumber,
          allocationDate: pa.allocationDate,
          voucherNumber: pa.voucherId?.voucherNumber || 'N/A',
          voucherDate: pa.voucherId?.voucherDate,
          voucherType: pa.voucherId?.voucherType || 'Receipt',
          paymentMethod: pa.voucherId?.transactionMode || 'N/A',
          allocatedAmount: alloc?.allocatedAmount || 0,
          allocationId: pa._id
        };
      });
      
      // Get old system payments (DealerPayment) for backward compatibility
      const oldPayments = await DealerPayment.find({
        dealerInvoice: invoice._id,
        status: 'Approved'
      }).lean();
      
      invoice.oldPayments = oldPayments.map(p => ({
        paymentNumber: p.paymentNumber,
        paymentDate: p.paymentDate,
        paymentMethod: p.paymentMethod,
        paymentAmount: p.paymentAmount,
        paymentType: p.paymentType,
        paymentId: p._id
      }));
    }

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
    // Get models from company-specific connection
    const { DealerInvoice } = getModels(req.dbConnection);
    
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
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);
    
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
    // Get models from company-specific connection
    const { Dealer, Product, DiscountMapping } = getModels(req.dbConnection);
    
    const { items, dealerId } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Items array is required"
      });
    }

    // Get dealer type for discount filtering
    let dealerType = null;
    if (dealerId) {
      const dealer = await Dealer.findById(dealerId).select('dealerType');
      dealerType = dealer?.dealerType || null;
    }

    const processedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId)
        .populate("brand", "name")
        .populate("category", "name")
        .populate("subcategory", "name")
        .populate("subcategory1", "name")
        .populate("subcategory2", "name");

      if (!product) {
        continue;
      }

      // Use the proper findApplicableDiscounts method from DiscountMapping
      const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
        item.productId, 'sales', dealerType, req.dbConnection
      );

      // MRP = product.mrp or unitPrice × (1 + gst/100)
      const mrpPerUnit = product.mrp || (product.unitPrice * (1 + (product.gst || 0) / 100));
      const grossAmount = item.quantity * mrpPerUnit;

      // Build discount breakdown and calculate sequentially
      let currentAmount = grossAmount;
      let totalDiscountAmount = 0;
      let directDiscountPercentage = 0;
      let appliedDiscounts = [];

      if (applicableDiscounts.length > 0) {
        const discount = applicableDiscounts[0]; // Use highest priority discount

        // 1. Apply direct discount first (sequentially)
        if (discount.directDiscountPercentage && discount.directDiscountPercentage > 0) {
          directDiscountPercentage = discount.directDiscountPercentage;
          const directAmt = currentAmount * (directDiscountPercentage / 100);
          currentAmount -= directAmt;
          totalDiscountAmount += directAmt;
        }

        // 2. Apply each level discount sequentially
        const levelBreakdown = [];
        if (discount.levels && discount.levels.length > 0) {
          for (const level of discount.levels) {
            if (level.discountPercentage > 0) {
              const levelAmt = currentAmount * (level.discountPercentage / 100);
              currentAmount -= levelAmt;
              totalDiscountAmount += levelAmt;
              levelBreakdown.push({
                levelName: level.levelName,
                discountPercentage: level.discountPercentage
              });
            }
          }
        }

        appliedDiscounts = [{
          discountId: discount._id,
          discountName: discount.discountName,
          discountValue: directDiscountPercentage,
          discountType: discount.discountType,
          directDiscountPercentage: directDiscountPercentage,
          levels: levelBreakdown,
          targetType: discount.targetType,
          maxDiscountPercentage: discount.maxDiscountPercentage
        }];
      }

      // Calculate effective discount percentage (for display)
      const effectiveDiscountPct = grossAmount > 0 
        ? parseFloat(((totalDiscountAmount / grossAmount) * 100).toFixed(2))
        : 0;

      // Final amount already includes GST (MRP based)
      const finalAmount = parseFloat(currentAmount.toFixed(2));
      
      // Reverse-calculate GST for tax display
      const gstRate = product.gst || 0;
      const gstAmount = gstRate > 0 
        ? parseFloat((finalAmount - finalAmount / (1 + gstRate / 100)).toFixed(2))
        : 0;

      // Points calculation
      let pointsEarned = 0;
      // Points logic can remain as-is or be updated later

      processedItems.push({
        product: product._id,
        productCode: product.productCode,
        productName: product.itemName,
        HSNCode: product.HSNCode,
        unit: product.unit,
        alternateUnit: product.alternateUnit,
        alternateUnitQuantity: product.alternateUnitQuantity,
        category: product.category?.name || '',
        subcategory: product.subcategory?.name || '',
        brand: product.brand?.name || '',
        quantity: item.quantity,
        unitPrice: product.unitPrice,
        mrp: mrpPerUnit,
        gst: gstRate,
        gstAmount: gstAmount,
        discountPercentage: directDiscountPercentage,
        discountAmount: parseFloat(totalDiscountAmount.toFixed(2)),
        effectiveDiscountPercentage: effectiveDiscountPct,
        appliedDiscounts,
        pointsEarned,
        totalPrice: finalAmount,
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
    // Get models from company-specific connection
    const { DealerInvoice, Dealer, Product, SalesOrder, Stock, StockMovement, DealerLedger, Points, Notification, DiscountMapping } = getModels(req.dbConnection);
    
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
      subtotal: frontendSubtotal,
      totalDiscount: frontendTotalDiscount,
      totalGst: frontendTotalGst,
      totalAmount: frontendTotalAmount,
      totalPoints
    } = req.body;
    
    // ── RECALCULATE AND VALIDATE TOTALS ──────────────────────────────────
    // All calculations are MRP-based (GST inclusive). unitPrice is just reference (base price before GST).
    // Discounts are applied sequentially on MRP. totalAmount = sum of item finals after discounts.
    // GST is reverse-calculated from the final amount for display only.
    let calculatedSubtotal = 0;
    let calculatedTotalDiscount = 0;
    let calculatedTotalGst = 0;
    let calculatedTotalAmount = 0;
    
    if (items && items.length > 0) {
      items.forEach(item => {
        const quantity = item.quantity || 0;
        // Use mrp (GST inclusive) for subtotal, NOT unitPrice (which is base price for reference only)
        const mrp = item.mrp || item.unitPrice || 0;
        const grossAmount = quantity * mrp;
        
        calculatedSubtotal += grossAmount;
        calculatedTotalDiscount += (item.discountAmount || 0);
        calculatedTotalGst += (item.gstAmount || 0);
        // totalAmount = sum of each item's final amount (MRP after sequential discounts)
        calculatedTotalAmount += (item.totalPrice || (grossAmount - (item.discountAmount || 0)));
      });
    }
    
    // Log calculation comparison
    console.log('💰 Total Calculation Comparison:');
    console.log('  Frontend:', { subtotal: frontendSubtotal, discount: frontendTotalDiscount, gst: frontendTotalGst, total: frontendTotalAmount });
    console.log('  Backend:', { subtotal: calculatedSubtotal, discount: calculatedTotalDiscount, gst: calculatedTotalGst, total: calculatedTotalAmount });
    
    // Use backend calculations (more reliable)
    // subtotal = MRP × Qty (GST inclusive gross)
    // totalDiscount = sum of sequential discount amounts
    // totalGst = reverse-calculated GST from final amounts (for display only)
    // totalAmount = subtotal - totalDiscount (since MRP already includes GST, no need to add GST back)
    const subtotal = calculatedSubtotal;
    const totalDiscount = calculatedTotalDiscount;
    const totalGst = calculatedTotalGst;
    const totalAmount = calculatedTotalAmount;
    // ── END RECALCULATION ─────────────────────────────────────────────────

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
          dealer.dealerType,
          req.dbConnection // Pass the company-specific connection
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

      // ── DUPLICATE INVOICE CHECK ──────────────────────────────────────────
      // Block creation if a non-cancelled invoice already exists for this SO
      const existingInvoice = await DealerInvoice.findOne({
        salesOrder: salesOrderId,
        status: { $nin: ['Cancelled', 'Rejected'] },
        isDeleted: { $ne: true }
      });

      if (existingInvoice) {
        const isDraft = existingInvoice.isDraft || existingInvoice.status === 'Draft';
        return res.status(400).json({
          success: false,
          message: isDraft
            ? `A draft invoice already exists for sales order ${salesOrder.orderNumber}. Please approve or delete the existing draft before creating a new one.`
            : `Invoice ${existingInvoice.invoiceNumber} already exists for sales order ${salesOrder.orderNumber}. Cannot create duplicate invoice.`,
          existingInvoiceId: existingInvoice._id,
          existingInvoiceNumber: existingInvoice.invoiceNumber || 'DRAFT',
          isDraft
        });
      }
      // ── END DUPLICATE CHECK ──────────────────────────────────────────────
    }

    // DON'T generate invoice number for drafts - will be generated on approval
    // const invoiceNumber = await generateInvoiceNumber(); // REMOVED

    // Create invoice data as DRAFT
    // NOTE: Do NOT set invoiceNumber for drafts — leaving it undefined allows
    // the sparse unique index to permit multiple drafts without conflict
    const invoiceData = {
      // invoiceNumber is intentionally omitted (undefined) for drafts
      invoiceDate: null,   // No date for drafts
      isDraft: true,       // Mark as draft
      status: "Draft",     // Set status to Draft
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
      createdBy: req.user._id
    };

    // Add customer information if provided
    if (customerInfo) {
      invoiceData.customerName = customerInfo.name || dealer.name;
      invoiceData.customerAddress = customerInfo.address || dealer.address;
      invoiceData.customerPhone = customerInfo.phone || dealer.phone;
      invoiceData.customerEmail = customerInfo.email || dealer.email;
      invoiceData.customerGST = customerInfo.gst || dealer.gst;
    }

    // Create the invoice as DRAFT
    const invoice = new DealerInvoice(invoiceData);
    await invoice.save();

    console.log(`✅ Draft invoice created: ${invoice._id} (no invoice number yet)`);

    // DON'T create dealer ledger entry for drafts - will be created on approval
    // Ledger entry creation moved to approval step
    
    /* REMOVED - Will be done on approval
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
        createdBy: req.user._id
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
      */
      
      /* REMOVED - Notifications will be sent on approval
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
    */

    // Populate the created invoice
    const populatedInvoice = await DealerInvoice.findById(invoice._id)
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber")
      .populate("items.product", "itemName productCode HSNCode")
      .populate("items.warehouse", "name");

    res.status(201).json({
      success: true,
      message: "Draft invoice created successfully. Approve to generate invoice number.",
      invoice: populatedInvoice
    });
  } catch (error) {
    console.error("Create dealer invoice error:", error);
    
    // Handle duplicate key error on invoiceNumber (null) — fix stale non-sparse index
    if (error.code === 11000 && error.keyPattern?.invoiceNumber) {
      try {
        console.log('🔧 Fixing stale invoiceNumber index (dropping non-sparse and recreating as sparse)...');
        const collection = req.dbConnection.collection('dealerinvoices');
        await collection.dropIndex('invoiceNumber_1');
        await collection.createIndex({ invoiceNumber: 1 }, { unique: true, sparse: true });
        console.log('✅ Index fixed. Please retry creating the invoice.');
        return res.status(409).json({
          success: false,
          message: "Database index was repaired. Please try creating the invoice again."
        });
      } catch (indexError) {
        console.error('Failed to fix index:', indexError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: "Server error while creating dealer invoice"
    });
  }
};

// @desc    Approve draft invoice (generate invoice number, create ledger entry)
// @route   PUT /api/dealer-invoices/:id/approve
// @access  Private
export const approveDealerInvoice = async (req, res) => {
  const session = await req.dbConnection.startSession();
  
  try {
    // Get models from company-specific connection
    const { DealerInvoice, Dealer, Product, SalesOrder, Stock, StockMovement, DealerLedger, Points, Notification } = getModels(req.dbConnection);
    
    await session.startTransaction();
    
    const invoice = await DealerInvoice.findById(req.params.id).session(session);
    
    if (!invoice) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }
    
    if (invoice.status !== "Draft") {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Only draft invoices can be approved"
      });
    }
    
    console.log(`📋 Approving draft invoice ${invoice._id}...`);

    // ── QUANTITY SYNC CHECK ──────────────────────────────────────────────────
    // If this invoice is linked to a sales order, verify quantities match.
    // If the SO was edited (partial dispatch / quantity reduction) after the
    // draft was created and the user didn't click Sync, block approval.
    if (invoice.salesOrder) {
      try {
        const linkedSO = await SalesOrder.findById(invoice.salesOrder).session(session);
        if (linkedSO) {
          const soQtyMap = {};
          (linkedSO.products || []).forEach(p => {
            const pid = (p.product?._id || p.product)?.toString();
            if (pid) soQtyMap[pid] = p.quantity;
          });

          const mismatches = [];
          for (const item of invoice.items) {
            const pid = (item.product?._id || item.product)?.toString();
            if (!pid) continue;
            if (soQtyMap[pid] === undefined) {
              // Product was removed from SO entirely (partial dispatch with qty=0)
              mismatches.push({
                productName: item.productName || pid,
                invoiceQty: item.quantity,
                salesOrderQty: 0,
                removed: true,
              });
            } else if (soQtyMap[pid] !== item.quantity) {
              mismatches.push({
                productName: item.productName || pid,
                invoiceQty: item.quantity,
                salesOrderQty: soQtyMap[pid],
              });
            }
          }

          if (mismatches.length > 0) {
            await session.abortTransaction();
            const detail = mismatches
              .map(m => `• ${m.productName}: invoice has ${m.invoiceQty}, sales order has ${m.salesOrderQty}`)
              .join('\n');
            return res.status(400).json({
              success: false,
              message: `Cannot approve — invoice quantities don't match the linked sales order (${linkedSO.orderNumber}). Please use the Sync button to update the invoice before approving.`,
              mismatches,
              detail,
            });
          }
        }
      } catch (syncCheckError) {
        console.error('⚠️ Error during quantity sync check (non-fatal):', syncCheckError);
        // Don't block approval if the check itself fails — log and continue
      }
    }
    // ── END QUANTITY SYNC CHECK ──────────────────────────────────────────────

    // Generate invoice number NOW
    invoice.invoiceNumber = await generateInvoiceNumber(req.dbConnection);
    invoice.invoiceDate = new Date();
    invoice.status = "Approved";
    invoice.isDraft = false;
    invoice.approvedBy = req.user._id;
    invoice.approvedAt = new Date();
    
    // Calculate due date based on credit days
    invoice.dueDate = new Date();
    invoice.dueDate.setDate(invoice.dueDate.getDate() + (invoice.creditDays || 30));
    
    await invoice.save({ session });
    
    console.log(`✅ Invoice number generated: ${invoice.invoiceNumber}`);
    
    // CRITICAL FIX: Remove/Reverse the sales order ledger entry to prevent double blocking
    if (invoice.salesOrder) {
      try {
        console.log(`🔄 Checking for sales order ledger entry to remove/reverse...`);
        
        const salesOrder = await SalesOrder.findById(invoice.salesOrder).session(session);
        if (salesOrder) {
          // Find the "Order Confirmed" ledger entry for this sales order
          const orderLedgerEntry = await DealerLedger.findOne({
            dealer: invoice.dealer,
            transactionType: "Order Confirmed",
            description: { $regex: salesOrder.orderNumber }
          }).session(session);
          
          if (orderLedgerEntry) {
            console.log(`✅ Found order ledger entry: ${orderLedgerEntry._id}`);
            console.log(`   Amount blocked by order: ₹${orderLedgerEntry.debitAmount.toLocaleString()}`);
            
            // Get the last entry for running balance calculation
            const lastEntry = await DealerLedger.findOne(
              { dealer: invoice.dealer },
              {},
              { sort: { 'createdAt': -1 } }
            ).session(session);
            
            let previousBalance = lastEntry ? lastEntry.runningBalance : 0;
            
            // Create REVERSE entry to unblock the order amount
            const reverseLedgerEntry = new DealerLedger({
              dealer: invoice.dealer,
              dealerName: invoice.dealerName,
              dealerCode: invoice.dealerCode,
              entryDate: invoice.invoiceDate,
              transactionType: "Order Confirmed - Reversed",
              description: `Reversed: Order ${salesOrder.orderNumber} (Invoice ${invoice.invoiceNumber} generated)`,
              remarks: `Credit unblocked - order ${salesOrder.orderNumber} converted to invoice ${invoice.invoiceNumber}. This reverses the credit block from order confirmation.`,
              debitAmount: 0,
              creditAmount: orderLedgerEntry.debitAmount, // Unblock the order amount
              runningBalance: previousBalance - orderLedgerEntry.debitAmount,
              status: "Active",
              createdBy: req.user._id
            });
            
            await reverseLedgerEntry.save({ session });
            console.log(`✅ Reversed order ledger entry - Unblocked: ₹${orderLedgerEntry.debitAmount.toLocaleString()}`);
            console.log(`   New running balance: ₹${reverseLedgerEntry.runningBalance.toLocaleString()}`);
          } else {
            console.log(`ℹ️ No order ledger entry found for ${salesOrder.orderNumber} - may not have been confirmed or already reversed`);
          }
        }
      } catch (reverseError) {
        console.error("❌ Error reversing order ledger entry:", reverseError);
        // Don't fail the transaction - log and continue
        // The invoice ledger will still be created correctly
      }
    }
    
    // NOW create ledger entry for the invoice
    try {
      const dealer = await Dealer.findById(invoice.dealer).session(session);
      
      // Check if this invoice's sales order had credit overlimit approval
      let hasOrderApproval = false;
      if (invoice.salesOrder) {
        const salesOrder = await SalesOrder.findById(invoice.salesOrder).session(session);
        if (salesOrder && salesOrder.creditOverlimit && salesOrder.creditOverlimit.isOverlimit && salesOrder.creditOverlimit.approvedBy) {
          hasOrderApproval = true;
          console.log(`✅ Sales order ${salesOrder.orderNumber} had credit overlimit approval - Skipping credit check for invoice`);
          console.log(`   Approved by: ${salesOrder.creditOverlimit.approvedBy}`);
          console.log(`   Approved at: ${salesOrder.creditOverlimit.approvedAt}`);
        }
      }
      
      // CREDIT LIMIT CHECK - Block invoice approval if credit limit exceeded
      // SKIP if sales order was already approved for overlimit
      if (!hasOrderApproval && dealer.creditLimit && dealer.creditLimit > 0) {
        console.log(`💳 Checking credit limit for dealer ${dealer.name}...`);
        
        // Get the last entry for this dealer to get current outstanding
        const lastEntry = await DealerLedger.findOne(
          { dealer: invoice.dealer },
          {},
          { sort: { 'createdAt': -1 } }
        ).session(session);
        
        const currentOutstanding = lastEntry ? lastEntry.runningBalance : 0;
        const newOutstanding = currentOutstanding + invoice.totalAmount;
        
        console.log(`💳 Credit Limit Check:`, {
          creditLimit: dealer.creditLimit,
          currentOutstanding,
          invoiceAmount: invoice.totalAmount,
          newOutstanding,
          overlimit: newOutstanding - dealer.creditLimit
        });
        
        // If credit limit exceeded, block invoice approval
        if (newOutstanding > dealer.creditLimit) {
          const overlimitAmount = newOutstanding - dealer.creditLimit;
          
          console.log(`⚠️ Credit limit exceeded by ₹${overlimitAmount.toFixed(2)}`);
          
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Cannot approve invoice - Credit limit exceeded by ₹${overlimitAmount.toLocaleString()}`,
            creditLimitInfo: {
              creditLimit: dealer.creditLimit,
              currentOutstanding,
              invoiceAmount: invoice.totalAmount,
              newOutstanding,
              overlimitAmount,
              availableCredit: dealer.creditLimit - currentOutstanding
            }
          });
        }
        
        console.log(`✅ Credit limit check passed - Available credit: ₹${(dealer.creditLimit - currentOutstanding).toLocaleString()}`);
      } else if (hasOrderApproval) {
        console.log(`⏭️ Skipping credit limit check - Sales order was pre-approved for overlimit`);
      }
      
      // Get the last entry for this dealer to calculate running balance
      const lastEntry = await DealerLedger.findOne(
        { dealer: invoice.dealer },
        {},
        { sort: { 'createdAt': -1 } }
      ).session(session);
      
      let previousBalance = 0;
      if (lastEntry) {
        previousBalance = lastEntry.runningBalance;
      }
      
      // Determine sales type from items
      let determinedSalesType = 'Regular Sale';
      const hasCDSales = invoice.items.some(item => item.salesType === 'CD Sales');
      const hasRegularSales = invoice.items.some(item => item.salesType === 'Regular Sale' || !item.salesType);
      
      if (hasCDSales && !hasRegularSales) {
        determinedSalesType = 'CD Sales';
      } else if (hasCDSales && hasRegularSales) {
        determinedSalesType = 'Mixed';
      }
      
      const ledgerEntry = new DealerLedger({
        dealer: invoice.dealer,
        dealerName: invoice.dealerName,
        dealerCode: invoice.dealerCode,
        entryDate: invoice.invoiceDate,
        transactionType: "Invoice",
        invoice: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceValue: invoice.totalAmount,
        salesType: determinedSalesType,
        creditDaysApplied: invoice.creditDays,
        debitAmount: invoice.totalAmount,
        creditAmount: 0,
        runningBalance: previousBalance + invoice.totalAmount,
        description: `Invoice ${invoice.invoiceNumber} (${determinedSalesType})`,
        creditDays: invoice.creditDays,
        dueDate: invoice.dueDate,
        pointsEarned: invoice.totalPoints || 0,
        schemeAmount: invoice.totalDiscount || 0,
        createdBy: req.user._id
      });
      
      await ledgerEntry.save({ session });
      console.log(`✅ Ledger entry created for invoice: ${invoice.invoiceNumber}`);
    } catch (ledgerError) {
      console.error("Error creating ledger entry:", ledgerError);
      throw ledgerError; // Fail the transaction if ledger creation fails
    }
    
    // NOW create notifications
    try {
      const salesOrder = invoice.salesOrder ? await SalesOrder.findById(invoice.salesOrder).session(session) : null;
      
      // Invoice generated notification
      let message = `Invoice ${invoice.invoiceNumber} has been generated for an amount of ₹${invoice.totalAmount.toLocaleString()}.`;
      if (salesOrder && salesOrder.orderNumber) {
        message = `Invoice ${invoice.invoiceNumber} has been generated for your purchase order ${salesOrder.orderNumber} with an amount of ₹${invoice.totalAmount.toLocaleString()}.`;
      }
      
      const title = salesOrder && salesOrder.orderNumber 
        ? `Invoice Generated for Order ${salesOrder.orderNumber}`
        : `Invoice ${invoice.invoiceNumber} Generated`;
      
      await Notification.create([{
        dealer: invoice.dealer,
        type: 'system',
        title: title,
        message: message,
        orderId: invoice.salesOrder || null,
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
      }], { session });
      
      console.log(`✅ Notification created for invoice: ${invoice.invoiceNumber}`);

      // Send push notification
      try {
        const dealerDoc = await Dealer.findById(invoice.dealer).select('fcmToken').lean();
        if (dealerDoc?.fcmToken) {
          await sendPushNotification({
            token: dealerDoc.fcmToken,
            title,
            body: message,
            data: { type: 'invoice', invoiceId: invoice._id.toString(), invoiceNumber: invoice.invoiceNumber },
          });
        }
      } catch (pushErr) { console.error('Push error (non-fatal):', pushErr.message); }
      
      // Points earned notification
      if (invoice.totalPoints && invoice.totalPoints > 0) {
        const pointsMessage = salesOrder && salesOrder.orderNumber
          ? `You have earned ${invoice.totalPoints} points from invoice ${invoice.invoiceNumber} for your purchase order ${salesOrder.orderNumber}.`
          : `You have earned ${invoice.totalPoints} points from invoice ${invoice.invoiceNumber}.`;
        
        await Notification.create([{
          dealer: invoice.dealer,
          type: 'system',
          title: 'Points Earned! 🎉',
          message: pointsMessage,
          orderId: invoice.salesOrder || null,
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
        }], { session });
        
        console.log(`✅ Points notification created: ${invoice.totalPoints} points`);
      }
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the transaction if notification fails
    }
    
    await session.commitTransaction();
    
    await session.commitTransaction();
    
    // Create automatic journal entry for accounting
    try {
      const { createDealerInvoiceEntry } = await import('../services/accountingService.js');
      await createDealerInvoiceEntry(invoice, req.dbConnection, req.user._id);
    } catch (accountingError) {
      console.error('⚠️ Failed to create automatic journal entry (non-critical):', accountingError.message);
      // Don't fail the invoice approval if journal entry fails
    }
    
    // Populate and return the approved invoice
    const populatedInvoice = await DealerInvoice.findById(invoice._id)
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber")
      .populate("items.product", "itemName productCode HSNCode")
      .populate("items.warehouse", "name")
      .populate("approvedBy", "name email");
    
    console.log(`🎉 Invoice approved successfully: ${invoice.invoiceNumber}`);
    
    res.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} approved successfully`,
      invoice: populatedInvoice
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Approve invoice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while approving invoice",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Update dealer invoice
// @route   PUT /api/dealer-invoices/:id
// @access  Private
export const updateDealerInvoice = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { DealerInvoice, Dealer, Product } = getModels(req.dbConnection);
    
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.invoiceNumber;
    delete updateData.createdBy;
    delete updateData.createdAt;

    // Load the current invoice for the period-lock check and audit diff
    const beforeDoc = await DealerInvoice.findById(id).lean();
    if (!beforeDoc) {
      return res.status(404).json({
        success: false,
        message: "Dealer invoice not found"
      });
    }

    // Block edits to an invoice dated in a closed financial year
    await assertPeriodOpen(req.dbConnection, beforeDoc.invoiceDate, 'dealer invoice');

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

    // Audit the field-level changes
    await recordUpdate(req.dbConnection, {
      entity: 'DealerInvoice',
      entityId: invoice._id,
      documentNumber: invoice.invoiceNumber,
      before: beforeDoc,
      after: { ...beforeDoc, ...updateData },
      fields: Object.keys(updateData),
      req,
    });

    res.json({
      success: true,
      message: "Dealer invoice updated successfully",
      invoice
    });
  } catch (error) {
    if (handlePeriodLockError(error, res)) return;
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
    // Get models from company-specific connection
    const { DealerInvoice } = getModels(req.dbConnection);
    
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
      updateData.approvedBy = req.user._id;
      updateData.approvedAt = new Date();
    }

    if (remarks) {
      updateData.remarks = remarks;
    }

    const beforeStatusDoc = await DealerInvoice.findById(id).select('status invoiceNumber').lean();

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

    await recordStatusChange(req.dbConnection, {
      entity: 'DealerInvoice',
      entityId: invoice._id,
      documentNumber: invoice.invoiceNumber,
      oldStatus: beforeStatusDoc?.status,
      newStatus: status,
      reason: remarks || '',
      req,
    });

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
    // Get models from company-specific connection
    const { DealerInvoice } = getModels(req.dbConnection);
    
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
    invoice.approvedBy = req.user._id;
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
// @desc    Delete Draft or Cancel Approved Invoice
// @route   DELETE /api/dealer-invoices/:id
// @access  Private
export const deleteDealerInvoice = async (req, res) => {
  const session = await req.dbConnection.startSession();
  
  try {
    // Get models from company-specific connection
    const { DealerInvoice, DealerLedger, PaymentAllocation, DealerPayment, Voucher, StockMovement, Points, SalesOrder } = getModels(req.dbConnection);
    
    await session.startTransaction();
    
    const { reason } = req.body;
    const invoice = await DealerInvoice.findById(req.params.id).session(session);

    if (!invoice) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }

    console.log(`📄 Invoice ${invoice._id}, Status: ${invoice.status}, Draft: ${invoice.isDraft}`);

    // Block deletion/cancellation of an invoice dated in a closed financial year
    await assertPeriodOpen(req.dbConnection, invoice.invoiceDate, 'dealer invoice cancellation');

    // CASE 1: Delete Draft Invoice (permanently delete)
    if (invoice.status === "Draft" || invoice.isDraft) {
      console.log(`🗑️ Permanently deleting draft invoice ${invoice._id}`);
      
      // Release sales order
      if (invoice.salesOrder) {
        await SalesOrder.findByIdAndUpdate(
          invoice.salesOrder,
          { status: "Confirmed" },
          { session }
        );
        console.log(`✅ Sales order ${invoice.salesOrder} released`);
      }
      
      // Permanently delete the draft
      await DealerInvoice.findByIdAndDelete(invoice._id).session(session);
      
      await session.commitTransaction();

      await recordCancel(req.dbConnection, {
        entity: 'DealerInvoice',
        entityId: invoice._id,
        documentNumber: invoice.invoiceNumber || 'DRAFT',
        req,
        reason: 'Draft invoice deleted',
      });
      
      return res.json({
        success: true,
        message: "Draft invoice deleted successfully"
      });
    }

    // CASE 2: Cancel Approved Invoice (soft delete)
    if (invoice.status === "Approved") {
      console.log(`❌ Cancelling approved invoice ${invoice.invoiceNumber}`);
      
      // Prevent cancellation if payment has been made
      if (invoice.paidAmount && invoice.paidAmount > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Cannot cancel invoice with payments. Please refund payments first."
        });
      }

      // SOFT DELETE: Mark as cancelled
      invoice.isDeleted = true;
      invoice.deletedAt = new Date();
      invoice.deletedBy = req.user._id;
      invoice.deletionReason = reason || 'No reason provided';
      invoice.cancellationReason = reason || 'No reason provided';
      invoice.status = 'Cancelled';
      
      await invoice.save({ session });
      console.log(`✅ Invoice marked as cancelled`);
      
      // RELEASE SALES ORDER
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

    await recordCancel(req.dbConnection, {
      entity: 'DealerInvoice',
      entityId: invoice._id,
      documentNumber: invoice.invoiceNumber,
      req,
      reason: reason || 'No reason provided',
    });

    return res.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} cancelled successfully. Sales order released for new invoice.`,
      data: {
        invoiceNumber: invoice.invoiceNumber,
        salesOrderReleased,
        stockReversed,
        ledgerReversed
      }
    });
    } // Close CASE 2: Cancel Approved Invoice
    
  } catch (error) {
    await session.abortTransaction();
    if (handlePeriodLockError(error, res)) return;
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
    // Get models from company-specific connection
    const { DealerInvoice } = getModels(req.dbConnection);
    
    const { startDate, endDate, dealerId } = req.query;

    // Build filter object - exclude drafts and deleted invoices
    const filter = { isDraft: { $ne: true }, isDeleted: { $ne: true } };
    if (dealerId) filter.dealer = dealerId;
    if (startDate || endDate) {
      filter.invoiceDate = {};
      if (startDate) filter.invoiceDate.$gte = new Date(startDate);
      if (endDate) filter.invoiceDate.$lte = new Date(endDate);
    }

    // Auto-update overdue status for past-due unpaid invoices
    await DealerInvoice.updateMany(
      {
        isDraft: { $ne: true },
        isDeleted: { $ne: true },
        paymentStatus: { $in: ["Pending", "Partial"] },
        dueDate: { $lt: new Date(), $exists: true, $ne: null }
      },
      { $set: { paymentStatus: "Overdue" } }
    );
    if (startDate || endDate) {
      filter.invoiceDate = {};
      if (startDate) filter.invoiceDate.$gte = new Date(startDate);
      if (endDate) filter.invoiceDate.$lte = new Date(endDate);
    }

    // Get statistics
    const [
      totalInvoices,
      totalAmount,
      outstandingResult,
      collectedResult,
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
      // Outstanding = sum of (totalAmount - paidAmount) for unpaid invoices
      DealerInvoice.aggregate([
        { $match: { ...filter, paymentStatus: { $in: ["Pending", "Partial", "Overdue"] } } },
        { $group: { _id: null, total: { $sum: { $subtract: ["$totalAmount", { $ifNull: ["$paidAmount", 0] }] } } } }
      ]),
      // Collected = sum of paidAmount across all invoices
      DealerInvoice.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$paidAmount", 0] } } } }
      ]),
      DealerInvoice.countDocuments({ ...filter, status: "Pending" }),
      DealerInvoice.countDocuments({ ...filter, status: "Approved" }),
      DealerInvoice.countDocuments({ ...filter, status: "Dispatched" }),
      DealerInvoice.countDocuments({ ...filter, paymentStatus: "Paid" }),
      // Overdue = unpaid/partially paid invoices where dueDate has passed
      // Exclude drafts and fully paid invoices
      DealerInvoice.countDocuments({ 
        ...filter,
        isDraft: { $ne: true },
        isDeleted: { $ne: true },
        paymentStatus: { $in: ["Pending", "Partial", "Overdue"] },
        dueDate: { $lt: new Date(), $exists: true, $ne: null }
      })
    ]);

    res.json({
      success: true,
      stats: {
        totalInvoices,
        totalAmount: totalAmount[0]?.total || 0,
        outstandingAmount: outstandingResult[0]?.total || 0,
        paidAmount: collectedResult[0]?.total || 0,
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
