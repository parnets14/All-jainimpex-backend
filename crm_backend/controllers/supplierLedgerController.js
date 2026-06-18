import { supplierLedgerSchema } from "../models/SupplierLedger.js";
import { supplierSchema } from "../models/Supplier.js";
import { supplierInvoiceSchema } from "../models/SupplierInvoice.js";
import { debitNoteSchema } from "../models/DebitNote.js";

const getModels = (dbConnection) => {
  return {
    SupplierLedger: dbConnection.models.SupplierLedger || dbConnection.model('SupplierLedger', supplierLedgerSchema),
    Supplier: dbConnection.models.Supplier || dbConnection.model('Supplier', supplierSchema),
    SupplierInvoice: dbConnection.models.SupplierInvoice || dbConnection.model('SupplierInvoice', supplierInvoiceSchema),
    DebitNote: dbConnection.models.DebitNote || dbConnection.model('DebitNote', debitNoteSchema)
  };
};

// Create Supplier Ledger Entry
export const createSupplierLedgerEntry = async (req, res) => {
  try {
    const { SupplierLedger, Supplier, SupplierInvoice, DebitNote } = getModels(req.dbConnection);
    const {
      supplierId,
      transactionType,
      invoiceId,
      debitNoteId,
      paymentMade,
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
    if (!supplierId || !transactionType) {
      return res.status(400).json({
        success: false,
        message: "Supplier ID and transaction type are required"
      });
    }

    // Get supplier information
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found"
      });
    }

    let invoice = null;
    let debitNote = null;
    let debitAmount = 0;
    let creditAmount = 0;
    let invoiceNumber = "";
    let debitNoteNumber = "";

    // Handle different transaction types
    switch (transactionType) {
      case "Invoice":
        if (invoiceId) {
          invoice = await SupplierInvoice.findById(invoiceId);
          if (invoice) {
            debitAmount = invoice.totalAmount;
            invoiceNumber = invoice.invoiceNumber;
          }
        }
        break;

      case "Payment":
        if (paymentMade) {
          creditAmount = paymentMade;
        }
        break;

      case "Debit Note":
        if (debitNoteId) {
          debitNote = await DebitNote.findById(debitNoteId);
          if (debitNote) {
            debitAmount = debitNote.debitAmount;
            debitNoteNumber = debitNote.debitNoteNumber;
          }
        }
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

    // Create ledger entry
    const ledgerEntry = new SupplierLedger({
      supplier: supplierId,
      supplierName: supplier.name,
      supplierCode: supplier.code,
      transactionType,
      invoice: invoiceId,
      invoiceNumber,
      invoiceValue: invoice ? invoice.totalAmount : 0,
      debitNote: debitNoteId,
      debitNoteNumber,
      debitAmount: debitNote ? debitNote.debitAmount : 0,
      paymentMade,
      paymentMethod,
      chequeDetails,
      upiDetails,
      bankTransferDetails,
      debitAmount,
      creditAmount,
      description,
      remarks,
      creditDays,
      dueDate,
      pointsEarned: pointsEarned || 0,
      pointsRedeemed: pointsRedeemed || 0,
      schemeAmount: schemeAmount || 0,
      createdBy: req.user._id
    });

    await ledgerEntry.save();

    res.status(201).json({
      success: true,
      message: "Supplier ledger entry created successfully",
      data: ledgerEntry
    });

  } catch (error) {
    console.error("Error creating supplier ledger entry:", error);
    res.status(500).json({
      success: false,
      message: "Error creating supplier ledger entry",
      error: error.message
    });
  }
};

// Get All Supplier Ledger Entries
export const getAllSupplierLedgerEntries = async (req, res) => {
  try {
    const { SupplierLedger } = getModels(req.dbConnection);
    const {
      supplierId,
      transactionType,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 1000,
      sortBy = 'entryDate',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    if (supplierId) filter.supplier = supplierId;
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

    const entries = await SupplierLedger.find(filter)
      .populate('supplier', 'name code phone email address')
      .populate('invoice', 'invoiceNumber totalAmount invoiceDate items')
      .populate('debitNote', 'debitNoteNumber debitAmount debitNoteDate')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SupplierLedger.countDocuments(filter);

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
    console.error("Error fetching supplier ledger entries:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier ledger entries",
      error: error.message
    });
  }
};

