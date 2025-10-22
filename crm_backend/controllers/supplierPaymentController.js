import SupplierPayment from "../models/SupplierPayment.js";
import SupplierLedger from "../models/SupplierLedger.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import Supplier from "../models/Supplier.js";
import mongoose from "mongoose";

// @desc    Get all supplier payments
// @route   GET /api/supplier-payments
// @access  Private
export const getSupplierPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      supplier,
      startDate,
      endDate,
      paymentMethod
    } = req.query;

    // Build query object
    const query = {};

    // Search functionality
    let searchQuery = {};
    if (search) {
      // First, try to find suppliers that match the search term
      const Supplier = mongoose.model('Supplier');
      const matchingSuppliers = await Supplier.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
          { companyName: { $regex: search, $options: "i" } }
        ]
      }).select('_id');
      
      const supplierIds = matchingSuppliers.map(s => s._id);
      
      // Build search query
      searchQuery = {
        $or: [
          { paymentNumber: { $regex: search, $options: "i" } },
          { invoiceNumber: { $regex: search, $options: "i" } },
          ...(supplierIds.length > 0 ? [{ supplier: { $in: supplierIds } }] : [])
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

    // Filter by supplier
    if (supplier) {
      finalQuery.supplier = supplier;
    }

    // Filter by payment method
    if (paymentMethod && paymentMethod !== "all") {
      finalQuery.paymentMethod = paymentMethod;
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
    const totalCount = await SupplierPayment.countDocuments(finalQuery);
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    // Fetch payments with pagination
    const payments = await SupplierPayment.find(finalQuery)
      .populate("supplier", "name code companyName")
      .populate("supplierInvoice", "invoiceNumber totalAmount paymentStatus")
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
    console.error("Get Supplier Payments Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier payments",
      error: error.message
    });
  }
};

// @desc    Get single supplier payment
// @route   GET /api/supplier-payments/:id
// @access  Private
export const getSupplierPayment = async (req, res) => {
  try {
    const payment = await SupplierPayment.findById(req.params.id)
      .populate("supplier", "name code companyName gstin phone email address")
      .populate("supplierInvoice", "invoiceNumber totalAmount paymentStatus invoiceDate dueDate")
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
    console.error("Get Supplier Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier payment",
      error: error.message
    });
  }
};

