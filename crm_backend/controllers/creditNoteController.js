import { creditNoteSchema } from "../models/CreditNote.js";
import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { dealerSchema } from "../models/Dealer.js";
import { dealerLedgerSchema } from "../models/DealerLedger.js";
import { assertPeriodOpen, handlePeriodLockError } from "../services/periodLockService.js";

const getModels = (dbConnection) => {
  return {
    CreditNote: dbConnection.models.CreditNote || dbConnection.model('CreditNote', creditNoteSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema),
    DealerLedger: dbConnection.models.DealerLedger || dbConnection.model('DealerLedger', dealerLedgerSchema)
  };
};

// Create Credit Note
export const createCreditNote = async (req, res) => {
  try {
    const { CreditNote, DealerInvoice, DealerLedger } = getModels(req.dbConnection);
    const {
      originalInvoiceId,
      creditAmount,
      creditReason,
      status = "Pending",
      remarks,
      internalNotes,
      paymentMethod,
      chequeDetails,
      upiDetails,
      bankTransferDetails,
      chequeRecord
    } = req.body;

    // Validate original invoice exists
    const originalInvoice = await DealerInvoice.findById(originalInvoiceId)
      .populate('dealer', 'name code')
      .populate('items.product', 'itemName productCode');

    if (!originalInvoice) {
      return res.status(404).json({
        success: false,
        message: "Original invoice not found"
      });
    }

    // Block posting into a closed financial year
    await assertPeriodOpen(req.dbConnection, req.body.creditNoteDate || Date.now(), 'credit note');

    // Credit notes are for returns/adjustments only, not payments
    // Payment method is optional - only needed if credit note involves a refund
    // If payment method is provided, validate it
    if (paymentMethod) {
      const validPaymentMethods = ["Cash", "UPI", "Cheque", "Bank Transfer"];
      if (!validPaymentMethods.includes(paymentMethod)) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment method"
        });
      }

      // Validate payment method specific details only if payment method is provided
      if (paymentMethod === "Cheque" && !chequeDetails?.chequeNo) {
        return res.status(400).json({
          success: false,
          message: "Cheque number is required when payment method is Cheque"
        });
      }

      if (paymentMethod === "UPI" && !upiDetails?.upiId) {
        return res.status(400).json({
          success: false,
          message: "UPI ID is required when payment method is UPI"
        });
      }

      if (paymentMethod === "Bank Transfer" && !bankTransferDetails?.transactionId) {
        return res.status(400).json({
          success: false,
          message: "Transaction ID is required when payment method is Bank Transfer"
        });
      }
    }

    // Check if credit amount is valid
    if (creditAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Credit amount must be greater than 0"
      });
    }

    // Calculate remaining amount after this credit
    const existingCredits = await CreditNote.find({ 
      originalInvoice: originalInvoiceId,
      status: { $in: ["Pending", "Approved", "Partial"] }
    });
    
    const totalCreditedAmount = existingCredits.reduce((sum, credit) => sum + credit.creditAmount, 0);
    const remainingAmount = originalInvoice.totalAmount - totalCreditedAmount;

    if (creditAmount > remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `Credit amount cannot exceed remaining amount of ₹${remainingAmount.toLocaleString()}`
      });
    }

    // Create credit note
    const creditNoteData = {
      originalInvoice: originalInvoiceId,
      originalInvoiceNumber: originalInvoice.invoiceNumber,
      dealer: originalInvoice.dealer._id,
      dealerName: originalInvoice.dealer.name,
      dealerCode: originalInvoice.dealer.code,
      creditAmount,
      creditReason,
      status,
      originalInvoiceAmount: originalInvoice.totalAmount,
      remainingAmount: remainingAmount - creditAmount,
      remarks: remarks || '',
      internalNotes: internalNotes || '',
      paymentMethod,
      chequeDetails: paymentMethod === "Cheque" ? chequeDetails : undefined,
      upiDetails: paymentMethod === "UPI" ? upiDetails : undefined,
      bankTransferDetails: paymentMethod === "Bank Transfer" ? bankTransferDetails : undefined,
      chequeRecord: paymentMethod === "Cheque" && chequeRecord ? chequeRecord : undefined,
      createdBy: req.user._id
    };

    const creditNote = new CreditNote(creditNoteData);
    
    try {
      await creditNote.save();
    } catch (saveError) {
      // Handle duplicate key error for credit note number
      if (saveError.code === 11000 && saveError.keyPattern?.creditNoteNumber) {
        console.error("Duplicate credit note number detected, retrying...");
        // Retry with a different number
        creditNote.creditNoteNumber = `CN-${Date.now().toString().slice(-6)}`;
        await creditNote.save();
      } else {
        throw saveError;
      }
    }

    // Create dealer ledger entry for the credit note
    try {
      // Get the last entry for this dealer to calculate running balance
      const lastEntry = await DealerLedger.findOne(
        { dealer: originalInvoice.dealer._id },
        {},
        { sort: { 'createdAt': -1 } }
      );
      
      let previousBalance = 0;
      if (lastEntry) {
        previousBalance = lastEntry.runningBalance;
      }
      
      const ledgerEntry = new DealerLedger({
        dealer: originalInvoice.dealer._id,
        dealerName: originalInvoice.dealer.name,
        dealerCode: originalInvoice.dealer.code,
        entryDate: creditNote.creditNoteDate,
        transactionType: "Credit Note",
        creditNote: creditNote._id,
        creditNoteNumber: creditNote.creditNoteNumber,
        creditAmount: creditNote.creditAmount,
        debitAmount: 0,
        runningBalance: previousBalance - creditNote.creditAmount,
        description: `Credit Note ${creditNote.creditNoteNumber} - ${creditNote.creditReason}`,
        remarks: creditNote.creditReason,
        // Payment method details only if provided (for refunds)
        paymentMethod: creditNote.paymentMethod || undefined,
        chequeDetails: creditNote.chequeDetails || undefined,
        upiDetails: creditNote.upiDetails || undefined,
        bankTransferDetails: creditNote.bankTransferDetails || undefined,
        createdBy: req.user._id
      });
      
      await ledgerEntry.save();
      console.log(`Created ledger entry for credit note: ${creditNote.creditNoteNumber}`);
    } catch (ledgerError) {
      console.error("Error creating ledger entry for credit note:", ledgerError);
      // Don't fail the credit note creation if ledger entry fails
    }

    // Populate the response
    const populatedCreditNote = await CreditNote.findById(creditNote._id)
      .populate('originalInvoice', 'invoiceNumber invoiceDate totalAmount')
      .populate('dealer', 'name code phone email address')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Credit note created successfully",
      creditNote: populatedCreditNote
    });

  } catch (error) {
    if (handlePeriodLockError(error, res)) return;
    console.error("Error creating credit note:", error);
    res.status(500).json({
      success: false,
      message: "Error creating credit note",
      error: error.message
    });
  }
};

