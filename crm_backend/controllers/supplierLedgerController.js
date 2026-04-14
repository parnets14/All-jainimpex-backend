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
      sortBy = 'entryDate',
      sortOrder = 'asc'
    } = req.query;

    // Build filter
    const filter = { supplier: supplierId };
    if (startDate || endDate) {
      filter.entryDate = {};
      if (startDate) filter.entryDate.$gte = new Date(startDate);
      if (endDate) filter.entryDate.$lte = new Date(endDate);
    }
    if (transactionType) filter.transactionType = transactionType;

    // Calculate pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Build sort object - first by date, then by transaction type (Invoice before Payment)
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Add secondary sort by transaction type to ensure invoices come before payments on same date
    sort.transactionType = 1; // 1 = Invoice, 2 = Payment, 3 = Debit Note, etc.

    // Get total count for pagination
    const total = await SupplierLedger.countDocuments(filter);

    // Get paginated entries
    const entries = await SupplierLedger.find(filter)
      .populate('invoice', 'invoiceNumber totalAmount invoiceDate items')
      .populate('debitNote', 'debitNoteNumber debitAmount debitNoteDate')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limitNumber);

    // Custom sort to ensure invoices come before payments on same date
    entries.sort((a, b) => {
      // First sort by date
      const dateA = new Date(a.entryDate);
      const dateB = new Date(b.entryDate);
      
      if (dateA.getTime() !== dateB.getTime()) {
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      }
      
      // If same date, sort by transaction type (Invoice before Payment)
      const typeOrder = { 'Invoice': 1, 'Payment': 2, 'Debit Note': 3, 'Adjustment': 4, 'Opening Balance': 5 };
      const orderA = typeOrder[a.transactionType] || 6;
      const orderB = typeOrder[b.transactionType] || 6;
      
      return orderA - orderB;
    });

    // Get supplier information
    const supplier = await Supplier.findById(supplierId);

    // Calculate summary from ALL entries (not just current page)
    const allEntries = await SupplierLedger.find({ supplier: supplierId })
      .sort({ entryDate: 1 });
    
    // Apply same custom sorting to all entries
    allEntries.sort((a, b) => {
      // First sort by date
      const dateA = new Date(a.entryDate);
      const dateB = new Date(b.entryDate);
      
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA - dateB; // Always ascending for summary calculation
      }
      
      // If same date, sort by transaction type (Invoice before Payment)
      const typeOrder = { 'Invoice': 1, 'Payment': 2, 'Debit Note': 3, 'Adjustment': 4, 'Opening Balance': 5 };
      const orderA = typeOrder[a.transactionType] || 6;
      const orderB = typeOrder[b.transactionType] || 6;
      
      return orderA - orderB;
    });
    
    const summary = {
      totalDebit: allEntries.reduce((sum, entry) => sum + (entry.debitAmount || 0), 0),
      totalCredit: allEntries.reduce((sum, entry) => sum + (entry.creditAmount || 0), 0),
      currentBalance: allEntries.length > 0 ? allEntries[allEntries.length - 1].runningBalance : 0,
      totalInvoices: allEntries.filter(entry => entry.transactionType === 'Invoice').length,
      totalPayments: allEntries.filter(entry => entry.transactionType === 'Payment').length
    };

    res.status(200).json({
      success: true,
      data: {
        supplier,
        entries,
        summary
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

    const summary = {
      totalDebit: entries.reduce((sum, entry) => sum + (entry.debitAmount || 0), 0),
      totalCredit: entries.reduce((sum, entry) => sum + (entry.creditAmount || 0), 0),
      currentBalance: entries.length > 0 ? entries[entries.length - 1].runningBalance : 0,
      totalInvoices: entries.filter(entry => entry.transactionType === 'Invoice').length,
      totalPayments: entries.filter(entry => entry.transactionType === 'Payment').length,
      overdueAmount: entries
        .filter(entry => entry.status === 'Overdue')
        .reduce((sum, entry) => sum + entry.runningBalance, 0)
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