// @desc    Create new supplier payment
// @route   POST /api/supplier-payments
// @access  Private
export const createSupplierPayment = async (req, res) => {
  try {
    const {
      supplierInvoiceId,
      paymentAmount,
      paymentMethod,
      paymentType,
      paymentDate,
      remarks,
      chequeDetails,
      upiDetails,
      bankTransferDetails
    } = req.body;

    // Get the invoice details
    const invoice = await SupplierInvoice.findById(supplierInvoiceId)
      .populate("supplier", "name code companyName");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }

    // Check if invoice is approved
    if (invoice.status !== "Approved") {
      return res.status(400).json({
        success: false,
        message: "Can only create payments for approved invoices"
      });
    }

    // Calculate remaining amount
    const remainingAmount = invoice.totalAmount - (invoice.paidAmount || 0);

    // Validate payment amount
    if (paymentAmount > remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed remaining amount of ₹${remainingAmount.toLocaleString()}`
      });
    }

    // Create payment data
    const paymentData = {
      supplierInvoice: supplierInvoiceId,
      supplier: invoice.supplier._id,
      paymentDate: new Date(paymentDate),
      paymentAmount: parseFloat(paymentAmount),
      paymentMethod,
      paymentType,
      status: "Pending",
      remarks: remarks || "",
      invoiceNumber: invoice.invoiceNumber,
      invoiceAmount: invoice.totalAmount,
      remainingAmount: remainingAmount - parseFloat(paymentAmount),
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

    // Generate payment number if not provided
    if (!paymentData.paymentNumber) {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      
      // Find the last payment of today
      const lastPayment = await SupplierPayment.findOne({
        paymentNumber: { $regex: `^SP-${dateStr}-` }
      }).sort({ paymentNumber: -1 });
      
      let sequence = 1;
      if (lastPayment) {
        const lastSequence = parseInt(lastPayment.paymentNumber.split('-')[2]);
        sequence = lastSequence + 1;
      }
      
      paymentData.paymentNumber = `SP-${dateStr}-${sequence.toString().padStart(3, '0')}`;
    }

    console.log("Creating payment with data:", paymentData);
    const payment = new SupplierPayment(paymentData);
    await payment.save();

    // Populate the created payment
    const populatedPayment = await SupplierPayment.findById(payment._id)
      .populate("supplier", "name code companyName")
      .populate("supplierInvoice", "invoiceNumber totalAmount")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Payment created successfully",
      payment: populatedPayment
    });
  } catch (error) {
    console.error("Create Supplier Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating supplier payment",
      error: error.message
    });
  }
};

// @desc    Update supplier payment status
// @route   PUT /api/supplier-payments/:id/status
// @access  Private
export const updateSupplierPaymentStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const paymentId = req.params.id;

    const payment = await SupplierPayment.findById(paymentId);
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
      
      // Update invoice payment status
      const invoice = await SupplierInvoice.findById(payment.supplierInvoice);
      if (invoice) {
        const newPaidAmount = (invoice.paidAmount || 0) + payment.paymentAmount;
        invoice.paidAmount = newPaidAmount;
        
        // Update payment status based on remaining amount
        if (newPaidAmount >= invoice.totalAmount) {
          invoice.paymentStatus = "Paid";
        } else {
          invoice.paymentStatus = "Partial";
        }
        
        await invoice.save();
        
        // Create supplier ledger entry for the payment
        try {
          // Get the last entry for this supplier to calculate running balance
          const lastEntry = await SupplierLedger.findOne(
            { supplier: payment.supplier },
            {},
            { sort: { 'createdAt': -1 } }
          );
          
          let previousBalance = 0;
          if (lastEntry) {
            previousBalance = lastEntry.runningBalance;
          }
          
          const ledgerEntry = new SupplierLedger({
            supplier: payment.supplier,
            supplierName: invoice.supplier.name,
            supplierCode: invoice.supplier.code,
            entryDate: payment.paymentDate,
            transactionType: "Payment",
            invoice: payment.supplierInvoice,
            invoiceNumber: payment.invoiceNumber,
            invoiceValue: payment.invoiceAmount,
            paymentMade: payment.paymentAmount,
            paymentMethod: payment.paymentMethod,
            chequeDetails: payment.chequeDetails,
            upiDetails: payment.upiDetails,
            bankTransferDetails: payment.bankTransferDetails,
            debitAmount: 0,
            creditAmount: payment.paymentAmount,
            runningBalance: previousBalance - payment.paymentAmount,
            description: `Payment ${payment.paymentNumber} for Invoice ${payment.invoiceNumber}`,
            remarks: payment.remarks,
            createdBy: req.user._id
          });
          
          await ledgerEntry.save();
          console.log(`Created supplier ledger entry for payment: ${payment.paymentNumber}`);
        } catch (ledgerError) {
          console.error("Error creating supplier ledger entry for payment:", ledgerError);
          // Don't fail the payment approval if ledger entry fails
        }
      }
    } else if (status === "Rejected") {
      payment.rejectedBy = req.user._id;
      payment.rejectedAt = new Date();
      payment.rejectionReason = rejectionReason || "";
    }

    await payment.save();

    // Populate the updated payment
    const updatedPayment = await SupplierPayment.findById(paymentId)
      .populate("supplier", "name code companyName")
      .populate("supplierInvoice", "invoiceNumber totalAmount paymentStatus")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("rejectedBy", "name email");

    res.json({
      success: true,
      message: `Payment ${status.toLowerCase()} successfully`,
      payment: updatedPayment
    });
  } catch (error) {
    console.error("Update Supplier Payment Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating payment status",
      error: error.message
    });
  }
};

// @desc    Get available invoices for payment
// @route   GET /api/supplier-payments/available-invoices
// @access  Private
export const getAvailableInvoicesForPayment = async (req, res) => {
  try {
    const { supplier } = req.query;
    
    const query = { 
      status: "Approved" // Only approved invoices can have payments
    };
    
    if (supplier) {
      query.supplier = supplier;
    }

    const invoices = await SupplierInvoice.find(query)
      .populate("supplier", "name code")
      .populate("grn", "grnNo")
      .populate("items.product", "productCode itemName")
      .sort({ invoiceDate: -1 })
      .lean();

    // Filter invoices that are not fully paid
    const availableInvoices = invoices.filter(invoice => {
      const paidAmount = invoice.paidAmount || 0;
      return paidAmount < invoice.totalAmount;
    });

    res.json({
      success: true,
      invoices: availableInvoices
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
// @route   GET /api/supplier-payments/stats
// @access  Private
export const getSupplierPaymentStats = async (req, res) => {
  try {
    const stats = await SupplierPayment.aggregate([
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
      approvedAmount: 0
    };

    res.json({
      success: true,
      stats: result
    });
  } catch (error) {
    console.error("Get Supplier Payment Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payment statistics",
      error: error.message
    });
  }
};

// @desc    Delete supplier payment
// @route   DELETE /api/supplier-payments/:id
// @access  Private
export const deleteSupplierPayment = async (req, res) => {
  try {
    const payment = await SupplierPayment.findById(req.params.id);
    
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

    await SupplierPayment.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Payment deleted successfully"
    });
  } catch (error) {
    console.error("Delete Supplier Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting supplier payment",
      error: error.message
    });
  }
};
