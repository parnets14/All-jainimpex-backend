import SupplierInvoice from "../models/SupplierInvoice.js";
import SupplierLedger from "../models/SupplierLedger.js";
import GRN from "../models/GRN.js";
import Supplier from "../models/Supplier.js";
import Product from "../models/Product.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import mongoose from "mongoose";

// @desc    Get all supplier invoices
// @route   GET /api/supplier-invoices
// @access  Private
export const getSupplierInvoices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      supplier,
      startDate,
      endDate,
      paymentStatus
    } = req.query;

    // Build query object
    const query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { supplierName: { $regex: search, $options: "i" } },
        { grnNumber: { $regex: search, $options: "i" } },
        { purchaseOrderNumber: { $regex: search, $options: "i" } }
      ];
    }

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Filter by supplier
    if (supplier) {
      query.supplier = supplier;
    }

    // Filter by payment status
    if (paymentStatus && paymentStatus !== "all") {
      query.paymentStatus = paymentStatus;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const supplierInvoices = await SupplierInvoice.find(query)
      .populate("supplier", "name code gstin address phone email")
      .populate("grn", "grnNo grnDate")
      .populate("purchaseOrder", "poNumber poDate")
      .populate("items.product", "productCode itemName HSNCode")
      .populate("items.warehouse", "name")
      .populate("approvedBy", "name email")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Get total count for pagination
    const total = await SupplierInvoice.countDocuments(query);

    res.json({
      success: true,
      supplierInvoices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get Supplier Invoices Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier invoices",
      error: error.message
    });
  }
};

// @desc    Get single supplier invoice
// @route   GET /api/supplier-invoices/:id
// @access  Private
export const getSupplierInvoice = async (req, res) => {
  try {
    const supplierInvoice = await SupplierInvoice.findById(req.params.id)
      .populate("supplier")
      .populate("grn")
      .populate("purchaseOrder")
      .populate("items.product")
      .populate("items.warehouse", "name")
      .populate("approvedBy", "name email")
      .populate("createdBy", "name email");

    if (!supplierInvoice) {
      return res.status(404).json({
        success: false,
        message: "Supplier invoice not found"
      });
    }

    res.json({
      success: true,
      supplierInvoice
    });
  } catch (error) {
    console.error("Get Supplier Invoice Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier invoice",
      error: error.message
    });
  }
};

