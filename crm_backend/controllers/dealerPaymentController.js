import { dealerPaymentSchema } from "../models/DealerPayment.js";
import { dealerLedgerSchema } from "../models/DealerLedger.js";
import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { dealerSchema } from "../models/Dealer.js";
import { assertPeriodOpen, handlePeriodLockError } from "../services/periodLockService.js";
import mongoose from "mongoose";
import { createHash } from "node:crypto";

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

    // App callers are always restricted to the server-resolved dealer.
    const effectiveDealerId = req.authenticatedDealerId || dealer;
    if (effectiveDealerId) {
      finalQuery.dealer = effectiveDealerId;
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
    const paymentQuery = { _id: req.params.id };
    if (req.authenticatedDealerId) {
      paymentQuery.dealer = req.authenticatedDealerId;
    }

    const payment = await DealerPayment.findOne(paymentQuery)
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

const createPaymentError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getIdempotencyKey = (req) => {
  const value = req.get?.("Idempotency-Key")
    || req.headers?.["idempotency-key"]
    || req.body?.idempotencyKey;
  if (value == null || value === "") return null;
  if (typeof value !== "string"
    || value.length < 8
    || value.length > 100
    || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw createPaymentError(400, "Idempotency key must be 8-100 letters, numbers, dots, colons, underscores, or hyphens");
  }
  return value;
};

const canonicalPaymentDate = (value, fieldName) => {
  if (value == null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createPaymentError(400, `${fieldName} must be a valid date`);
  }
  return date.toISOString();
};

const createPaymentFingerprint = ({
  dealerInvoiceId,
  paymentAmount,
  paymentMethod,
  paymentType,
  paymentDate,
  remarks,
  chequeDetails,
  upiDetails,
  bankTransferDetails
}) => {
  const canonicalRequest = {
    dealerInvoiceId: String(dealerInvoiceId || ""),
    paymentAmount: Number(paymentAmount),
    paymentMethod: paymentMethod || null,
    paymentType: paymentType || null,
    paymentDate: canonicalPaymentDate(paymentDate, "Payment date"),
    remarks: remarks || "",
    chequeDetails: paymentMethod === "Cheque" && chequeDetails ? {
      chequeNo: chequeDetails.chequeNo || "",
      bankName: chequeDetails.bankName || "",
      chequeDate: canonicalPaymentDate(chequeDetails.chequeDate, "Cheque date"),
      remarks: chequeDetails.remarks || ""
    } : null,
    upiDetails: paymentMethod === "UPI" && upiDetails ? {
      upiId: upiDetails.upiId || "",
      transactionId: upiDetails.transactionId || "",
      remarks: upiDetails.remarks || ""
    } : null,
    bankTransferDetails: paymentMethod === "Bank Transfer" && bankTransferDetails ? {
      bankName: bankTransferDetails.bankName || "",
      accountNumber: bankTransferDetails.accountNumber || "",
      transactionId: bankTransferDetails.transactionId || "",
      remarks: bankTransferDetails.remarks || ""
    } : null
  };

  return createHash("sha256")
    .update(JSON.stringify(canonicalRequest))
    .digest("hex");
};

const paymentReplayMatches = (payment, fingerprint) => (
  typeof payment.idempotencyFingerprint === "string"
  && payment.idempotencyFingerprint === fingerprint
);

const isDuplicateKeyFor = (error, field) => error?.code === 11000
  && (error?.keyPattern?.[field] || error?.keyValue?.[field] !== undefined);

const runPaymentTransaction = async (dbConnection, work, maxNumberRetries = 3) => {
  for (let attempt = 1; attempt <= maxNumberRetries; attempt += 1) {
    const session = await dbConnection.startSession();
    try {
      return await session.withTransaction(
        () => work(session),
        {
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" }
        }
      );
    } catch (error) {
      if (isDuplicateKeyFor(error, "paymentNumber")) {
        if (attempt < maxNumberRetries) {
          continue;
        }
        throw createPaymentError(409, "Could not reserve a unique payment number; please retry");
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  throw createPaymentError(409, "Could not reserve a unique payment number; please retry");
};

// @desc    Create new dealer payment
// @route   POST /api/dealer-payments
// @access  Private
export const createDealerPayment = async (req, res) => {
  const { DealerPayment, DealerInvoice } = getModels(req.dbConnection);
  let idempotencyKey = null;
  let transactionDealerId = null;

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
      bankTransferDetails
    } = req.body;

    const source = req.paymentOrigin === "App" ? "App" : "Web";
    const isNumericPaymentString = typeof paymentAmount === "string"
      && paymentAmount.trim() !== ""
      && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(paymentAmount.trim());
    const normalizedPaymentAmount = Number(paymentAmount);

    if ((typeof paymentAmount !== "number" && !isNumericPaymentString)
      || !Number.isFinite(normalizedPaymentAmount)
      || normalizedPaymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be a positive number"
      });
    }

    idempotencyKey = getIdempotencyKey(req);
    const paymentFingerprint = createPaymentFingerprint({
      dealerInvoiceId,
      paymentAmount: normalizedPaymentAmount,
      paymentMethod,
      paymentType,
      paymentDate,
      remarks,
      chequeDetails,
      upiDetails,
      bankTransferDetails
    });
    const invoiceQuery = {
      _id: dealerInvoiceId,
      isDraft: false,
      isDeleted: { $ne: true }
    };
    if (req.authenticatedDealerId) {
      invoiceQuery.dealer = req.authenticatedDealerId;
    }

    let transactionResult;
    try {
      transactionResult = await runPaymentTransaction(req.dbConnection, async (session) => {
        if (idempotencyKey) {
          const replayQuery = { source, idempotencyKey };
          if (req.authenticatedDealerId) {
            replayQuery.dealer = req.authenticatedDealerId;
          } else {
            replayQuery.dealerInvoice = dealerInvoiceId;
          }

          const replayPayment = await DealerPayment.findOne(replayQuery).session(session);
          if (replayPayment) {
            if (!paymentReplayMatches(replayPayment, paymentFingerprint)) {
              throw createPaymentError(409, "Idempotency key was already used for a different payment");
            }
            transactionDealerId = replayPayment.dealer;
            return { paymentId: replayPayment._id, replayed: true };
          }
        }

        const invoice = await DealerInvoice.findOne(invoiceQuery)
          .session(session)
          .populate("dealer", "name code");

        if (!invoice) {
          throw createPaymentError(404, "Invoice not found, is a draft, or has been cancelled");
        }

        transactionDealerId = invoice.dealer._id;
        if (idempotencyKey) {
          const existingPayment = await DealerPayment.findOne({
            dealer: transactionDealerId,
            source,
            idempotencyKey
          }).session(session);

          if (existingPayment) {
            if (!paymentReplayMatches(existingPayment, paymentFingerprint)) {
              throw createPaymentError(409, "Idempotency key was already used for a different payment");
            }
            return { paymentId: existingPayment._id, replayed: true };
          }
        }

        await assertPeriodOpen(req.dbConnection, paymentDate || Date.now(), "dealer payment");

        const invoiceTotal = Number(invoice.totalAmount);
        const paidAmount = Number(invoice.paidAmount ?? 0);
        if (!Number.isFinite(invoiceTotal) || invoiceTotal < 0
          || !Number.isFinite(paidAmount) || paidAmount < 0
          || paidAmount > invoiceTotal) {
          throw createPaymentError(400, "Invoice has invalid payment totals");
        }

        const remainingAmount = invoiceTotal - paidAmount;
        if (normalizedPaymentAmount > remainingAmount + 0.01) {
          throw createPaymentError(
            409,
            `Payment amount cannot exceed remaining amount of ₹${remainingAmount.toLocaleString()}`
          );
        }

        const paymentData = {
          dealerInvoice: dealerInvoiceId,
          dealer: transactionDealerId,
          paymentDate: new Date(paymentDate || Date.now()),
          paymentAmount: normalizedPaymentAmount,
          paymentMethod,
          paymentType,
          status: source === "App" ? "Approved" : "Pending",
          remarks: remarks || "",
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmount: invoiceTotal,
          remainingAmount: Math.max(0, remainingAmount - normalizedPaymentAmount),
          source,
          idempotencyKey: idempotencyKey || undefined,
          idempotencyFingerprint: idempotencyKey ? paymentFingerprint : undefined,
          createdBy: req.user._id,
          ...(source === "App" ? {
            approvedBy: req.user._id,
            approvedAt: new Date()
          } : {})
        };

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
        await payment.save({ session });

        if (source === "App") {
          await updateInvoiceAndLedger(
            payment,
            invoice,
            req.user._id,
            req.dbConnection,
            session
          );
        }

        return { paymentId: payment._id, replayed: false };
      });
    } catch (error) {
      if (idempotencyKey
        && transactionDealerId
        && isDuplicateKeyFor(error, "idempotencyKey")) {
        const existingPayment = await DealerPayment.findOne({
          dealer: transactionDealerId,
          source,
          idempotencyKey
        });
        if (existingPayment && paymentReplayMatches(existingPayment, paymentFingerprint)) {
          transactionResult = { paymentId: existingPayment._id, replayed: true };
        } else {
          throw createPaymentError(409, "Idempotency key was already used for a different payment");
        }
      } else {
        throw error;
      }
    }

    const populatedPayment = await DealerPayment.findById(transactionResult.paymentId)
      .populate("dealer", "name code companyName")
      .populate("dealerInvoice", "invoiceNumber totalAmount")
      .populate("createdBy", "name email");

    return res.status(transactionResult.replayed ? 200 : 201).json({
      success: true,
      replayed: transactionResult.replayed,
      message: transactionResult.replayed
        ? "Payment already created; returning the original result"
        : "Payment created successfully",
      payment: populatedPayment
    });
  } catch (error) {
    if (handlePeriodLockError(error, res)) return;
    console.error("Create Dealer Payment Error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Error creating dealer payment",
      error: error.message
    });
  }
};

