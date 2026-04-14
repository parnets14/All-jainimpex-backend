import { debitNoteSchema } from "../models/DebitNote.js";
import { supplierInvoiceSchema } from "../models/SupplierInvoice.js";
import { supplierSchema } from "../models/Supplier.js";
import { productSchema } from "../models/Product.js";
import { grnSchema } from "../models/GRN.js";
import mongoose from "mongoose";

const getModels = (dbConnection) => {
  return {
    DebitNote: dbConnection.models.DebitNote || dbConnection.model('DebitNote', debitNoteSchema),
    SupplierInvoice: dbConnection.models.SupplierInvoice || dbConnection.model('SupplierInvoice', supplierInvoiceSchema),
    Supplier: dbConnection.models.Supplier || dbConnection.model('Supplier', supplierSchema),
    Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
    GRN: dbConnection.models.GRN || dbConnection.model('GRN', grnSchema)
  };
};

// @desc    Get all debit notes
// @route   GET /api/debit-notes
// @access  Private
export const getDebitNotes = async (req, res) => {
  try {
    const { DebitNote } = getModels(req.dbConnection);
    const {
      page = 1,
      limit = 10,
      status,
      supplier,
      fromDate,
      toDate,
      search
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (supplier) {
      query.supplier = supplier;
    }

    if (fromDate || toDate) {
      query.debitNoteDate = {};
      if (fromDate) {
        query.debitNoteDate.$gte = new Date(fromDate);
      }
      if (toDate) {
        query.debitNoteDate.$lte = new Date(toDate);
      }
    }

    if (search) {
      query.$or = [
        { debitNoteNumber: { $regex: search, $options: "i" } },
        { supplierName: { $regex: search, $options: "i" } },
        { supplierInvoiceNumber: { $regex: search, $options: "i" } },
        { reason: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [debitNotes, totalCount] = await Promise.all([
      DebitNote.find(query)
        .populate("supplier", "name code")
        .populate("supplierInvoice", "invoiceNumber")
        .populate("grn", "grnNo")
        .populate("items.product", "productCode itemName")
        .populate("createdBy", "name email")
        .sort({ debitNoteDate: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      DebitNote.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.json({
      success: true,
      data: debitNotes,
      pagination: {
        currentPage: parseInt(page),
        totalPages: totalPages,
        totalRecords: totalCount,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get Debit Notes Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching debit notes",
      error: error.message
    });
  }
};

// @desc    Get single debit note
// @route   GET /api/debit-notes/:id
// @access  Private
export const getDebitNote = async (req, res) => {
  try {
    const { DebitNote } = getModels(req.dbConnection);
    const debitNote = await DebitNote.findById(req.params.id)
      .populate("supplier")
      .populate("supplierInvoice")
      .populate("grn")
      .populate("items.product")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("rejectedBy", "name email");

    if (!debitNote) {
      return res.status(404).json({
        success: false,
        message: "Debit note not found"
      });
    }

    res.json({
      success: true,
      debitNote
    });
  } catch (error) {
    console.error("Get Debit Note Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching debit note",
      error: error.message
    });
  }
};

// @desc    Create debit note
// @route   POST /api/debit-notes
// @access  Private
export const createDebitNote = async (req, res) => {
  try {
    const { DebitNote, Supplier, SupplierInvoice } = getModels(req.dbConnection);
    const {
      supplierId,
      supplierInvoiceId,
      items,
      reason,
      description,
      remarks,
      status = "Draft"
    } = req.body;

    // Validate required fields
    if (!supplierId || !supplierInvoiceId || !items || !reason) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Get supplier details
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found"
      });
    }

    // Get supplier invoice details
    const supplierInvoice = await SupplierInvoice.findById(supplierInvoiceId)
      .populate("grn")
      .populate("items.product");
    
    if (!supplierInvoice) {
      return res.status(404).json({
        success: false,
        message: "Supplier invoice not found"
      });
    }

    // Generate unique debit note number
    const timestamp = Date.now().toString().slice(-6);
    const debitNoteNumber = `DN-${timestamp}`;

    // Create debit note
    console.log("Creating debit note with items:", items);
    
    const debitNote = new DebitNote({
      debitNoteNumber: debitNoteNumber,
      supplier: supplierId,
      supplierName: supplier.name,
      supplierCode: supplier.code,
      supplierGSTIN: supplier.gstin || "",
      supplierAddress: supplier.address,
      supplierPhone: supplier.phone,
      supplierEmail: supplier.email,

      supplierInvoice: supplierInvoiceId,
      supplierInvoiceNumber: supplierInvoice.invoiceNumber,

      grn: supplierInvoice.grn?._id,
      grnNumber: supplierInvoice.grn?.grnNo,

      items: items.map(item => ({
        product: item.product, // ✅ Use item.product instead of item.productId
        productCode: item.productCode,
        productName: item.productName,
        HSNCode: item.HSNCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        gst: item.gst,
        reason: item.reason
      })),

      reason: reason,
      description: description,
      remarks: remarks,
      status: status,
      createdBy: req.user._id
    });

    console.log("Debit note before save:", {
      items: debitNote.items,
      subtotal: debitNote.subtotal,
      totalGst: debitNote.totalGst,
      totalAmount: debitNote.totalAmount
    });

    await debitNote.save();

    // Populate the created debit note
    const populatedDebitNote = await DebitNote.findById(debitNote._id)
      .populate("supplier")
      .populate("supplierInvoice")
      .populate("grn")
      .populate("items.product")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Debit note created successfully",
      debitNote: populatedDebitNote
    });
  } catch (error) {
    console.error("Create Debit Note Error:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Debit note number already exists"
      });
    }

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
      message: "Error creating debit note",
      error: error.message
    });
  }
};