// Get All Credit Notes
export const getAllCreditNotes = async (req, res) => {
  try {
    const { CreditNote } = getModels(req.dbConnection);
    const {
      page = 1,
      limit = 10,
      status,
      dealerId,
      fromDate,
      toDate,
      search
    } = req.query;
    
    console.log("🔍 Backend received query params:", req.query);
    console.log("🔍 Parsed params:", { page, limit, status, dealerId, fromDate, toDate, search });

    // Build filter object
    const filter = {};
    
    if (status) {
      filter.status = status;
    }
    
    if (dealerId) {
      filter.dealer = dealerId;
    }
    
    if (fromDate || toDate) {
      filter.creditNoteDate = {};
      if (fromDate) filter.creditNoteDate.$gte = new Date(fromDate);
      if (toDate) filter.creditNoteDate.$lte = new Date(toDate);
    }
    
    if (search) {
      filter.$or = [
        { creditNoteNumber: { $regex: search, $options: 'i' } },
        { originalInvoiceNumber: { $regex: search, $options: 'i' } },
        { dealerName: { $regex: search, $options: 'i' } },
        { creditReason: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    
    const creditNotes = await CreditNote.find(filter)
      .populate('originalInvoice', 'invoiceNumber invoiceDate totalAmount')
      .populate('dealer', 'name code phone email address')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await CreditNote.countDocuments(filter);
    
    const paginationData = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
      hasPrevPage: parseInt(page) > 1
    };
    
    console.log("🔢 Pagination calculation:", {
      total,
      limit: parseInt(limit),
      page: parseInt(page),
      totalPages: paginationData.totalPages,
      calculation: `${total} / ${parseInt(limit)} = ${total / parseInt(limit)} -> ceil = ${Math.ceil(total / parseInt(limit))}`
    });

    res.json({
      success: true,
      creditNotes,
      pagination: paginationData
    });

  } catch (error) {
    console.error("Error fetching credit notes:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching credit notes",
      error: error.message
    });
  }
};

// Get Credit Note by ID
export const getCreditNoteById = async (req, res) => {
  try {
    const { CreditNote } = getModels(req.dbConnection);
    const { id } = req.params;

    const creditNote = await CreditNote.findById(id)
      .populate('originalInvoice', 'invoiceNumber invoiceDate totalAmount items')
      .populate('dealer', 'name code phone email address gst')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    if (!creditNote) {
      return res.status(404).json({
        success: false,
        message: "Credit note not found"
      });
    }

    res.json({
      success: true,
      creditNote
    });

  } catch (error) {
    console.error("Error fetching credit note:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching credit note",
      error: error.message
    });
  }
};