// @desc    Update dealer payment status
// @route   PUT /api/dealer-payments/:id/status
// @access  Private
export const updateDealerPaymentStatus = async (req, res) => (
  updateDealerPaymentStatusWithAdvance(req, res)
);

// Helper function to update invoice and create ledger entry
async function updateInvoiceAndLedger(payment, invoice, userId, dbConnection, session = null) {
  const { Dealer, DealerLedger } = getModels(dbConnection);

  const invoiceTotal = Number(invoice.totalAmount);
  const currentPaidAmount = Number(invoice.paidAmount ?? 0);
  const paymentAmount = Number(payment.paymentAmount);
  const TOLERANCE = 0.01;

  if (!Number.isFinite(invoiceTotal) || invoiceTotal < 0
    || !Number.isFinite(currentPaidAmount) || currentPaidAmount < 0
    || !Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    const error = new Error("Invoice or payment has invalid totals");
    error.statusCode = 400;
    throw error;
  }

  const resultingPaidAmount = currentPaidAmount + paymentAmount;
  if (resultingPaidAmount > invoiceTotal + TOLERANCE) {
    const error = new Error("Payment exceeds the Invoice's remaining amount");
    error.statusCode = 409;
    throw error;
  }

  const remainingAmount = invoiceTotal - resultingPaidAmount;
  if (remainingAmount <= TOLERANCE) {
    invoice.paidAmount = invoiceTotal;
    invoice.pendingAmount = 0;
    invoice.paymentStatus = "Paid";
  } else {
    invoice.paidAmount = resultingPaidAmount;
    invoice.pendingAmount = remainingAmount;
    invoice.paymentStatus = "Partial";
  }
  invoice.paymentDate = payment.paymentDate;

  await invoice.save(session ? { session } : undefined);

  // Force concurrent ledger postings for the same dealer to conflict and retry.
  if (session) {
    const dealerLock = await Dealer.updateOne(
      { _id: payment.dealer },
      { $inc: { ledgerPostingVersion: 1 } },
      { session }
    );
    if (dealerLock.matchedCount !== 1) {
      throw createPaymentError(404, "Dealer not found while posting payment ledger");
    }
  }

  const ledgerEntry = new DealerLedger({
    dealer: payment.dealer,
    dealerName: invoice.dealer.name,
    dealerCode: invoice.dealer.code,
    entryDate: payment.paymentDate,
    transactionType: "Payment",
    dealerPayment: payment._id,
    invoice: payment.dealerInvoice,
    invoiceNumber: payment.invoiceNumber,
    invoiceValue: payment.invoiceAmount,
    paymentReceived: paymentAmount,
    paymentMethod: payment.paymentMethod,
    chequeDetails: payment.chequeDetails,
    upiDetails: payment.upiDetails,
    bankTransferDetails: payment.bankTransferDetails,
    debitAmount: 0,
    creditAmount: paymentAmount,
    runningBalance: 0,
    description: `Payment ${payment.paymentNumber} for Invoice ${payment.invoiceNumber}`,
    remarks: payment.remarks,
    createdBy: userId
  });

  await ledgerEntry.save(session ? { session } : undefined);
  console.log(`Created dealer ledger entry for payment: ${payment.paymentNumber}`);
}