// @desc    Create new supplier invoice from GRN
// @route   POST /api/supplier-invoices
// @access  Private
export const createSupplierInvoice = async (req, res) => {
  try {
    console.log("Received request body:", req.body);
    
    const {
      grnId,
      supplierId,
      invoiceDate,
      creditDays,
      remarks,
      status,
      items, // Accept items with discount data from frontend
      subtotal,
      totalDirectDiscount,
      totalFloatingDiscount,
      totalDiscount,
      totalGst,
      totalAmount,
      grandTotal,
      purchaseDiscountSummary
    } = req.body;

    // Validate GRN exists
    const grn = await GRN.findById(grnId)
      .populate("supplierId")
      .populate("poId")
      .populate("items.productId")
      .populate("warehouseId");

    if (!grn) {
      return res.status(404).json({
        success: false,
        message: "GRN not found"
      });
    }

    // Validate supplier exists
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found"
      });
    }

    // Check if invoice already exists for this GRN
    const existingInvoice = await SupplierInvoice.findOne({ grn: grnId });
    if (existingInvoice) {
      return res.status(400).json({
        success: false,
        message: "Invoice already exists for this GRN"
      });
    }

    // Process invoice items - use data from frontend if provided, otherwise calculate from GRN
    let invoiceItems = [];
    let calculatedSubtotal = 0;
    let calculatedTotalGst = 0;

    if (items && items.length > 0) {
      // Use items with discount data from frontend
      console.log("Using items with discount data from frontend");
      invoiceItems = items.map(item => ({
        product: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        HSNCode: item.HSNCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        gst: item.gst,
        gstAmount: item.gstAmount,
        // Purchase discount information
        purchaseDiscount: item.purchaseDiscount || {
          directDiscountPercentage: 0,
          directDiscountAmount: 0,
          floatingDiscountPercentage: 0,
          floatingDiscountAmount: 0,
          totalDiscountPercentage: 0,
          totalDiscountAmount: 0,
          applicableDiscounts: []
        },
        // Legacy discount fields
        discountPercentage: item.discountPercentage || 0,
        discountAmount: item.discountAmount || 0,
        subtotal: item.subtotal,
        totalPrice: item.totalPrice,
        warehouse: item.warehouseId,
        warehouseName: item.warehouseName
      }));
      
      calculatedSubtotal = subtotal || 0;
      calculatedTotalGst = totalGst || 0;
    } else {
      // Fallback: calculate from GRN data (legacy behavior)
      console.log("Calculating from GRN data (no discount data provided)");
      for (const grnItem of grn.items) {
        const product = await Product.findById(grnItem.productId);
        if (!product) {
          return res.status(404).json({
            success: false,
            message: `Product not found: ${grnItem.productId}`
          });
        }

        const baseAmount = grnItem.acceptedQuantity * grnItem.unitPrice;
        const gstAmount = (baseAmount * grnItem.gst) / 100;
        const totalPrice = baseAmount + gstAmount;

        invoiceItems.push({
          product: grnItem.productId,
          productCode: product.productCode,
          productName: product.itemName,
          HSNCode: product.HSNCode,
          quantity: grnItem.acceptedQuantity,
          unitPrice: grnItem.unitPrice,
          gst: grnItem.gst,
          gstAmount: gstAmount,
          totalPrice: totalPrice,
          warehouse: grn.warehouseId,
          warehouseName: grn.warehouseId.name
        });

        calculatedSubtotal += baseAmount;
        calculatedTotalGst += gstAmount;
      }
    }

    const calculatedTotalAmount = grandTotal || totalAmount || (calculatedSubtotal + calculatedTotalGst);

    // Generate unique invoice number
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
    const invoiceNumber = `SI-${timestamp}`;

    // Create supplier invoice
    console.log("Creating supplier invoice with number:", invoiceNumber);
    console.log("Discount data:", {
      totalDirectDiscount: totalDirectDiscount || 0,
      totalFloatingDiscount: totalFloatingDiscount || 0,
      totalDiscount: totalDiscount || 0
    });
    
    const supplierInvoice = new SupplierInvoice({
      invoiceNumber: invoiceNumber,
      supplier: supplierId,
      supplierName: supplier.name,
      supplierCode: supplier.code,
      supplierGSTIN: supplier.gstin || "",
      supplierAddress: supplier.address,
      supplierPhone: supplier.phone,
      supplierEmail: supplier.email || "",
      grn: grnId,
      grnNumber: grn.grnNo,
      purchaseOrder: grn.poId,
      purchaseOrderNumber: grn.poId?.poNumber || "",
      invoiceDate: invoiceDate || new Date(),
      creditDays: parseInt(creditDays) || 30,
      items: invoiceItems,
      subtotal: calculatedSubtotal,
      // Purchase discount fields
      totalDirectDiscount: totalDirectDiscount || 0,
      totalFloatingDiscount: totalFloatingDiscount || 0,
      totalDiscount: totalDiscount || 0,
      totalGst: calculatedTotalGst,
      totalAmount: calculatedTotalAmount,
      grandTotal: calculatedTotalAmount,
      // Purchase discount summary
      purchaseDiscountSummary: purchaseDiscountSummary || {
        directDiscountApplied: (totalDirectDiscount || 0) > 0,
        floatingDiscountApplied: (totalFloatingDiscount || 0) > 0,
        totalSavings: totalDiscount || 0,
        savingsPercentage: calculatedSubtotal > 0 ? (((totalDiscount || 0) / calculatedSubtotal) * 100) : 0
      },
      status: status || "Draft",
      remarks: remarks || "",
      createdBy: req.user._id
    });

    // Save supplier invoice
    await supplierInvoice.save();

    // Mark GRN as invoiced to prevent further editing
    await GRN.findByIdAndUpdate(grnId, {
      isInvoiceCreated: true,
      supplierInvoiceId: supplierInvoice._id,
      invoiceCreatedAt: new Date(),
      status: 'Completed' // Mark GRN as completed once invoice is created
    });

    console.log(`GRN ${grn.grnNo} marked as invoiced and locked for editing`);

    // Create supplier ledger entry for the invoice
    try {
      // Get the last entry for this supplier to calculate running balance
      const lastEntry = await SupplierLedger.findOne(
        { supplier: supplierId },
        {},
        { sort: { 'createdAt': -1 } }
      );
      
      let previousBalance = 0;
      if (lastEntry) {
        previousBalance = lastEntry.runningBalance;
      }
      
      const ledgerEntry = new SupplierLedger({
        supplier: supplierId,
        supplierName: supplier.name,
        supplierCode: supplier.code,
        entryDate: supplierInvoice.invoiceDate,
        transactionType: "Invoice",
        invoice: supplierInvoice._id,
        invoiceNumber: supplierInvoice.invoiceNumber,
        invoiceValue: supplierInvoice.totalAmount,
        debitAmount: supplierInvoice.totalAmount,
        creditAmount: 0,
        runningBalance: previousBalance + supplierInvoice.totalAmount,
        description: `Invoice ${supplierInvoice.invoiceNumber}`,
        creditDays: supplierInvoice.creditDays || 0,
        dueDate: supplierInvoice.dueDate,
        createdBy: req.user._id
      });
      
      await ledgerEntry.save();
      console.log(`Created supplier ledger entry for invoice: ${supplierInvoice.invoiceNumber}`);
    } catch (ledgerError) {
      console.error("Error creating supplier ledger entry for invoice:", ledgerError);
      // Don't fail the invoice creation if ledger entry fails
    }

    // Populate the created invoice for response
    const populatedInvoice = await SupplierInvoice.findById(supplierInvoice._id)
      .populate("supplier")
      .populate("grn")
      .populate("purchaseOrder")
      .populate("items.product")
      .populate("items.warehouse", "name")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Supplier invoice created successfully",
      supplierInvoice: populatedInvoice
    });
  } catch (error) {
    console.error("Create Supplier Invoice Error:", error);
    
    // Handle duplicate invoice number error
    if (error.code === 11000) {
      console.error("Duplicate key error:", error.keyPattern, error.keyValue);
      return res.status(400).json({
        success: false,
        message: "Invoice number already exists or duplicate key error",
        error: error.message
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      console.error("Validation errors:", error.errors);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating supplier invoice",
      error: error.message
    });
  }
};

