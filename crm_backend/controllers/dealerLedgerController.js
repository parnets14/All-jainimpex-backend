import { dealerLedgerSchema } from "../models/DealerLedger.js";
import { dealerSchema } from "../models/Dealer.js";
import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { creditNoteSchema } from "../models/CreditNote.js";
import { voucherSchema } from "../models/Voucher.js";
import { paymentAllocationSchema } from "../models/PaymentAllocation.js";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    DealerLedger: dbConnection.models.DealerLedger || 
                  dbConnection.model('DealerLedger', dealerLedgerSchema),
    Dealer: dbConnection.models.Dealer || 
            dbConnection.model('Dealer', dealerSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || 
                   dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    CreditNote: dbConnection.models.CreditNote || 
                dbConnection.model('CreditNote', creditNoteSchema),
    Voucher: dbConnection.models.Voucher || 
             dbConnection.model('Voucher', voucherSchema),
    PaymentAllocation: dbConnection.models.PaymentAllocation || 
                       dbConnection.model('PaymentAllocation', paymentAllocationSchema)
  };
};

// Create Dealer Ledger Entry
export const createDealerLedgerEntry = async (req, res) => {
  try {
    const { DealerLedger, Dealer, DealerInvoice, CreditNote } = getModels(req.dbConnection);
    const {
      dealerId,
      transactionType,
      invoiceId,
      creditNoteId,
      paymentReceived,
      paymentMethod,
      chequeDetails,
      upiDetails,
      bankTransferDetails,
      description,
      remarks,
      creditDays,
      pointsEarned,
      pointsRedeemed,
      schemeAmount
    } = req.body;

    // Validate required fields
    if (!dealerId || !transactionType) {
      return res.status(400).json({
        success: false,
        message: "Dealer ID and transaction type are required"
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

    let invoice = null;
    let creditNote = null;
    let debitAmount = 0;
    let creditAmount = 0;
    let invoiceNumber = "";
    let creditNoteNumber = "";

    // Handle different transaction types
    switch (transactionType) {
      case "Invoice":
        if (!invoiceId) {
          return res.status(400).json({
            success: false,
            message: "Invoice ID is required for invoice transactions"
          });
        }
        invoice = await DealerInvoice.findById(invoiceId);
        if (!invoice) {
          return res.status(404).json({
            success: false,
            message: "Invoice not found"
          });
        }
        debitAmount = invoice.totalAmount;
        invoiceNumber = invoice.invoiceNumber;
        break;

      case "Credit Note":
        if (!creditNoteId) {
          return res.status(400).json({
            success: false,
            message: "Credit Note ID is required for credit note transactions"
          });
        }
        creditNote = await CreditNote.findById(creditNoteId);
        if (!creditNote) {
          return res.status(404).json({
            success: false,
            message: "Credit Note not found"
          });
        }
        creditAmount = creditNote.creditAmount;
        creditNoteNumber = creditNote.creditNoteNumber;
        break;

      case "Payment":
        if (!paymentReceived || paymentReceived <= 0) {
          return res.status(400).json({
            success: false,
            message: "Payment amount must be greater than 0"
          });
        }
        creditAmount = paymentReceived;
        break;

      case "Adjustment":
        if (req.body.adjustmentAmount) {
          if (req.body.adjustmentAmount > 0) {
            debitAmount = req.body.adjustmentAmount;
          } else {
            creditAmount = Math.abs(req.body.adjustmentAmount);
          }
        }
        break;

      case "Opening Balance":
        if (req.body.openingBalance) {
          if (req.body.openingBalance > 0) {
            debitAmount = req.body.openingBalance;
          } else {
            creditAmount = Math.abs(req.body.openingBalance);
          }
        }
        break;
    }

    // Calculate due date if credit days provided
    let dueDate = null;
    if (creditDays && creditDays > 0) {
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + creditDays);
    }

    // Get sales type and credit days from invoice if available
    let salesType = null;
    let creditDaysApplied = creditDays || 0;
    
    if (invoice && invoice.items && invoice.items.length > 0) {
      // Check if invoice has mixed sales types or single type
      const salesTypes = [...new Set(invoice.items.map(item => item.salesType).filter(Boolean))];
      if (salesTypes.length === 1) {
        salesType = salesTypes[0];
      } else if (salesTypes.length > 1) {
        salesType = 'Mixed'; // Mixed CD and Regular sales
      }
      
      // Use the credit days from invoice if available
      if (invoice.creditDays) {
        creditDaysApplied = invoice.creditDays;
      }
    }
    
    // Create ledger entry
    const ledgerEntry = new DealerLedger({
      dealer: dealerId,
      dealerName: dealer.name,
      dealerCode: dealer.dealerCode,
      transactionType,
      invoice: invoiceId,
      invoiceNumber,
      invoiceValue: invoice ? invoice.totalAmount : 0,
      salesType,
      creditDaysApplied,
      creditNote: creditNoteId,
      creditNoteNumber,
      creditAmount: creditNote ? creditNote.creditAmount : 0,
      paymentReceived,
      paymentMethod,
      chequeDetails,
      upiDetails,
      bankTransferDetails,
      debitAmount,
      creditAmount,
      description,
      remarks,
      creditDays: creditDaysApplied,
      dueDate,
      pointsEarned: pointsEarned || 0,
      pointsRedeemed: pointsRedeemed || 0,
      schemeAmount: schemeAmount || 0,
      createdBy: req.user._id
    });

    await ledgerEntry.save();

    res.status(201).json({
      success: true,
      message: "Dealer ledger entry created successfully",
      data: ledgerEntry
    });

  } catch (error) {
    console.error("Error creating dealer ledger entry:", error);
    res.status(500).json({
      success: false,
      message: "Error creating dealer ledger entry",
      error: error.message
    });
  }
};

// Get All Dealer Ledger Entries
export const getAllDealerLedgerEntries = async (req, res) => {
  try {
    const { DealerLedger } = getModels(req.dbConnection);
    const {
      dealerId,
      transactionType,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 1000,
      sortBy = 'entryDate',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object - exclude Credit Notes by default
    const filter = {
      transactionType: { $in: ['Invoice', 'Payment', 'Advance Payment', 'Advance Adjustment'] } // Show invoices, payments, and advance transactions
    };
    if (dealerId) filter.dealer = dealerId;
    // Allow override if specific transaction type is requested
    if (transactionType) filter.transactionType = transactionType;
    if (status) filter.status = status;
    
    if (startDate || endDate) {
      filter.entryDate = {};
      if (startDate) filter.entryDate.$gte = new Date(startDate);
      if (endDate) filter.entryDate.$lte = new Date(endDate);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const entries = await DealerLedger.find(filter)
      .populate('dealer', 'name dealerCode phone email address')
      .populate('invoice', 'invoiceNumber totalAmount invoiceDate')
      .populate('creditNote', 'creditNoteNumber creditAmount creditNoteDate')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DealerLedger.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: entries,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });

  } catch (error) {
    console.error("Error fetching dealer ledger entries:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer ledger entries",
      error: error.message
    });
  }
};

// Get Dealer Ledger by Dealer ID (Enhanced with Voucher Integration)
export const getDealerLedgerByDealer = async (req, res) => {
  try {
    const { DealerLedger, Dealer, Voucher, PaymentAllocation } = getModels(req.dbConnection);
    const { dealerId } = req.params;
    const { 
      startDate, 
      endDate, 
      transactionType,
      page = 1,
      limit = 20,
      sortBy = 'date',
      sortOrder = 'asc'
    } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // 1. Get old ledger entries (invoices, old payments)
    const oldLedgerFilter = { 
      dealer: dealerId,
      transactionType: { $in: ['Invoice', 'Payment', 'Advance Payment', 'Advance Adjustment'] }
    };
    if (startDate || endDate) oldLedgerFilter.entryDate = dateFilter;
    if (transactionType && transactionType !== 'all') oldLedgerFilter.transactionType = transactionType;

    const oldEntries = await DealerLedger.find(oldLedgerFilter)
      .populate('invoice', 'invoiceNumber totalAmount invoiceDate')
      .populate('creditNote', 'creditNoteNumber creditAmount creditNoteDate')
      .lean();

    // 2. Get invoices (new system)
    const invoiceFilter = { 
      dealerId: dealerId,
      isDeleted: false
    };
    if (startDate || endDate) invoiceFilter.invoiceDate = dateFilter;

    const invoices = await DealerInvoice.find(invoiceFilter).lean();

    // 3. Get payment allocations (replaces individual vouchers)
    const allocationFilter = { partyId: dealerId };
    if (startDate || endDate) allocationFilter.allocationDate = dateFilter;

    const allocations = await PaymentAllocation.find(allocationFilter)
      .populate('allocations.invoiceId', 'invoiceNumber')
      .lean();

    // 4. Combine all entries
    const combinedEntries = [];

    // Add old ledger entries
    oldEntries.forEach(entry => {
      combinedEntries.push({
        entryDate: entry.entryDate,
        transactionType: entry.transactionType,
        invoiceNumber: entry.invoiceNumber || '',
        creditNoteNumber: entry.creditNoteNumber || '',
        debitAmount: entry.debitAmount || 0,
        creditAmount: entry.creditAmount || 0,
        description: entry.description || entry.remarks || '',
        remarks: entry.remarks || '',
        paymentMethod: entry.paymentMethod || '',
        chequeDetails: entry.chequeDetails || null,
        upiDetails: entry.upiDetails || null,
        bankTransferDetails: entry.bankTransferDetails || null,
        creditDays: entry.creditDays || 0,
        creditDaysApplied: entry.creditDaysApplied || 0,
        salesType: entry.salesType || '',
        source: 'old_ledger',
        invoice: entry.invoice,
        _id: entry._id
      });
    });

    // Add invoice entries (from new system)
    invoices.forEach(invoice => {
      combinedEntries.push({
        entryDate: invoice.invoiceDate,
        transactionType: 'Invoice',
        invoiceNumber: invoice.invoiceNumber,
        creditNoteNumber: '',
        debitAmount: invoice.totalAmount,
        creditAmount: 0,
        description: `Invoice ${invoice.invoiceNumber}`,
        remarks: invoice.remarks || '',
        paymentMethod: '',
        creditDays: invoice.creditDays || 0,
        creditDaysApplied: invoice.creditDays || 0,
        salesType: invoice.salesType || '',
        source: 'invoice',
        invoice: {
          _id: invoice._id,
          paymentStatus: invoice.paymentStatus,
          paidAmount: invoice.paidAmount,
          pendingAmount: invoice.pendingAmount
        },
        _id: invoice._id
      });
    });

    // Add payment allocations (grouped by allocation, not individual vouchers)
    allocations.forEach(allocation => {
      const totalAllocated = allocation.totalAllocated || 0;
      const invoiceNumbers = allocation.allocations.map(a => a.invoiceNumber).join(', ');
      
      combinedEntries.push({
        entryDate: allocation.allocationDate,
        transactionType: 'Payment',
        invoiceNumber: invoiceNumbers,
        creditNoteNumber: '',
        debitAmount: 0,
        creditAmount: totalAllocated,
        description: `Payment allocated to: ${invoiceNumbers}`,
        remarks: `Allocation: ${allocation.allocationNumber}`,
        paymentMethod: allocation.voucherType || 'Receipt',
        source: 'allocation',
        _id: allocation._id,
        allocationNumber: allocation.allocationNumber,
        voucherNumber: allocation.voucherNumber
      });
    });

    // Sort by date
    combinedEntries.sort((a, b) => {
      const dateCompare = new Date(a.entryDate) - new Date(b.entryDate);
      return sortOrder === 'desc' ? -dateCompare : dateCompare;
    });

    // Calculate running balance
    let runningBalance = 0;
    
    // Calculate opening balance (entries before startDate)
    if (startDate) {
      // Old ledger entries before start date
      const entriesBeforeStart = await DealerLedger.find({
        dealer: dealerId,
        entryDate: { $lt: new Date(startDate) }
      }).lean();
      
      entriesBeforeStart.forEach(entry => {
        runningBalance += (entry.debitAmount || 0) - (entry.creditAmount || 0);
      });
      
      // Invoices before start date
      const invoicesBeforeStart = await DealerInvoice.find({
        dealerId: dealerId,
        isDeleted: false,
        invoiceDate: { $lt: new Date(startDate) }
      }).lean();
      
      invoicesBeforeStart.forEach(invoice => {
        runningBalance += invoice.totalAmount;
      });
      
      // Payment allocations before start date
      const allocationsBeforeStart = await PaymentAllocation.find({
        partyId: dealerId,
        allocationDate: { $lt: new Date(startDate) }
      }).lean();
      
      allocationsBeforeStart.forEach(allocation => {
        runningBalance -= (allocation.totalAllocated || 0);
      });
    }
    
    const openingBalance = runningBalance;
    
    combinedEntries.forEach(entry => {
      runningBalance += entry.debitAmount - entry.creditAmount;
      entry.balance = runningBalance;
    });

    // Paginate
    const total = combinedEntries.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedEntries = combinedEntries.slice(startIndex, endIndex);

    // Calculate summary
    const summary = {
      openingBalance,
      totalDebit: combinedEntries.reduce((sum, e) => sum + e.debitAmount, 0),
      totalCredit: combinedEntries.reduce((sum, e) => sum + e.creditAmount, 0),
      currentBalance: runningBalance,
      totalTransactions: total
    };

    // Get dealer information
    const dealer = await Dealer.findById(dealerId);

    res.status(200).json({
      success: true,
      data: {
        dealer,
        entries: paginatedEntries,
        summary,
        openingBalance
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage: parseInt(page) < Math.ceil(total / limit),
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error("Error fetching dealer ledger:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer ledger",
      error: error.message
    });
  }
};

// Get Single Dealer Ledger Entry
export const getDealerLedgerEntry = async (req, res) => {
  try {
    const { DealerLedger } = getModels(req.dbConnection);
    const { id } = req.params;

    const entry = await DealerLedger.findById(id)
      .populate('dealer', 'name dealerCode phone email address')
      .populate('invoice', 'invoiceNumber totalAmount invoiceDate items')
      .populate('creditNote', 'creditNoteNumber creditAmount creditNoteDate')
      .populate('createdBy', 'name email');

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Dealer ledger entry not found"
      });
    }

    res.status(200).json({
      success: true,
      data: entry
    });

  } catch (error) {
    console.error("Error fetching dealer ledger entry:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer ledger entry",
      error: error.message
    });
  }
};