// @desc    Get available invoices for payment
// @route   GET /api/dealer-payments/available-invoices
// @access  Private
export const getAvailableInvoicesForPayment = async (req, res) => {
  const { DealerInvoice } = getModels(req.dbConnection);
  try {
    const { dealer, page = 1, limit = 50, search } = req.query;
    const effectiveDealerId = req.authenticatedDealerId || dealer;
    
    console.log('🔍 Fetching available invoices for payment, dealer:', effectiveDealerId, 'page:', page, 'limit:', limit);
    
    // Show all approved invoices - no drafts
    const query = {
      isDraft: false, // Exclude draft invoices
      isDeleted: { $ne: true } // Exclude cancelled invoices
    };
    
    if (effectiveDealerId) {
      query.dealer = effectiveDealerId;
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
    const payment = await DealerPayment.findOneAndDelete({
      _id: req.params.id,
      status: "Pending"
    });
    
    if (!payment) {
      const existingPayment = await DealerPayment.findById(req.params.id).select("status");
      if (!existingPayment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found"
        });
      }
      return res.status(409).json({
        success: false,
        message: `Payment is already ${existingPayment.status.toLowerCase()} and cannot be deleted`
      });
    }

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
      bankTransferDetails
    } = req.body;
    const source = req.paymentOrigin === "App" ? "App" : "Web";

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
async function processAdvancePayment(payment, dealer, userId, dbConnection, session = null) {
  const { Dealer, DealerLedger } = getModels(dbConnection);

  await Dealer.findByIdAndUpdate(
    dealer._id,
    {
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
    },
    session ? { session } : undefined
  );

  const ledgerEntry = new DealerLedger({
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    entryDate: payment.paymentDate,
    transactionType: "Advance Payment",
    dealerPayment: payment._id,
    paymentReceived: payment.paymentAmount,
    paymentMethod: payment.paymentMethod,
    chequeDetails: payment.chequeDetails,
    upiDetails: payment.upiDetails,
    bankTransferDetails: payment.bankTransferDetails,
    debitAmount: 0,
    creditAmount: payment.paymentAmount,
    runningBalance: 0,
    description: `Advance payment ${payment.paymentNumber}`,
    remarks: payment.remarks,
    advanceDetails: {
      isAdvance: true,
      advancePaymentId: payment._id
    },
    createdBy: userId
  });

  await ledgerEntry.save(session ? { session } : undefined);
  console.log(`Created advance payment ledger entry: ${payment.paymentNumber}`);
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
  const { DealerPayment, Dealer, DealerInvoice } = getModels(req.dbConnection);

  try {
    const { status, rejectionReason } = req.body;
    const paymentId = req.params.id;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Approved or Rejected"
      });
    }

    const result = await runPaymentTransaction(req.dbConnection, async (session) => {
      const payment = await DealerPayment.findById(paymentId).session(session);
      if (!payment) {
        throw createPaymentError(404, "Payment not found");
      }
      if (payment.status !== "Pending") {
        throw createPaymentError(
          409,
          `Payment is already ${payment.status.toLowerCase()} and cannot be processed again`
        );
      }

      await assertPeriodOpen(req.dbConnection, payment.paymentDate, "dealer payment approval");

      if (status === "Approved") {
        if (payment.paymentCategory === "Advance Payment") {
          const dealer = await Dealer.findById(payment.dealer).session(session);
          if (!dealer) {
            throw createPaymentError(404, "Dealer not found for advance payment");
          }
          await processAdvancePayment(
            payment,
            dealer,
            req.user._id,
            req.dbConnection,
            session
          );
        } else {
          const invoice = await DealerInvoice.findOne({
            _id: payment.dealerInvoice,
            dealer: payment.dealer,
            isDraft: false,
            isDeleted: { $ne: true }
          })
            .session(session)
            .populate("dealer", "name code");

          if (!invoice) {
            throw createPaymentError(404, "Invoice not found, is a draft, or has been cancelled");
          }

          await updateInvoiceAndLedger(
            payment,
            invoice,
            req.user._id,
            req.dbConnection,
            session
          );
        }

        payment.status = "Approved";
        payment.approvedBy = req.user._id;
        payment.approvedAt = new Date();
      } else {
        payment.status = "Rejected";
        payment.rejectedBy = req.user._id;
        payment.rejectedAt = new Date();
        payment.rejectionReason = rejectionReason || "";
      }

      await payment.save({ session });
      return { paymentId: payment._id };
    });

    const updatedPayment = await DealerPayment.findById(result.paymentId)
      .populate("dealer", "name code companyName")
      .populate("dealerInvoice", "invoiceNumber totalAmount paymentStatus")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("rejectedBy", "name email");

    return res.json({
      success: true,
      message: `Payment ${status.toLowerCase()} successfully`,
      payment: updatedPayment
    });
  } catch (error) {
    if (handlePeriodLockError(error, res)) return;
    console.error("Update Dealer Payment Status Error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Error updating payment status",
      error: error.message
    });
  }
};