// Get Supplier Ledger by Supplier ID
export const getSupplierLedgerBySupplier = async (req, res) => {
  try {
    const { SupplierLedger, Supplier } = getModels(req.dbConnection);
    const { supplierId } = req.params;
    const {
      startDate,
      endDate,
      transactionType,
      page = 1,
      limit = 20,
      sortOrder = 'asc'
    } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    // Stable ordering: by date, then Invoice before Payment on the same day
    const typeOrder = { 'Invoice': 1, 'Payment': 2, 'Debit Note': 3, 'Adjustment': 4, 'Opening Balance': 5 };
    const sortByDateType = (a, b) => {
      const da = new Date(a.entryDate); da.setHours(0, 0, 0, 0);
      const db = new Date(b.entryDate); db.setHours(0, 0, 0, 0);
      if (da.getTime() !== db.getTime()) return da - db;
      return (typeOrder[a.transactionType] || 6) - (typeOrder[b.transactionType] || 6);
    };

    // ── 1. Load ALL entries for this supplier and recompute the running balance
    //        in date order (NOT insertion order). This makes the balance correct
    //        even when entries are backdated/added out of order. ──
    const allEntries = (await SupplierLedger.find({ supplier: supplierId })
      .populate('invoice', 'invoiceNumber totalAmount invoiceDate items')
      .populate('debitNote', 'debitNoteNumber debitAmount debitNoteDate')
      .populate('createdBy', 'name email')
      .lean()).sort(sortByDateType);

    let cumulative = 0;
    allEntries.forEach(entry => {
      cumulative += (entry.debitAmount || 0) - (entry.creditAmount || 0);
      entry.runningBalance = cumulative; // override stored value with order-correct one
    });

    // ── 2. Summary — closing balance derived from totals (order-independent) ──
    const totalDebit = allEntries.reduce((s, e) => s + (e.debitAmount || 0), 0);
    const totalCredit = allEntries.reduce((s, e) => s + (e.creditAmount || 0), 0);
    const summary = {
      totalDebit,
      totalCredit,
      currentBalance: totalDebit - totalCredit, // positive = we owe the supplier
      totalInvoices: allEntries.filter(e => e.transactionType === 'Invoice').length,
      totalPayments: allEntries.filter(e => e.transactionType === 'Payment').length
    };

    // ── 3. Apply display filters (date range + transaction type) ──
    let displayEntries = allEntries;
    if (startDate) {
      const from = new Date(startDate);
      displayEntries = displayEntries.filter(e => new Date(e.entryDate) >= from);
    }
    if (endDate) {
      const to = new Date(endDate);
      to.setHours(23, 59, 59, 999);
      displayEntries = displayEntries.filter(e => new Date(e.entryDate) <= to);
    }
    if (transactionType) {
      displayEntries = displayEntries.filter(e => e.transactionType === transactionType);
    }

    // Opening balance = running balance just before the first displayed entry's window
    let openingBalance = 0;
    if (startDate) {
      const from = new Date(startDate);
      openingBalance = allEntries
        .filter(e => new Date(e.entryDate) < from)
        .reduce((s, e) => s + (e.debitAmount || 0) - (e.creditAmount || 0), 0);
    }

    // ── 4. Sort direction for display + paginate in memory ──
    if (sortOrder === 'desc') displayEntries = [...displayEntries].reverse();
    const total = displayEntries.length;
    const skip = (pageNumber - 1) * limitNumber;
    const entries = displayEntries.slice(skip, skip + limitNumber);

    const supplier = await Supplier.findById(supplierId);

    res.status(200).json({
      success: true,
      data: {
        supplier,
        entries,
        summary,
        openingBalance
      },
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(total / limitNumber),
        totalItems: total,
        itemsPerPage: limitNumber
      }
    });

  } catch (error) {
    console.error("Error fetching supplier ledger:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier ledger",
      error: error.message
    });
  }
};

// Update Supplier Ledger Entry
export const updateSupplierLedgerEntry = async (req, res) => {
  try {
    const { SupplierLedger } = getModels(req.dbConnection);
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.runningBalance;
    delete updateData.createdBy;

    const ledgerEntry = await SupplierLedger.findByIdAndUpdate(
      id,
      { ...updateData, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    if (!ledgerEntry) {
      return res.status(404).json({
        success: false,
        message: "Supplier ledger entry not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Supplier ledger entry updated successfully",
      data: ledgerEntry
    });

  } catch (error) {
    console.error("Error updating supplier ledger entry:", error);
    res.status(500).json({
      success: false,
      message: "Error updating supplier ledger entry",
      error: error.message
    });
  }
};

// Delete Supplier Ledger Entry
export const deleteSupplierLedgerEntry = async (req, res) => {
  try {
    const { SupplierLedger } = getModels(req.dbConnection);
    const { id } = req.params;

    const ledgerEntry = await SupplierLedger.findByIdAndDelete(id);

    if (!ledgerEntry) {
      return res.status(404).json({
        success: false,
        message: "Supplier ledger entry not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Supplier ledger entry deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting supplier ledger entry:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting supplier ledger entry",
      error: error.message
    });
  }
};

// Get Supplier Ledger Summary
export const getSupplierLedgerSummary = async (req, res) => {
  try {
    const { SupplierLedger } = getModels(req.dbConnection);
    const { supplierId } = req.params;

    const entries = await SupplierLedger.find({ supplier: supplierId })
      .sort({ entryDate: 1 });

    const totalDebit = entries.reduce((sum, entry) => sum + (entry.debitAmount || 0), 0);
    const totalCredit = entries.reduce((sum, entry) => sum + (entry.creditAmount || 0), 0);
    const summary = {
      totalDebit,
      totalCredit,
      // Closing balance from totals (order-independent), positive = we owe supplier
      currentBalance: totalDebit - totalCredit,
      totalInvoices: entries.filter(entry => entry.transactionType === 'Invoice').length,
      totalPayments: entries.filter(entry => entry.transactionType === 'Payment').length,
      overdueAmount: entries
        .filter(entry => entry.status === 'Overdue')
        .reduce((sum, entry) => sum + ((entry.debitAmount || 0) - (entry.creditAmount || 0)), 0)
    };

    res.status(200).json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error("Error fetching supplier ledger summary:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier ledger summary",
      error: error.message
    });
  }
};