// Update Credit Note
export const updateCreditNote = async (req, res) => {
  try {
    const { CreditNote } = getModels(req.dbConnection);
    const { id } = req.params;
    const {
      creditAmount,
      creditReason,
      status,
      remarks,
      internalNotes,
      rejectionReason,
      paymentMethod,
      chequeDetails,
      upiDetails,
      bankTransferDetails,
      chequeRecord
    } = req.body;

    const creditNote = await CreditNote.findById(id);
    if (!creditNote) {
      return res.status(404).json({
        success: false,
        message: "Credit note not found"
      });
    }

    // If status is being changed to Approved or Rejected, set approval info
    if (status && status !== creditNote.status && (status === "Approved" || status === "Rejected")) {
      creditNote.approvedBy = req.user._id;
      creditNote.approvedAt = new Date();
      
      if (status === "Rejected" && rejectionReason) {
        creditNote.rejectionReason = rejectionReason;
      }
    }

    // Update fields
    if (creditAmount !== undefined) creditNote.creditAmount = creditAmount;
    if (creditReason !== undefined) creditNote.creditReason = creditReason;
    if (status !== undefined) creditNote.status = status;
    if (remarks !== undefined) creditNote.remarks = remarks;
    if (internalNotes !== undefined) creditNote.internalNotes = internalNotes;
    if (paymentMethod !== undefined) creditNote.paymentMethod = paymentMethod;
    if (chequeDetails !== undefined) creditNote.chequeDetails = chequeDetails;
    if (upiDetails !== undefined) creditNote.upiDetails = upiDetails;
    if (bankTransferDetails !== undefined) creditNote.bankTransferDetails = bankTransferDetails;
    if (chequeRecord !== undefined) creditNote.chequeRecord = chequeRecord;

    await creditNote.save();

    const updatedCreditNote = await CreditNote.findById(id)
      .populate('originalInvoice', 'invoiceNumber invoiceDate totalAmount')
      .populate('dealer', 'name code phone email address')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    res.json({
      success: true,
      message: "Credit note updated successfully",
      creditNote: updatedCreditNote
    });

  } catch (error) {
    console.error("Error updating credit note:", error);
    res.status(500).json({
      success: false,
      message: "Error updating credit note",
      error: error.message
    });
  }
};

