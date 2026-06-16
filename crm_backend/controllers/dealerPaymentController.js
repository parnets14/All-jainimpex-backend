import { dealerPaymentSchema } from "../models/DealerPayment.js";
import { dealerLedgerSchema } from "../models/DealerLedger.js";
import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { dealerSchema } from "../models/Dealer.js";
import { assertPeriodOpen, handlePeriodLockError } from "../services/periodLockService.js";
import mongoose from "mongoose";

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    DealerPayment: dbConnection.models.DealerPayment || dbConnection.model('DealerPayment', dealerPaymentSchema),
    DealerLedger: dbConnection.models.DealerLedger || dbConnection.model('DealerLedger', dealerLedgerSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema)
  };
};

// @desc    Get all dealer payments
// @route   GET /api/dealer-payments
// @access  Private
export const getDealerPayments = async (req, res) => {
  const { DealerPayment, Dealer } = getModels(req.dbConnection);
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      dealer,
      dealerInvoice, // Add this parameter
      startDate,
      endDate,
      paymentMethod,
      source // App or Web
    } = req.query;

    // Build query object
    const query = {};

    // Search functionality
    let searchQuery = {};
    if (search) {
      // First, try to find dealers that match the search term
      const matchingDealers = await Dealer.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
          { companyName: { $regex: search, $options: "i" } }
        ]
      }).select('_id');
      
      const dealerIds = matchingDealers.map(d => d._id);
      
      // Build search query
      searchQuery = {
        $or: [
          { paymentNumber: { $regex: search, $options: "i" } },
          { invoiceNumber: { $regex: search, $options: "i" } },
          ...(dealerIds.length > 0 ? [{ dealer: { $in: dealerIds } }] : [])
        ]
      };
    }
    
    // Combine search query with other filters
    const finalQuery = { ...query };
    
    // If we have a search query, merge it properly
    if (search && searchQuery.$or) {
      finalQuery.$or = searchQuery.$or;
    }

    // Filter by status
    if (status && status !== "all") {
      finalQuery.status = status;
    }

    // Filter by dealer
    if (dealer) {
      finalQuery.dealer = dealer;
    }

    // Filter by dealer invoice - THIS IS THE FIX
    if (dealerInvoice) {
      finalQuery.dealerInvoice = dealerInvoice;
    }

    // Filter by payment method
    if (paymentMethod && paymentMethod !== "all") {
      finalQuery.paymentMethod = paymentMethod;
    }

    // Filter by source (App or Web)
    if (source && source !== "all") {
      finalQuery.source = source;
    }

    // Date range filter
    if (startDate || endDate) {
      finalQuery.paymentDate = {};
      if (startDate) {
        finalQuery.paymentDate.$gte = new Date(startDate);
      }
      if (endDate) {
        finalQuery.paymentDate.$lte = new Date(endDate);
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalCount = await DealerPayment.countDocuments(finalQuery);
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    // Fetch payments with pagination
    const payments = await DealerPayment.find(finalQuery)
      .populate("dealer", "name code companyName")
      .populate("dealerInvoice", "invoiceNumber totalAmount paymentStatus")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("rejectedBy", "name email")
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalRecords: totalCount,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get Dealer Payments Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer payments",
      error: error.message
    });
  }
};

// @desc    Get single dealer payment
// @route   GET /api/dealer-payments/:id
// @access  Private
export const getDealerPayment = async (req, res) => {
  const { DealerPayment } = getModels(req.dbConnection);
  try {
    const payment = await DealerPayment.findById(req.params.id)
      .populate("dealer", "name code companyName gst phone email address")
      .populate("dealerInvoice", "invoiceNumber totalAmount paymentStatus invoiceDate dueDate")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("rejectedBy", "name email");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error("Get Dealer Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer payment",
      error: error.message
    });
  }
};