// Update Dealer Ledger Entry
export const updateDealerLedgerEntry = async (req, res) => {
  try {
    const { DealerLedger } = getModels(req.dbConnection);
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.dealer;
    delete updateData.runningBalance;
    delete updateData.createdBy;

    updateData.updatedBy = req.user._id;

    const entry = await DealerLedger.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('dealer', 'name dealerCode phone email address')
      .populate('invoice', 'invoiceNumber totalAmount invoiceDate')
      .populate('creditNote', 'creditNoteNumber creditAmount creditNoteDate');

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Dealer ledger entry not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Dealer ledger entry updated successfully",
      data: entry
    });

  } catch (error) {
    console.error("Error updating dealer ledger entry:", error);
    res.status(500).json({
      success: false,
      message: "Error updating dealer ledger entry",
      error: error.message
    });
  }
};

// Delete Dealer Ledger Entry
export const deleteDealerLedgerEntry = async (req, res) => {
  try {
    const { DealerLedger } = getModels(req.dbConnection);
    const { id } = req.params;

    const entry = await DealerLedger.findByIdAndDelete(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Dealer ledger entry not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Dealer ledger entry deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting dealer ledger entry:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting dealer ledger entry",
      error: error.message
    });
  }
};

// Get Dealer Ledger Summary/Statistics
export const getDealerLedgerStats = async (req, res) => {
  try {
    const { DealerLedger } = getModels(req.dbConnection);
    const { dealerId, startDate, endDate } = req.query;

    // Build filter
    const filter = {};
    if (dealerId) filter.dealer = dealerId;
    if (startDate || endDate) {
      filter.entryDate = {};
      if (startDate) filter.entryDate.$gte = new Date(startDate);
      if (endDate) filter.entryDate.$lte = new Date(endDate);
    }

    const stats = await DealerLedger.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
          totalDebit: { $sum: "$debitAmount" },
          totalCredit: { $sum: "$creditAmount" },
          totalInvoices: {
            $sum: { $cond: [{ $eq: ["$transactionType", "Invoice"] }, 1, 0] }
          },
          totalPayments: {
            $sum: { $cond: [{ $eq: ["$transactionType", "Payment"] }, 1, 0] }
          },
          totalCreditNotes: {
            $sum: { $cond: [{ $eq: ["$transactionType", "Credit Note"] }, 1, 0] }
          },
          totalPointsEarned: { $sum: "$pointsEarned" },
          totalPointsRedeemed: { $sum: "$pointsRedeemed" },
          totalSchemeAmount: { $sum: "$schemeAmount" }
        }
      }
    ]);

    // Get current balances by dealer
    const dealerBalances = await DealerLedger.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$dealer",
          dealerName: { $first: "$dealerName" },
          dealerCode: { $first: "$dealerCode" },
          currentBalance: { $last: "$runningBalance" },
          lastTransactionDate: { $max: "$entryDate" }
        }
      },
      {
        $lookup: {
          from: "dealers",
          localField: "_id",
          foreignField: "_id",
          as: "dealerInfo"
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: stats[0] || {
          totalEntries: 0,
          totalDebit: 0,
          totalCredit: 0,
          totalInvoices: 0,
          totalPayments: 0,
          totalCreditNotes: 0,
          totalPointsEarned: 0,
          totalPointsRedeemed: 0,
          totalSchemeAmount: 0
        },
        dealerBalances
      }
    });

  } catch (error) {
    console.error("Error fetching dealer ledger stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer ledger stats",
      error: error.message
    });
  }
};