// @desc    Update supplier invoice
// @route   PUT /api/supplier-invoices/:id
// @access  Private
export const updateSupplierInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the supplier invoice
    const supplierInvoice = await SupplierInvoice.findById(id);
    if (!supplierInvoice) {
      return res.status(404).json({
        success: false,
        message: "Supplier invoice not found"
      });
    }

    // Allow editing of draft and pending invoices
    if (!["Draft", "Pending"].includes(supplierInvoice.status)) {
      return res.status(400).json({
        success: false,
        message: "Can only edit draft or pending invoices"
      });
    }

    // Validate status transitions
    const { status, paymentStatus } = req.body;
    if (status) {
      const validTransitions = {
        "Draft": ["Pending", "Cancelled"],
        "Pending": ["Approved", "Paid", "Cancelled"],
        "Approved": ["Paid", "Cancelled"],
        "Paid": [], // Cannot change from paid
        "Cancelled": [] // Cannot change from cancelled
      };
      
      if (validTransitions[supplierInvoice.status] && !validTransitions[supplierInvoice.status].includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change status from ${supplierInvoice.status} to ${status}`
        });
      }
    }

    // Update the supplier invoice
    const updatedInvoice = await SupplierInvoice.findByIdAndUpdate(
      id,
      req.body,
      { 
        new: true, 
        runValidators: true 
      }
    )
      .populate("supplier")
      .populate("grn")
      .populate("purchaseOrder")
      .populate("items.product")
      .populate("items.warehouse", "name")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: "Supplier invoice updated successfully",
      supplierInvoice: updatedInvoice
    });
  } catch (error) {
    console.error("Update Supplier Invoice Error:", error);
    
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
      message: "Error updating supplier invoice",
      error: error.message
    });
  }
};

// @desc    Update supplier invoice status
// @route   PATCH /api/supplier-invoices/:id/status
// @access  Private
export const updateSupplierInvoiceStatus = async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const { id } = req.params;

    // Find the supplier invoice
    const supplierInvoice = await SupplierInvoice.findById(id);
    if (!supplierInvoice) {
      return res.status(404).json({
        success: false,
        message: "Supplier invoice not found"
      });
    }

    // Validate status transition
    const allowedStatuses = ["Pending", "Approved", "Paid", "Cancelled"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status update"
      });
    }

    // Update status and remarks
    supplierInvoice.status = status;
    if (remarks) {
      supplierInvoice.remarks = remarks;
    }

    // Set approval info if status is Approved
    if (status === "Approved") {
      supplierInvoice.approvedBy = req.user._id;
      supplierInvoice.approvedAt = new Date();
    }

    // Set payment date if status is Paid
    if (status === "Paid") {
      supplierInvoice.paymentDate = new Date();
      supplierInvoice.paymentStatus = "Paid";
    }

    await supplierInvoice.save();

    // Populate updated invoice for response
    const updatedInvoice = await SupplierInvoice.findById(id)
      .populate("supplier")
      .populate("grn")
      .populate("purchaseOrder")
      .populate("items.product")
      .populate("items.warehouse", "name")
      .populate("approvedBy", "name email")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: `Invoice ${status.toLowerCase()} successfully`,
      supplierInvoice: updatedInvoice
    });
  } catch (error) {
    console.error("Update Supplier Invoice Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating supplier invoice status",
      error: error.message
    });
  }
};

// @desc    Delete supplier invoice
// @route   DELETE /api/supplier-invoices/:id
// @access  Private
export const deleteSupplierInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the supplier invoice
    const supplierInvoice = await SupplierInvoice.findById(id);
    if (!supplierInvoice) {
      return res.status(404).json({
        success: false,
        message: "Supplier invoice not found"
      });
    }

    // Only allow deletion of draft invoices
    if (supplierInvoice.status !== "Draft") {
      return res.status(400).json({
        success: false,
        message: "Can only delete draft invoices"
      });
    }

    // Unlock the GRN if it was locked by this invoice
    if (supplierInvoice.grn) {
      await GRN.findByIdAndUpdate(supplierInvoice.grn, {
        isInvoiceCreated: false,
        supplierInvoiceId: null,
        invoiceCreatedAt: null,
        status: 'Received' // Reset to Received status
      });
      console.log(`GRN unlocked after deleting draft invoice ${supplierInvoice.invoiceNumber}`);
    }

    // Delete the supplier invoice
    await SupplierInvoice.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Supplier invoice deleted successfully"
    });
  } catch (error) {
    console.error("Delete Supplier Invoice Error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting supplier invoice",
      error: error.message
    });
  }
};

// @desc    Get GRNs available for invoice creation
// @route   GET /api/supplier-invoices/available-grns
// @access  Private
export const getAvailableGRNs = async (req, res) => {
  try {
    const { supplier } = req.query;

    console.log('🔍 === GET AVAILABLE GRNs DEBUG ===');
    console.log('📥 Request params:', { supplier });
    
    // First, let's see ALL GRNs in the database
    const allGRNs = await GRN.find({}).select('grnNo status isInvoiceCreated supplierId').lean();
    console.log(`📊 Total GRNs in database: ${allGRNs.length}`);
    if (allGRNs.length > 0) {
      console.log('📋 All GRNs status breakdown:');
      allGRNs.forEach(grn => {
        console.log(`   - ${grn.grnNo}: status="${grn.status}", isInvoiceCreated=${grn.isInvoiceCreated}, supplierId=${grn.supplierId}`);
      });
    } else {
      console.log('⚠️ No GRNs found in database at all!');
    }

    // Build query for GRNs that don't have invoices yet
    // ONLY allow "Received" and "Partially Received" GRNs for invoice creation
    const query = { 
      status: { $in: ["Received", "Partially Received"] },
      // Match GRNs where isInvoiceCreated is false OR doesn't exist (undefined)
      $or: [
        { isInvoiceCreated: false },
        { isInvoiceCreated: { $exists: false } }
      ]
    };
    if (supplier) {
      query.supplierId = supplier;
      console.log(`🔍 Filtering by supplier: ${supplier}`);
    }

    console.log('🔍 Query:', JSON.stringify(query));

    // Get GRNs that don't have invoices
    const grns = await GRN.find(query)
      .populate("supplierId", "name code")
      .populate("poId", "poNumber")
      .populate("items.productId", "productCode itemName")
      .populate("warehouseId", "name")
      .sort({ createdAt: -1 })
      .lean();

    console.log(`📦 Found ${grns.length} GRNs matching query`);

    // Filter out GRNs that already have invoices (double-check)
    const availableGRNs = [];
    for (const grn of grns) {
      const existingInvoice = await SupplierInvoice.findOne({ grn: grn._id });
      if (!existingInvoice) {
        availableGRNs.push(grn);
        console.log(`✅ Available: ${grn.grnNo}`);
      } else {
        console.log(`⏭️ Skipping GRN ${grn.grnNo} - already has invoice ${existingInvoice.invoiceNumber}`);
      }
    }

    console.log(`✅ Returning ${availableGRNs.length} available GRNs`);
    console.log('🔍 === END DEBUG ===');

    res.json({
      success: true,
      grns: availableGRNs
    });
  } catch (error) {
    console.error("❌ Get Available GRNs Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching available GRNs",
      error: error.message
    });
  }
};

// @desc    Get supplier invoice statistics
// @route   GET /api/supplier-invoices/stats/summary
// @access  Private
export const getSupplierInvoiceStats = async (req, res) => {
  try {
    const { startDate, endDate, supplier, status } = req.query;

    // Build match query for filters
    const matchQuery = {};
    
    if (startDate || endDate) {
      matchQuery.invoiceDate = {};
      if (startDate) matchQuery.invoiceDate.$gte = new Date(startDate);
      if (endDate) matchQuery.invoiceDate.$lte = new Date(endDate);
    }
    
    if (supplier) matchQuery.supplier = supplier;
    if (status) matchQuery.status = status;

    // Get overall statistics
    const stats = await SupplierInvoice.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          totalValue: { $sum: "$totalAmount" },
          draftInvoices: {
            $sum: { $cond: [{ $eq: ["$status", "Draft"] }, 1, 0] }
          },
          pendingInvoices: {
            $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] }
          },
          approvedInvoices: {
            $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] }
          },
          paidInvoices: {
            $sum: { $cond: [{ $eq: ["$status", "Paid"] }, 1, 0] }
          },
          cancelledInvoices: {
            $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] }
          },
          totalItems: { $sum: { $sum: "$items.quantity" } }
        }
      }
    ]);

    // Get status-wise statistics
    const statusStats = await SupplierInvoice.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalValue: { $sum: "$totalAmount" },
          avgInvoiceValue: { $avg: "$totalAmount" },
          minInvoiceValue: { $min: "$totalAmount" },
          maxInvoiceValue: { $max: "$totalAmount" }
        }
      }
    ]);

    // Get monthly trends
    const monthlyTrends = await SupplierInvoice.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            year: { $year: "$invoiceDate" },
            month: { $month: "$invoiceDate" }
          },
          invoiceCount: { $sum: 1 },
          totalValue: { $sum: "$totalAmount" },
          avgInvoiceValue: { $avg: "$totalAmount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      { $limit: 12 }
    ]);

    // Get top suppliers
    const topSuppliers = await SupplierInvoice.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$supplier",
          supplierName: { $first: "$supplierName" },
          invoiceCount: { $sum: 1 },
          totalValue: { $sum: "$totalAmount" },
          avgInvoiceValue: { $avg: "$totalAmount" }
        }
      },
      { $sort: { totalValue: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      stats: stats[0] || {
        totalInvoices: 0,
        totalValue: 0,
        draftInvoices: 0,
        pendingInvoices: 0,
        approvedInvoices: 0,
        paidInvoices: 0,
        cancelledInvoices: 0,
        totalItems: 0
      },
      statusStats,
      monthlyTrends,
      topSuppliers
    });
  } catch (error) {
    console.error("Get Supplier Invoice Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier invoice statistics",
      error: error.message
    });
  }
};