// @desc    Update debit note
// @route   PUT /api/debit-notes/:id
// @access  Private
export const updateDebitNote = async (req, res) => {
  try {
    const { DebitNote } = getModels(req.dbConnection);
    const { id } = req.params;
    
    // Find the debit note
    const debitNote = await DebitNote.findById(id);
    if (!debitNote) {
      return res.status(404).json({
        success: false,
        message: "Debit note not found"
      });
    }

    // Only allow editing of draft and pending debit notes
    if (!["Draft", "Pending"].includes(debitNote.status)) {
      return res.status(400).json({
        success: false,
        message: "Can only edit draft or pending debit notes"
      });
    }

    // Update the debit note
    console.log("Updating debit note with data:", req.body);
    
    const updatedDebitNote = await DebitNote.findByIdAndUpdate(
      id,
      req.body,
      { 
        new: true, 
        runValidators: true 
      }
    )
      .populate("supplier")
      .populate("supplierInvoice")
      .populate("grn")
      .populate("items.product")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: "Debit note updated successfully",
      debitNote: updatedDebitNote
    });
  } catch (error) {
    console.error("Update Debit Note Error:", error);
    
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
      message: "Error updating debit note",
      error: error.message
    });
  }
};

// @desc    Update debit note status
// @route   PATCH /api/debit-notes/:id/status
// @access  Private
export const updateDebitNoteStatus = async (req, res) => {
  try {
    const { DebitNote } = getModels(req.dbConnection);
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    const debitNote = await DebitNote.findById(id);
    if (!debitNote) {
      return res.status(404).json({
        success: false,
        message: "Debit note not found"
      });
    }

    const updateData = { status };

    if (status === "Approved") {
      updateData.approvedBy = req.user._id;
      updateData.approvedAt = new Date();
    } else if (status === "Rejected") {
      updateData.rejectedBy = req.user._id;
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = rejectionReason;
    }

    const updatedDebitNote = await DebitNote.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    )
      .populate("supplier")
      .populate("supplierInvoice")
      .populate("grn")
      .populate("items.product")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("rejectedBy", "name email");

    res.json({
      success: true,
      message: `Debit note ${status.toLowerCase()} successfully`,
      debitNote: updatedDebitNote
    });
  } catch (error) {
    console.error("Update Debit Note Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating debit note status",
      error: error.message
    });
  }
};

// @desc    Delete debit note
// @route   DELETE /api/debit-notes/:id
// @access  Private
export const deleteDebitNote = async (req, res) => {
  try {
    const { DebitNote } = getModels(req.dbConnection);
    const debitNote = await DebitNote.findById(req.params.id);
    if (!debitNote) {
      return res.status(404).json({
        success: false,
        message: "Debit note not found"
      });
    }

    // Only allow deletion of draft debit notes
    if (debitNote.status !== "Draft") {
      return res.status(400).json({
        success: false,
        message: "Can only delete draft debit notes"
      });
    }

    await DebitNote.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Debit note deleted successfully"
    });
  } catch (error) {
    console.error("Delete Debit Note Error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting debit note",
      error: error.message
    });
  }
};

// @desc    Get debit note statistics
// @route   GET /api/debit-notes/stats/summary
// @access  Private
export const getDebitNoteStats = async (req, res) => {
  try {
    const { DebitNote } = getModels(req.dbConnection);
    const { fromDate, toDate, supplier } = req.query;
    
    const query = {};
    
    if (fromDate || toDate) {
      query.debitNoteDate = {};
      if (fromDate) {
        query.debitNoteDate.$gte = new Date(fromDate);
      }
      if (toDate) {
        query.debitNoteDate.$lte = new Date(toDate);
      }
    }
    
    if (supplier) {
      query.supplier = supplier;
    }

    console.log("Getting debit note stats with query:", query);

    const [
      totalDebitNotes,
      draftDebitNotes,
      pendingDebitNotes,
      approvedDebitNotes,
      rejectedDebitNotes,
      totalAmount
    ] = await Promise.all([
      DebitNote.countDocuments(query),
      DebitNote.countDocuments({ ...query, status: "Draft" }),
      DebitNote.countDocuments({ ...query, status: "Pending" }),
      DebitNote.countDocuments({ ...query, status: "Approved" }),
      DebitNote.countDocuments({ ...query, status: "Rejected" }),
      DebitNote.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } }
      ])
    ]);

    const stats = {
      totalDebitNotes,
      draftDebitNotes,
      pendingDebitNotes,
      approvedDebitNotes,
      rejectedDebitNotes,
      totalAmount: totalAmount[0]?.total || 0
    };

    console.log("Debit note stats:", stats);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error("Get Debit Note Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching debit note statistics",
      error: error.message
    });
  }
};

// @desc    Get available supplier invoices for debit note creation
// @route   GET /api/debit-notes/available-invoices
// @access  Private
export const getAvailableSupplierInvoices = async (req, res) => {
  try {
    const { SupplierInvoice, DebitNote } = getModels(req.dbConnection);
    const { supplier, excludeDebitNoteId } = req.query;
    
    const query = { 
      status: { $in: ["Approved", "Paid", "Pending"] } // Allow pending invoices too for debit notes
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

    // Filter out invoices that already have debit notes, except for the current one being edited
    const availableInvoices = [];
    for (const invoice of invoices) {
      const existingDebitNote = await DebitNote.findOne({ 
        supplierInvoice: invoice._id,
        _id: { $ne: excludeDebitNoteId } // Exclude the current debit note being edited
      });
      if (!existingDebitNote) {
        availableInvoices.push(invoice);
      }
    }

    res.json({
      success: true,
      invoices: availableInvoices
    });
  } catch (error) {
    console.error("Get Available Supplier Invoices Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching available supplier invoices",
      error: error.message
    });
  }
};