// Auto-create ledger entries from invoices and credit notes
export const syncLedgerEntries = async (req, res) => {
  try {
    const { DealerLedger, Dealer, DealerInvoice, CreditNote } = getModels(req.dbConnection);
    const { dealerId } = req.params;

    // Get all invoices for the dealer that don't have ledger entries (exclude drafts and cancelled)
    const invoices = await DealerInvoice.find({ 
      dealer: dealerId,
      isDraft: false, // Exclude draft invoices
      isDeleted: { $ne: true } // Exclude cancelled invoices
    });
    const creditNotes = await CreditNote.find({ dealer: dealerId });

    const createdEntries = [];

    // Create ledger entries for invoices
    for (const invoice of invoices) {
      const existingEntry = await DealerLedger.findOne({ invoice: invoice._id });
      if (!existingEntry) {
        const ledgerEntry = new DealerLedger({
          dealer: dealerId,
          dealerName: invoice.customerName,
          dealerCode: invoice.customerCode,
          transactionType: "Invoice",
          invoice: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceValue: invoice.totalAmount,
          debitAmount: invoice.totalAmount,
          creditAmount: 0,
          description: `Invoice ${invoice.invoiceNumber}`,
          creditDays: invoice.creditDays || 0,
          dueDate: invoice.dueDate,
          pointsEarned: invoice.totalPoints || 0,
          schemeAmount: invoice.totalDiscount || 0,
          createdBy: req.user._id
        });
        await ledgerEntry.save();
        createdEntries.push(ledgerEntry);
      }
    }

    // Create ledger entries for credit notes
    for (const creditNote of creditNotes) {
      const existingEntry = await DealerLedger.findOne({ creditNote: creditNote._id });
      if (!existingEntry) {
        const ledgerEntry = new DealerLedger({
          dealer: dealerId,
          dealerName: creditNote.dealerName,
          dealerCode: creditNote.dealerCode,
          transactionType: "Credit Note",
          creditNote: creditNote._id,
          creditNoteNumber: creditNote.creditNoteNumber,
          creditAmount: creditNote.creditAmount,
          debitAmount: 0,
          creditAmount: creditNote.creditAmount,
          description: `Credit Note ${creditNote.creditNoteNumber}`,
          remarks: creditNote.creditReason,
          createdBy: req.user._id
        });
        await ledgerEntry.save();
        createdEntries.push(ledgerEntry);
      }
    }

    res.status(200).json({
      success: true,
      message: `Created ${createdEntries.length} ledger entries`,
      data: createdEntries
    });

  } catch (error) {
    console.error("Error syncing ledger entries:", error);
    res.status(500).json({
      success: false,
      message: "Error syncing ledger entries",
      error: error.message
    });
  }
};