// @desc    Create new dealer payment
// @route   POST /api/dealer-payments
// @access  Private
export const createDealerPayment = async (req, res) => {
  const { DealerPayment, DealerInvoice } = getModels(req.dbConnection);
  try {
    const {
      dealerInvoiceId,
      paymentAmount,
      paymentMethod,
      paymentType,
      paymentDate,
      remarks,
      chequeDetails,
      upiDetails,
      bankTransferDetails,
      source = "Web" // Default to Web, can be "App" from mobile
    } = req.body;

    // Get the invoice details (exclude drafts and cancelled)
    const invoice = await DealerInvoice.findOne({ 
      _id: dealerInvoiceId,
      isDraft: false, // Exclude draft invoices
      isDeleted: { $ne: true } // Exclude cancelled invoices
    })
      .populate("dealer", "name code");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found, is a draft, or has been cancelled"
      });
    }

    // No approval check needed - payments can be made for any invoice status

    // Block posting into a closed financial year
    await assertPeriodOpen(req.dbConnection, paymentDate || Date.now(), 'dealer payment');

    // Calculate remaining amount
    const paidAmount = invoice.paidAmount || 0;
    const remainingAmount = invoice.totalAmount - paidAmount;

    // Validate payment amount
    if (paymentAmount > remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed remaining amount of ₹${remainingAmount.toLocaleString()}`
      });
    }

    // Create payment data
    const paymentData = {
      dealerInvoice: dealerInvoiceId,
      dealer: invoice.dealer._id,
      paymentDate: new Date(paymentDate || Date.now()),
      paymentAmount: parseFloat(paymentAmount),
      paymentMethod,
      paymentType,
      status: source === "App" ? "Approved" : "Pending", // Auto-approve app payments, web needs approval
      remarks: remarks || "",
      invoiceNumber: invoice.invoiceNumber,
      invoiceAmount: invoice.totalAmount,
      remainingAmount: remainingAmount - parseFloat(paymentAmount),
      source: source,
      createdBy: req.user._id
    };

    // Add method-specific details
    if (paymentMethod === "Cheque" && chequeDetails) {
      paymentData.chequeDetails = {
        chequeNo: chequeDetails.chequeNo,
        bankName: chequeDetails.bankName,
        chequeDate: new Date(chequeDetails.chequeDate),
        remarks: chequeDetails.remarks || ""
      };
    } else if (paymentMethod === "UPI" && upiDetails) {
      paymentData.upiDetails = {
        upiId: upiDetails.upiId,
        transactionId: upiDetails.transactionId,
        remarks: upiDetails.remarks || ""
      };
    } else if (paymentMethod === "Bank Transfer" && bankTransferDetails) {
      paymentData.bankTransferDetails = {
        bankName: bankTransferDetails.bankName,
        accountNumber: bankTransferDetails.accountNumber,
        transactionId: bankTransferDetails.transactionId,
        remarks: bankTransferDetails.remarks || ""
      };
    }

    const payment = new DealerPayment(paymentData);
    await payment.save();

    // If payment is from App (auto-approved), update invoice and ledger immediately
    if (source === "App" && payment.status === "Approved") {
      await updateInvoiceAndLedger(payment, invoice, req.user._id, req.dbConnection);
    }

    // Populate the created payment
    const populatedPayment = await DealerPayment.findById(payment._id)
      .populate("dealer", "name code companyName")
      .populate("dealerInvoice", "invoiceNumber totalAmount")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Payment created successfully",
      payment: populatedPayment
    });
  } catch (error) {
    if (handlePeriodLockError(error, res)) return;
    console.error("Create Dealer Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating dealer payment",
      error: error.message
    });
  }
};

// @desc    Update dealer payment status
// @route   PUT /api/dealer-payments/:id/status
// @access  Private
export const updateDealerPaymentStatus = async (req, res) => {
  const { DealerPayment, DealerInvoice } = getModels(req.dbConnection);
  try {
    const { status, rejectionReason } = req.body;
    const paymentId = req.params.id;

    const payment = await DealerPayment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    // Update payment status
    payment.status = status;
    
    if (status === "Approved") {
      payment.approvedBy = req.user._id;
      payment.approvedAt = new Date();
      
      // Update invoice payment status (exclude drafts and cancelled)
      const invoice = await DealerInvoice.findOne({
        _id: payment.dealerInvoice,
        isDraft: false, // Exclude draft invoices
        isDeleted: { $ne: true } // Exclude cancelled invoices
      })
        .populate("dealer", "name code");
      
      if (invoice) {
        await updateInvoiceAndLedger(payment, invoice, req.user._id, req.dbConnection);
      }
      
      // Create automatic journal entry for accounting
      try {
        const { createDealerPaymentEntry } = await import('../services/accountingService.js');
        const paymentData = {
          _id: payment._id,
          paymentNumber: payment.paymentNumber || `PAY-${payment._id.toString().slice(-8)}`,
          amount: payment.paymentAmount,
          paymentDate: payment.paymentDate,
          paymentMode: payment.paymentMethod,
          dealerName: invoice?.dealer?.name || 'Dealer'
        };
        await createDealerPaymentEntry(paymentData, req.dbConnection, req.user._id);
      } catch (accountingError) {
        console.error('⚠️ Failed to create automatic journal entry (non-critical):', accountingError.message);
        // Don't fail the payment approval if journal entry fails
      }
    } else if (status === "Rejected") {
      payment.rejectedBy = req.user._id;
      payment.rejectedAt = new Date();
      payment.rejectionReason = rejectionReason || "";
    }

    await payment.save();

    // Populate the updated payment
    const updatedPayment = await DealerPayment.findById(paymentId)
      .populate("dealer", "name code companyName")
      .populate("dealerInvoice", "invoiceNumber totalAmount paymentStatus")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("rejectedBy", "name email");

    res.json({
      success: true,
      message: `Payment ${status.toLowerCase()} successfully`,
      payment: updatedPayment
    });
  } catch (error) {
    console.error("Update Dealer Payment Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating payment status",
      error: error.message
    });
  }
};

// Helper function to update invoice and create ledger entry
async function updateInvoiceAndLedger(payment, invoice, userId, dbConnection) {
  const { DealerLedger } = getModels(dbConnection);
  try {
    // Calculate new paid amount
    const paidAmount = (invoice.paidAmount || 0) + payment.paymentAmount;
    invoice.paidAmount = paidAmount;
    
    // Update payment status based on remaining amount
    // Use a small tolerance (0.01 rupee = 1 paisa) to handle floating-point precision issues
    const remainingAmount = invoice.totalAmount - paidAmount;
    const TOLERANCE = 0.01; // 1 paisa tolerance
    
    if (remainingAmount <= TOLERANCE) {
      invoice.paymentStatus = "Paid";
      // Set paidAmount to exactly totalAmount to avoid tiny differences
      invoice.paidAmount = invoice.totalAmount;
    } else {
      invoice.paymentStatus = "Partial";
    }
    
    await invoice.save();
    
    // Create dealer ledger entry for the payment
    try {
      // Get the last entry for this dealer to calculate running balance
      const lastEntry = await DealerLedger.findOne(
        { dealer: payment.dealer },
        {},
        { sort: { 'createdAt': -1 } }
      );
      
      let previousBalance = 0;
      if (lastEntry) {
        previousBalance = lastEntry.runningBalance;
      }
      
      const ledgerEntry = new DealerLedger({
        dealer: payment.dealer,
        dealerName: invoice.dealer.name,
        dealerCode: invoice.dealer.code,
        entryDate: payment.paymentDate,
        transactionType: "Payment",
        invoice: payment.dealerInvoice,
        invoiceNumber: payment.invoiceNumber,
        invoiceValue: payment.invoiceAmount,
        paymentReceived: payment.paymentAmount,
        paymentMethod: payment.paymentMethod,
        chequeDetails: payment.chequeDetails,
        upiDetails: payment.upiDetails,
        bankTransferDetails: payment.bankTransferDetails,
        debitAmount: 0,
        creditAmount: payment.paymentAmount,
        runningBalance: previousBalance - payment.paymentAmount,
        description: `Payment ${payment.paymentNumber} for Invoice ${payment.invoiceNumber}`,
        remarks: payment.remarks,
        createdBy: userId
      });
      
      await ledgerEntry.save();
      console.log(`Created dealer ledger entry for payment: ${payment.paymentNumber}`);
    } catch (ledgerError) {
      console.error("Error creating dealer ledger entry for payment:", ledgerError);
      // Don't fail the payment approval if ledger entry fails
    }
  } catch (error) {
    console.error("Error updating invoice and ledger:", error);
    throw error;
  }
}

// @desc    Get available invoices for payment
// @route   GET /api/dealer-payments/available-invoices
// @access  Private
export const getAvailableInvoicesForPayment = async (req, res) => {
  const { DealerInvoice } = getModels(req.dbConnection);
  try {
    const { dealer, page = 1, limit = 50, search } = req.query;
    
    console.log('🔍 Fetching available invoices for payment, dealer:', dealer, 'page:', page, 'limit:', limit);
    
    // Show all approved invoices - no drafts
    const query = {
      isDraft: false, // Exclude draft invoices
      isDeleted: { $ne: true } // Exclude cancelled invoices
    };
    
    if (dealer) {
      query.dealer = dealer;
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { dealerName: { $regex: search, $options: 'i' } },
        { dealerCode: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 50;
    const skip = (pageNumber - 1) * limitNumber;

    // First, get all invoices matching the query (any status)
    const allInvoices = await DealerInvoice.find(query)
      .populate("dealer", "name code")
      .populate("salesOrder", "salesOrderNumber")
      .populate("items.product", "itemName productCode")
      .sort({ invoiceDate: -1 })
      .lean();

    console.log(`📊 Found ${allInvoices.length} total invoices for dealer ${dealer}`);

    // Filter invoices that are not fully paid and calculate remaining amount
    const availableInvoices = allInvoices.map((invoice) => {
      const paidAmount = invoice.paidAmount || 0;
      const remainingAmount = invoice.totalAmount - paidAmount;
      
      return {
        ...invoice,
        paidAmount,
        remainingAmount
      };
    });

    // Filter only invoices with remaining amount > 0
    const filteredInvoices = availableInvoices.filter(inv => inv.remainingAmount > 0);

    console.log(`📊 Found ${filteredInvoices.length} invoices with remaining amount > 0`);

    // Apply pagination to filtered results
    const totalItems = filteredInvoices.length;
    const paginatedInvoices = filteredInvoices.slice(skip, skip + limitNumber);
    const totalPages = Math.ceil(totalItems / limitNumber);

    console.log(`✅ Returning ${paginatedInvoices.length} invoices (page ${pageNumber} of ${totalPages})`);

    res.json({
      success: true,
      invoices: paginatedInvoices,
      pagination: {
        currentPage: pageNumber,
        totalPages: totalPages,
        totalItems: totalItems,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1
      }
    });
  } catch (error) {
    console.error("Get Available Invoices for Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching available invoices for payment",
      error: error.message
    });
  }
};

// @desc    Get payment statistics
// @route   GET /api/dealer-payments/stats
// @access  Private
export const getDealerPaymentStats = async (req, res) => {
  const { DealerPayment } = getModels(req.dbConnection);
  try {
    const stats = await DealerPayment.aggregate([
      {
        $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: "$paymentAmount" },
          pendingPayments: {
            $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] }
          },
          approvedPayments: {
            $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] }
          },
          rejectedPayments: {
            $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] }
          },
          pendingAmount: {
            $sum: { $cond: [{ $eq: ["$status", "Pending"] }, "$paymentAmount", 0] }
          },
          approvedAmount: {
            $sum: { $cond: [{ $eq: ["$status", "Approved"] }, "$paymentAmount", 0] }
          },
          appPayments: {
            $sum: { $cond: [{ $eq: ["$source", "App"] }, 1, 0] }
          },
          webPayments: {
            $sum: { $cond: [{ $eq: ["$source", "Web"] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalPayments: 0,
      totalAmount: 0,
      pendingPayments: 0,
      approvedPayments: 0,
      rejectedPayments: 0,
      pendingAmount: 0,
      approvedAmount: 0,
      appPayments: 0,
      webPayments: 0
    };

    res.json({
      success: true,
      stats: result
    });
  } catch (error) {
    console.error("Get Dealer Payment Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payment statistics",
      error: error.message
    });
  }
};

// @desc    Delete dealer payment
// @route   DELETE /api/dealer-payments/:id
// @access  Private
export const deleteDealerPayment = async (req, res) => {
  const { DealerPayment } = getModels(req.dbConnection);
  try {
    const payment = await DealerPayment.findById(req.params.id);
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    // Only allow deletion of pending payments
    if (payment.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Can only delete pending payments"
      });
    }

    await DealerPayment.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Payment deleted successfully"
    });
  } catch (error) {
    console.error("Delete Dealer Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting dealer payment",
      error: error.message
    });
  }
};


// @desc    Record advance payment (without invoice)
// @route   POST /api/dealer-payments/advance
// @access  Private
export const recordAdvancePayment = async (req, res) => {
  const { DealerPayment, Dealer } = getModels(req.dbConnection);
  try {
    const {
      dealerId,
      paymentAmount,
      paymentMethod,
      paymentDate,
      remarks,
      chequeDetails,
      upiDetails,
      bankTransferDetails,
      source = "Web"
    } = req.body;

    // Validate required fields
    if (!dealerId || !paymentAmount || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Dealer ID, payment amount, and payment method are required"
      });
    }

    // Get dealer details
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    // Block posting into a closed financial year
    await assertPeriodOpen(req.dbConnection, paymentDate || Date.now(), 'advance payment');

    // Create advance payment data
    const paymentData = {
      dealer: dealerId,
      paymentDate: new Date(paymentDate || Date.now()),
      paymentAmount: parseFloat(paymentAmount),
      paymentMethod,
      paymentType: "Full",
      paymentCategory: "Advance Payment",
      status: source === "App" ? "Approved" : "Pending",
      remarks: remarks || "",
      invoiceNumber: "ADVANCE",
      invoiceAmount: 0,
      remainingAmount: 0,
      source: source,
      advanceDetails: {
        isAdvance: true,
        advanceAmount: parseFloat(paymentAmount),
        adjustedAmount: 0,
        remainingAdvance: parseFloat(paymentAmount),
        adjustedAgainstInvoices: []
      },
      createdBy: req.user._id
    };

    // Add method-specific details
    if (paymentMethod === "Cheque" && chequeDetails) {
      paymentData.chequeDetails = {
        chequeNo: chequeDetails.chequeNo,
        bankName: chequeDetails.bankName,
        chequeDate: new Date(chequeDetails.chequeDate),
        remarks: chequeDetails.remarks || ""
      };
    } else if (paymentMethod === "UPI" && upiDetails) {
      paymentData.upiDetails = {
        upiId: upiDetails.upiId,
        transactionId: upiDetails.transactionId,
        remarks: upiDetails.remarks || ""
      };
    } else if (paymentMethod === "Bank Transfer" && bankTransferDetails) {
      paymentData.bankTransferDetails = {
        bankName: bankTransferDetails.bankName,
        accountNumber: bankTransferDetails.accountNumber,
        transactionId: bankTransferDetails.transactionId,
        remarks: bankTransferDetails.remarks || ""
      };
    }

    const payment = new DealerPayment(paymentData);
    await payment.save();

    // If payment is from App (auto-approved), update dealer and ledger immediately
    if (source === "App" && payment.status === "Approved") {
      await processAdvancePayment(payment, dealer, req.user._id, req.dbConnection);
    }

    // Populate the created payment
    const populatedPayment = await DealerPayment.findById(payment._id)
      .populate("dealer", "name code companyName")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Advance payment recorded successfully",
      payment: populatedPayment
    });
  } catch (error) {
    if (handlePeriodLockError(error, res)) return;
    console.error("Record Advance Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Error recording advance payment",
      error: error.message
    });
  }
};

// Helper function to process advance payment (update dealer and create ledger entry)
async function processAdvancePayment(payment, dealer, userId, dbConnection) {
  const { Dealer, DealerLedger } = getModels(dbConnection);
  try {
    // Update dealer's advance balance
    await Dealer.findByIdAndUpdate(dealer._id, {
      $inc: { advanceBalance: payment.paymentAmount },
      $push: {
        advancePayments: {
          payment: payment._id,
          amount: payment.paymentAmount,
          date: payment.paymentDate,
          adjustedAmount: 0,
          remainingAmount: payment.paymentAmount
        }
      }
    });

    // Create ledger entry for advance payment
    const lastEntry = await DealerLedger.findOne(
      { dealer: dealer._id },
      {},
      { sort: { 'createdAt': -1 } }
    );
    
    let previousBalance = 0;
    if (lastEntry) {
      previousBalance = lastEntry.runningBalance;
    }
    
    const ledgerEntry = new DealerLedger({
      dealer: dealer._id,
      dealerName: dealer.name,
      dealerCode: dealer.code,
      entryDate: payment.paymentDate,
      transactionType: "Advance Payment",
      paymentReceived: payment.paymentAmount,
      paymentMethod: payment.paymentMethod,
      chequeDetails: payment.chequeDetails,
      upiDetails: payment.upiDetails,
      bankTransferDetails: payment.bankTransferDetails,
      debitAmount: 0,
      creditAmount: payment.paymentAmount,
      runningBalance: previousBalance - payment.paymentAmount,
      description: `Advance payment ${payment.paymentNumber}`,
      remarks: payment.remarks,
      advanceDetails: {
        isAdvance: true,
        advancePaymentId: payment._id
      },
      createdBy: userId
    });
    
    await ledgerEntry.save();
    console.log(`Created advance payment ledger entry: ${payment.paymentNumber}`);
  } catch (error) {
    console.error("Error processing advance payment:", error);
    throw error;
  }
}

// @desc    Adjust advance payment against invoice
// @route   POST /api/dealer-payments/adjust-advance
// @access  Private
export const adjustAdvanceAgainstInvoice = async (req, res) => {
  const { DealerInvoice, DealerPayment, Dealer, DealerLedger } = getModels(req.dbConnection);
  try {
    const { invoiceId, advancePaymentId, adjustmentAmount } = req.body;

    // Validate required fields
    if (!invoiceId || !advancePaymentId || !adjustmentAmount) {
      return res.status(400).json({
        success: false,
        message: "Invoice ID, advance payment ID, and adjustment amount are required"
      });
    }

    // Get invoice
    const invoice = await DealerInvoice.findOne({
      _id: invoiceId,
      isDraft: false,
      isDeleted: { $ne: true }
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found or is a draft/cancelled"
      });
    }

    // Get advance payment
    const advancePayment = await DealerPayment.findOne({
      _id: advancePaymentId,
      paymentCategory: "Advance Payment",
      status: "Approved"
    });

    if (!advancePayment) {
      return res.status(404).json({
        success: false,
        message: "Advance payment not found or not approved"
      });
    }

    // Validate adjustment amount
    const remainingAdvance = advancePayment.advanceDetails.remainingAdvance || 0;
    if (adjustmentAmount > remainingAdvance) {
      return res.status(400).json({
        success: false,
        message: `Adjustment amount (₹${adjustmentAmount}) exceeds remaining advance (₹${remainingAdvance})`
      });
    }

    const invoiceBalance = invoice.totalAmount - (invoice.paidAmount || 0);
    if (adjustmentAmount > invoiceBalance) {
      return res.status(400).json({
        success: false,
        message: `Adjustment amount (₹${adjustmentAmount}) exceeds invoice balance (₹${invoiceBalance})`
      });
    }

    // Update advance payment
    advancePayment.advanceDetails.adjustedAmount += adjustmentAmount;
    advancePayment.advanceDetails.remainingAdvance -= adjustmentAmount;
    advancePayment.advanceDetails.adjustedAgainstInvoices.push({
      invoice: invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      adjustedAmount: adjustmentAmount,
      adjustedDate: new Date()
    });
    await advancePayment.save();

    // Update invoice
    invoice.paidAmount = (invoice.paidAmount || 0) + adjustmentAmount;
    const TOLERANCE = 0.01;
    const newRemainingAmount = invoice.totalAmount - invoice.paidAmount;
    
    if (newRemainingAmount <= TOLERANCE) {
      invoice.paymentStatus = "Paid";
      invoice.paidAmount = invoice.totalAmount;
    } else {
      invoice.paymentStatus = "Partial";
    }
    await invoice.save();

    // Update dealer's advance balance
    await Dealer.findByIdAndUpdate(invoice.dealer, {
      $inc: { advanceBalance: -adjustmentAmount }
    });

    // Create ledger entry for adjustment
    const lastEntry = await DealerLedger.findOne(
      { dealer: invoice.dealer },
      {},
      { sort: { 'createdAt': -1 } }
    );
    
    let previousBalance = 0;
    if (lastEntry) {
      previousBalance = lastEntry.runningBalance;
    }
    
    const ledgerEntry = new DealerLedger({
      dealer: invoice.dealer,
      dealerName: invoice.dealerName,
      dealerCode: invoice.dealerCode,
      entryDate: new Date(),
      transactionType: "Advance Adjustment",
      invoice: invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceValue: invoice.totalAmount,
      paymentReceived: adjustmentAmount,
      debitAmount: adjustmentAmount,
      creditAmount: 0,
      runningBalance: previousBalance - adjustmentAmount,
      description: `Advance adjusted against ${invoice.invoiceNumber}`,
      remarks: `Advance payment ${advancePayment.paymentNumber} adjusted`,
      advanceDetails: {
        isAdvance: false,
        advancePaymentId: advancePaymentId,
        adjustedInvoiceId: invoiceId
      },
      createdBy: req.user._id
    });
    
    await ledgerEntry.save();

    res.json({
      success: true,
      message: "Advance adjusted successfully",
      data: {
        adjustedAmount: adjustmentAmount,
        remainingAdvance: advancePayment.advanceDetails.remainingAdvance,
        invoicePaymentStatus: invoice.paymentStatus,
        invoiceRemainingAmount: invoice.totalAmount - invoice.paidAmount
      }
    });
  } catch (error) {
    console.error("Adjust Advance Error:", error);
    res.status(500).json({
      success: false,
      message: "Error adjusting advance payment",
      error: error.message
    });
  }
};

// @desc    Get dealer's advance balance
// @route   GET /api/dealers/:id/advance-balance
// @access  Private
export const getDealerAdvanceBalance = async (req, res) => {
  const { Dealer, DealerPayment } = getModels(req.dbConnection);
  try {
    const dealer = await Dealer.findById(req.params.id)
      .select('name code advanceBalance advancePayments')
      .populate('advancePayments.payment', 'paymentNumber paymentAmount paymentDate advanceDetails');

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    // Get all advance payments with remaining balance
    const advancePayments = await DealerPayment.find({
      dealer: req.params.id,
      paymentCategory: "Advance Payment",
      status: "Approved",
      'advanceDetails.remainingAdvance': { $gt: 0 }
    }).sort({ paymentDate: -1 });

    res.json({
      success: true,
      data: {
        dealerName: dealer.name,
        dealerCode: dealer.code,
        advanceBalance: dealer.advanceBalance || 0,
        advancePayments: advancePayments.map(payment => ({
          _id: payment._id,
          paymentNumber: payment.paymentNumber,
          paymentDate: payment.paymentDate,
          totalAmount: payment.advanceDetails.advanceAmount,
          adjustedAmount: payment.advanceDetails.adjustedAmount,
          remainingAmount: payment.advanceDetails.remainingAdvance,
          paymentMethod: payment.paymentMethod
        }))
      }
    });
  } catch (error) {
    console.error("Get Dealer Advance Balance Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer advance balance",
      error: error.message
    });
  }
};

// @desc    Get overdue invoices for dealer
// @route   GET /api/dealer-invoices/overdue/:dealerId
// @access  Private
export const getOverdueInvoices = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueInvoices = await DealerInvoice.find({
      dealer: req.params.dealerId,
      isDraft: false,
      isDeleted: { $ne: true },
      paymentStatus: { $in: ["Pending", "Partial"] },
      dueDate: { $lt: today }
    })
      .populate("dealer", "name code")
      .populate("salesOrder", "orderNumber")
      .sort({ dueDate: 1 });

    const invoicesWithDetails = overdueInvoices.map(invoice => {
      const daysOverdue = Math.floor((today - invoice.dueDate) / (1000 * 60 * 60 * 24));
      const outstandingAmount = invoice.totalAmount - (invoice.paidAmount || 0);
      
      return {
        ...invoice.toObject(),
        daysOverdue,
        outstandingAmount
      };
    });

    res.json({
      success: true,
      count: invoicesWithDetails.length,
      overdueInvoices: invoicesWithDetails
    });
  } catch (error) {
    console.error("Get Overdue Invoices Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching overdue invoices",
      error: error.message
    });
  }
};

// Update the existing updateDealerPaymentStatus to handle advance payments
const originalUpdateDealerPaymentStatus = updateDealerPaymentStatus;
export const updateDealerPaymentStatusWithAdvance = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const paymentId = req.params.id;

    const payment = await DealerPayment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    // Update payment status
    payment.status = status;
    
    if (status === "Approved") {
      payment.approvedBy = req.user._id;
      payment.approvedAt = new Date();
      
      // Handle advance payment approval
      if (payment.paymentCategory === "Advance Payment") {
        const dealer = await Dealer.findById(payment.dealer);
        await processAdvancePayment(payment, dealer, req.user._id);
      } else {
        // Handle regular invoice payment approval
        const invoice = await DealerInvoice.findOne({
          _id: payment.dealerInvoice,
          isDraft: false,
          isDeleted: { $ne: true }
        }).populate("dealer", "name code");
        
        if (invoice) {
          await updateInvoiceAndLedger(payment, invoice, req.user._id);
        }
      }
    } else if (status === "Rejected") {
      payment.rejectedBy = req.user._id;
      payment.rejectedAt = new Date();
      payment.rejectionReason = rejectionReason || "";
    }

    await payment.save();

    // Populate the updated payment
    const updatedPayment = await DealerPayment.findById(paymentId)
      .populate("dealer", "name code companyName")
      .populate("dealerInvoice", "invoiceNumber totalAmount paymentStatus")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("rejectedBy", "name email");

    res.json({
      success: true,
      message: `Payment ${status.toLowerCase()} successfully`,
      payment: updatedPayment
    });
  } catch (error) {
    console.error("Update Dealer Payment Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating payment status",
      error: error.message
    });
  }
};