// Delete Credit Note
export const deleteCreditNote = async (req, res) => {
  try {
    const { CreditNote } = getModels(req.dbConnection);
    const { id } = req.params;

    const creditNote = await CreditNote.findById(id);
    if (!creditNote) {
      return res.status(404).json({
        success: false,
        message: "Credit note not found"
      });
    }

    // Only allow deletion of pending credit notes
    if (creditNote.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending credit notes can be deleted"
      });
    }

    await CreditNote.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Credit note deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting credit note:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting credit note",
      error: error.message
    });
  }
};

// Get Credit Notes for a specific dealer
export const getCreditNotesByDealer = async (req, res) => {
  try {
    const { CreditNote } = getModels(req.dbConnection);
    const { dealerId } = req.params;
    const { status } = req.query;

    const filter = { dealer: dealerId };
    if (status) {
      filter.status = status;
    }

    const creditNotes = await CreditNote.find(filter)
      .populate('originalInvoice', 'invoiceNumber invoiceDate totalAmount')
      .populate('dealer', 'name code')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      creditNotes
    });

  } catch (error) {
    console.error("Error fetching dealer credit notes:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer credit notes",
      error: error.message
    });
  }
};

// Get Credit Notes for a specific invoice
export const getCreditNotesByInvoice = async (req, res) => {
  try {
    const { CreditNote } = getModels(req.dbConnection);
    const { invoiceId } = req.params;

    const creditNotes = await CreditNote.find({ originalInvoice: invoiceId })
      .populate('dealer', 'name code')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 });

    const totalCreditedAmount = creditNotes
      .filter(cn => cn.status === "Approved")
      .reduce((sum, cn) => sum + cn.creditAmount, 0);

    res.json({
      success: true,
      creditNotes,
      totalCreditedAmount
    });

  } catch (error) {
    console.error("Error fetching invoice credit notes:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching invoice credit notes",
      error: error.message
    });
  }
};

// Get Credit Note Statistics
export const getCreditNoteStats = async (req, res) => {
  try {
    const { CreditNote } = getModels(req.dbConnection);
    const { dealerId, fromDate, toDate } = req.query;

    const filter = {};
    if (dealerId) filter.dealer = dealerId;
    if (fromDate || toDate) {
      filter.creditNoteDate = {};
      if (fromDate) filter.creditNoteDate.$gte = new Date(fromDate);
      if (toDate) filter.creditNoteDate.$lte = new Date(toDate);
    }

    const [
      totalNotes,
      approvedNotes,
      pendingNotes,
      rejectedNotes,
      partialNotes,
      totalAmount,
      approvedAmount
    ] = await Promise.all([
      CreditNote.countDocuments(filter),
      CreditNote.countDocuments({ ...filter, status: "Approved" }),
      CreditNote.countDocuments({ ...filter, status: "Pending" }),
      CreditNote.countDocuments({ ...filter, status: "Rejected" }),
      CreditNote.countDocuments({ ...filter, status: "Partial" }),
      CreditNote.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: "$creditAmount" } } }
      ]),
      CreditNote.aggregate([
        { $match: { ...filter, status: "Approved" } },
        { $group: { _id: null, total: { $sum: "$creditAmount" } } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalNotes,
        approvedNotes,
        pendingNotes,
        rejectedNotes,
        partialNotes,
        totalAmount: totalAmount[0]?.total || 0,
        approvedAmount: approvedAmount[0]?.total || 0,
        averagePerNote: totalNotes > 0 ? (totalAmount[0]?.total || 0) / totalNotes : 0
      }
    });

  } catch (error) {
    console.error("Error fetching credit note stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching credit note statistics",
      error: error.message
    });
  }
};
