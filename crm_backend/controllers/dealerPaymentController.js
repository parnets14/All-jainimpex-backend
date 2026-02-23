import DealerPayment from "../models/DealerPayment.js";
import DealerLedger from "../models/DealerLedger.js";
import DealerInvoice from "../models/DealerInvoice.js";
import Dealer from "../models/Dealer.js";
import mongoose from "mongoose";

// @desc    Get all dealer payments
// @route   GET /api/dealer-payments
// @access  Private
export const getDealerPayments = async (req, res) => {
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

    // Get the invoice details (exclude cancelled)
    const invoice = await DealerInvoice.findOne({ 
      _id: dealerInvoiceId,
      isDeleted: { $ne: true } // Exclude cancelled invoices
    })
      .populate("dealer", "name code");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found or has been cancelled"
      });
    }

    // No approval check needed - payments can be made for any invoice status

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
      await updateInvoiceAndLedger(payment, invoice, req.user._id);
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
      
      // Update invoice payment status (exclude cancelled)
      const invoice = await DealerInvoice.findOne({
        _id: payment.dealerInvoice,
        isDeleted: { $ne: true } // Exclude cancelled invoices
      })
        .populate("dealer", "name code");
      
      if (invoice) {
        await updateInvoiceAndLedger(payment, invoice, req.user._id);
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
async function updateInvoiceAndLedger(payment, invoice, userId) {
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
  try {
    const { dealer, page = 1, limit = 50, search } = req.query;
    
    console.log('🔍 Fetching available invoices for payment, dealer:', dealer, 'page:', page, 'limit:', limit);
    
    // Show all invoices regardless of status - no approval needed for payments
    const query = {
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