// @desc    Send dealer ledger via email
// @route   POST /api/dealer-ledger/send-email/:dealerId
// @access  Private
export const sendDealerLedgerEmail = async (req, res) => {
  try {
    const { DealerLedger, Dealer } = getModels(req.dbConnection);
    const { dealerId } = req.params;
    const { startDate, endDate, emailTo, subject, message } = req.body;

    // Get dealer information
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    // Build filter
    const filter = { 
      dealer: dealerId,
      transactionType: { $in: ['Invoice', 'Payment', 'Advance Payment', 'Advance Adjustment'] }
    };
    if (startDate || endDate) {
      filter.entryDate = {};
      if (startDate) filter.entryDate.$gte = new Date(startDate);
      if (endDate) filter.entryDate.$lte = new Date(endDate);
    }

    // Get ledger entries
    const entries = await DealerLedger.find(filter)
      .populate('invoice', 'invoiceNumber totalAmount invoiceDate items')
      .populate('creditNote', 'creditNoteNumber creditAmount creditNoteDate')
      .sort({ entryDate: 1 });

    if (entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No ledger entries found for the selected period"
      });
    }

    // Calculate opening balance
    let openingBalance = 0;
    if (startDate) {
      const previousEntries = await DealerLedger.find({
        dealer: dealerId,
        entryDate: { $lt: new Date(startDate) }
      }).sort({ entryDate: 1 });
      
      previousEntries.forEach(entry => {
        openingBalance += (entry.debitAmount || 0);
        openingBalance -= (entry.creditAmount || 0);
      });
    }

    // Calculate closing balance
    let closingBalance = openingBalance;
    entries.forEach(entry => {
      closingBalance += (entry.debitAmount || 0);
      closingBalance -= (entry.creditAmount || 0);
    });

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    
    await new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('JAIN IMPEX', { align: 'center' });
      doc.fontSize(12).text('Plumbing Solutions', { align: 'center' });
      doc.fontSize(10).text('123 Market Road, New Delhi - 110001', { align: 'center' });
      doc.text('GSTIN: 07ABCDE1234F1Z5 | PAN: ABCDE1234F', { align: 'center' });
      doc.moveDown();

      // Title
      doc.fontSize(16).text('DEALER LEDGER STATEMENT', { align: 'center', underline: true });
      doc.moveDown();

      // Dealer Info
      doc.fontSize(12).text(`Dealer: ${dealer.name} (${dealer.code || 'N/A'})`);
      doc.text(`Address: ${dealer.address || 'N/A'}`);
      doc.text(`Phone: ${dealer.phone || 'N/A'}`);
      doc.text(`Email: ${dealer.email || 'N/A'}`);
      doc.text(`GST: ${dealer.gst || 'N/A'}`);
      doc.moveDown();

      // Period
      doc.text(`Period: ${startDate ? new Date(startDate).toLocaleDateString('en-IN') : 'Beginning'} to ${endDate ? new Date(endDate).toLocaleDateString('en-IN') : 'Current'}`);
      doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`);
      doc.moveDown();

      // Opening Balance
      doc.fontSize(11).text(`Opening Balance: ₹${openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { bold: true });
      doc.moveDown();

      // Table Header
      const tableTop = doc.y;
      doc.fontSize(9);
      doc.text('Date', 50, tableTop, { width: 70 });
      doc.text('Type', 120, tableTop, { width: 60 });
      doc.text('Invoice/Ref', 180, tableTop, { width: 80 });
      doc.text('Debit', 260, tableTop, { width: 70, align: 'right' });
      doc.text('Credit', 330, tableTop, { width: 70, align: 'right' });
      doc.text('Balance', 400, tableTop, { width: 90, align: 'right' });
      
      doc.moveTo(50, tableTop + 15).lineTo(540, tableTop + 15).stroke();
      doc.moveDown();

      // Table Rows
      let runningBalance = openingBalance;
      let y = doc.y;

      entries.forEach((entry, index) => {
        runningBalance += (entry.debitAmount || 0) - (entry.creditAmount || 0);
        
        // Check if we need a new page
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        doc.fontSize(8);
        doc.text(new Date(entry.entryDate).toLocaleDateString('en-IN'), 50, y, { width: 70 });
        doc.text(entry.transactionType, 120, y, { width: 60 });
        doc.text(entry.invoiceNumber || entry.creditNoteNumber || '-', 180, y, { width: 80 });
        doc.text(`₹${(entry.debitAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 260, y, { width: 70, align: 'right' });
        doc.text(`₹${(entry.creditAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 330, y, { width: 70, align: 'right' });
        doc.text(`₹${runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 400, y, { width: 90, align: 'right' });
        
        y += 20;
      });

      // Closing Balance
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`Closing Balance: ₹${closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { bold: true });
      
      // Footer
      doc.fontSize(8);
      doc.text('This is a computer-generated statement and does not require a signature.', { align: 'center' });
      doc.text('For any queries, please contact us at info@jainimpex.com or +91 99999 88888', { align: 'center' });

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);

    // Setup email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    // Email options
    const mailOptions = {
      from: `"JAIN IMPEX" <${process.env.EMAIL_USER}>`,
      to: emailTo || dealer.email,
      subject: subject || `Dealer Ledger Statement - ${dealer.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Dealer Ledger Statement</h2>
          <p>Dear ${dealer.name},</p>
          <p>${message || 'Please find attached your ledger statement for the selected period.'}</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Period:</strong> ${startDate ? new Date(startDate).toLocaleDateString('en-IN') : 'Beginning'} to ${endDate ? new Date(endDate).toLocaleDateString('en-IN') : 'Current'}</p>
            <p style="margin: 5px 0;"><strong>Opening Balance:</strong> ₹${openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            <p style="margin: 5px 0;"><strong>Closing Balance:</strong> ₹${closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            <p style="margin: 5px 0;"><strong>Total Transactions:</strong> ${entries.length}</p>
          </div>
          <p>If you have any questions or concerns regarding this statement, please don't hesitate to contact us.</p>
          <p>Best regards,<br><strong>JAIN IMPEX Team</strong></p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            JAIN IMPEX - Plumbing Solutions<br>
            123 Market Road, New Delhi - 110001<br>
            Phone: +91 99999 88888 | Email: info@jainimpex.com
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `Ledger_${dealer.code}_${new Date().toISOString().slice(0, 10)}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    // Send email
    await transporter.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      message: `Ledger statement sent successfully to ${emailTo || dealer.email}`
    });

  } catch (error) {
    console.error("Error sending dealer ledger email:", error);
    res.status(500).json({
      success: false,
      message: "Error sending dealer ledger email",
      error: error.message
    });
  }
};


/**
 * Get Combined Dealer Ledger (Old System + New Voucher System)
 * GET /api/dealer-ledger/combined/:dealerId
 */
export const getCombinedDealerLedger = async (req, res) => {
  try {
    const { DealerLedger, Dealer, DealerInvoice, Voucher, PaymentAllocation } = getModels(req.dbConnection);
    const { dealerId } = req.params;
    const { 
      startDate, 
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    // Get dealer information
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // 1. Get old ledger entries (invoices, payments, credit notes)
    const oldLedgerFilter = { dealer: dealerId };
    if (startDate || endDate) oldLedgerFilter.entryDate = dateFilter;

    const oldLedgerEntries = await DealerLedger.find(oldLedgerFilter)
      .populate('invoice', 'invoiceNumber totalAmount invoiceDate')
      .populate('creditNote', 'creditNoteNumber creditAmount creditNoteDate')
      .lean();

    // 2. Get voucher entries (new system)
    const voucherFilter = { 
      partyId: dealerId,
      status: 'Posted'
    };
    if (startDate || endDate) voucherFilter.voucherDate = dateFilter;

    const vouchers = await Voucher.find(voucherFilter).lean();

    // 3. Get payment allocations
    const allocationFilter = { partyId: dealerId };
    if (startDate || endDate) allocationFilter.allocationDate = dateFilter;

    const allocations = await PaymentAllocation.find(allocationFilter)
      .populate('allocations.invoiceId', 'invoiceNumber')
      .lean();

    // 4. Combine all transactions
    const allTransactions = [];

    // Add old ledger entries
    oldLedgerEntries.forEach(entry => {
      allTransactions.push({
        date: entry.entryDate,
        type: entry.transactionType,
        reference: entry.invoiceNumber || entry.creditNoteNumber || '-',
        description: entry.description || entry.transactionType,
        debit: entry.debitAmount || 0,
        credit: entry.creditAmount || 0,
        source: 'old_system',
        _id: entry._id
      });
    });

    // Add voucher entries
    vouchers.forEach(voucher => {
      // Add voucher as transaction
      allTransactions.push({
        date: voucher.voucherDate,
        type: voucher.voucherType === 'Receipt' ? 'Voucher Receipt' : 
              voucher.voucherType === 'Payment' ? 'Voucher Payment' : 'Voucher Contra',
        reference: voucher.voucherNumber,
        description: voucher.narration || `${voucher.voucherType} - ${voucher.transactionMode}`,
        debit: voucher.voucherType === 'Payment' ? voucher.totalAmount : 0,
        credit: voucher.voucherType === 'Receipt' ? voucher.totalAmount : 0,
        source: 'voucher_system',
        voucherId: voucher._id,
        unallocated: voucher.unallocatedAmount
      });
    });

    // Add payment allocations as separate entries
    allocations.forEach(allocation => {
      allocation.allocations.forEach(alloc => {
        allTransactions.push({
          date: allocation.allocationDate,
          type: 'Payment Allocation',
          reference: `${allocation.voucherNumber} → ${alloc.invoiceNumber}`,
          description: `Allocated ₹${alloc.allocatedAmount.toLocaleString('en-IN')} to ${alloc.invoiceNumber}`,
          debit: 0,
          credit: alloc.allocatedAmount,
          source: 'allocation',
          allocationId: allocation._id
        });
      });
    });

    // 5. Sort by date
    allTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 6. Calculate running balance
    let runningBalance = 0;
    allTransactions.forEach(txn => {
      runningBalance += txn.debit - txn.credit;
      txn.balance = runningBalance;
    });

    // 7. Pagination
    const total = allTransactions.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedTransactions = allTransactions.slice(startIndex, endIndex);

    // 8. Calculate summary
    const summary = {
      totalDebit: allTransactions.reduce((sum, txn) => sum + txn.debit, 0),
      totalCredit: allTransactions.reduce((sum, txn) => sum + txn.credit, 0),
      currentBalance: runningBalance,
      totalTransactions: total,
      oldSystemTransactions: oldLedgerEntries.length,
      voucherSystemTransactions: vouchers.length,
      allocationTransactions: allocations.reduce((sum, a) => sum + a.allocations.length, 0)
    };

    res.status(200).json({
      success: true,
      data: {
        dealer,
        transactions: paginatedTransactions,
        summary
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching combined dealer ledger:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching combined dealer ledger',
      error: error.message
    });
  }
};
