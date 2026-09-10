import DeliveryPayment from '../models/DeliveryPayment.js';
import DeliveryAssignment from '../models/DeliveryAssignment.js';
import SalesOrder from '../../models/SalesOrder.js';
import { dealerInvoiceSchema } from '../../models/DealerInvoice.js';
import { postDealerReceipt, createReceiptError } from '../../services/dealerReceiptService.js';
import { allocateVoucherBatch } from '../../controllers/paymentAllocationController.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/payments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const prefix = file.fieldname === 'upiScreenshot' ? 'upi' : 
                   file.fieldname === 'accountScreenshot' ? 'account' : 'payment';
    cb(null, `${prefix}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, jpg, png) and PDF files are allowed'));
    }
  }
});

export const uploadPaymentFiles = upload.fields([
  { name: 'receiptImage', maxCount: 1 },
  { name: 'chequeImages', maxCount: 5 },
  { name: 'upiScreenshot', maxCount: 1 },
  { name: 'accountScreenshot', maxCount: 1 }
]);

// Create payment collection
export const createPayment = async (req, res) => {
  try {
    const { DeliveryPayment, DeliveryAssignment, db } = req.deModels;
    const { 
      deliveryAssignment, 
      dealer, 
      salesOrder, 
      paymentMode, 
      cashAmount,
      chequeDetails,
      notes 
    } = req.body;

    const executiveId = req.user.userId || req.user._id;

    // Validate required fields
    if (!deliveryAssignment || !dealer || !salesOrder || !paymentMode) {
      return res.status(400).json({
        success: false,
        message: 'Delivery assignment, dealer, sales order, and payment mode are required',
      });
    }

    // Validate assignment exists and belongs to executive
    const assignment = await DeliveryAssignment.findById(deliveryAssignment);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Delivery assignment not found',
      });
    }

    if (assignment.deliveryExecutive.toString() !== executiveId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to create payment for this assignment',
      });
    }
    if (assignment.status !== 'delivered') {
      return res.status(409).json({ success: false, message: 'Payment can only be collected after delivery' });
    }
    if (String(assignment.dealer) !== String(dealer)
      || String(assignment.salesOrder) !== String(salesOrder)) {
      return res.status(409).json({
        success: false,
        message: 'Dealer or Sales Order does not match the delivery assignment',
      });
    }
    if (assignment.paymentCollected
      || await DeliveryPayment.exists({ deliveryAssignment, verificationStatus: { $in: ['pending', 'verified'] } })) {
      return res.status(409).json({ success: false, message: 'Payment was already recorded for this delivery' });
    }

    // Parse cheque details if provided
    let parsedChequeDetails = [];
    if (chequeDetails) {
      try {
        parsedChequeDetails = typeof chequeDetails === 'string' 
          ? JSON.parse(chequeDetails) 
          : chequeDetails;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid cheque details format',
        });
      }
    }

    // Handle file uploads
    const receiptImage = req.files?.receiptImage?.[0] 
      ? `/uploads/payments/${req.files.receiptImage[0].filename}` 
      : null;

    // Handle cheque images
    const chequeImages = req.files?.chequeImages || [];
    if (parsedChequeDetails.length > 0 && chequeImages.length > 0) {
      parsedChequeDetails.forEach((cheque, index) => {
        if (chequeImages[index]) {
          cheque.chequeImage = `/uploads/payments/${chequeImages[index].filename}`;
        }
      });
    }

    // Parse UPI details if provided
    let parsedUpiDetails = null;
    if (req.body.upiDetails) {
      try {
        parsedUpiDetails = typeof req.body.upiDetails === 'string' 
          ? JSON.parse(req.body.upiDetails) 
          : req.body.upiDetails;
        
        // Add screenshot URL if uploaded
        if (req.files?.upiScreenshot?.[0]) {
          parsedUpiDetails.screenshot = `/uploads/payments/${req.files.upiScreenshot[0].filename}`;
        }
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid UPI details format',
        });
      }
    }

    // Parse Account details if provided
    let parsedAccountDetails = null;
    if (req.body.accountDetails) {
      try {
        parsedAccountDetails = typeof req.body.accountDetails === 'string' 
          ? JSON.parse(req.body.accountDetails) 
          : req.body.accountDetails;
        
        // Add screenshot URL if uploaded
        if (req.files?.accountScreenshot?.[0]) {
          parsedAccountDetails.screenshot = `/uploads/payments/${req.files.accountScreenshot[0].filename}`;
        }
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid account details format',
        });
      }
    }

    // Calculate total amount
    const cashTotal = parseFloat(cashAmount || 0);
    const chequeTotal = parsedChequeDetails.reduce((sum, cheque) => 
      sum + parseFloat(cheque.amount || 0), 0);
    const upiTotal = parsedUpiDetails ? parseFloat(parsedUpiDetails.amount || 0) : 0;
    const accountTotal = parsedAccountDetails ? parseFloat(parsedAccountDetails.amount || 0) : 0;
    const totalAmount = cashTotal + chequeTotal + upiTotal + accountTotal;

    if (totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Total payment amount must be greater than 0',
      });
    }

    // Validate payment mode
    if (paymentMode === 'cash' && cashTotal <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cash amount is required for cash payment',
      });
    }

    if (paymentMode === 'cheque' && parsedChequeDetails.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cheque details are required for cheque payment',
      });
    }

    if (paymentMode === 'upi' && (!parsedUpiDetails || !parsedUpiDetails.transactionId || !parsedUpiDetails.amount)) {
      return res.status(400).json({
        success: false,
        message: 'UPI transaction details are required for UPI payment',
      });
    }

    if (paymentMode === 'account' && (!parsedAccountDetails || !parsedAccountDetails.transactionId || !parsedAccountDetails.amount)) {
      return res.status(400).json({
        success: false,
        message: 'Account transfer details are required for account payment',
      });
    }

    if (paymentMode === 'mixed') {
      let hasPayment = false;
      if (cashTotal > 0) hasPayment = true;
      if (parsedChequeDetails.length > 0) hasPayment = true;
      if (parsedUpiDetails && parsedUpiDetails.amount > 0) hasPayment = true;
      if (parsedAccountDetails && parsedAccountDetails.amount > 0) hasPayment = true;
      
      if (!hasPayment) {
        return res.status(400).json({
          success: false,
          message: 'At least one payment method is required for mixed payment',
        });
      }
    }

    const paymentData = {
      deliveryAssignment,
      deliveryExecutive: executiveId,
      dealer,
      salesOrder,
      paymentMode,
      cashAmount: cashTotal,
      chequeDetails: parsedChequeDetails,
      upiDetails: parsedUpiDetails,
      accountDetails: parsedAccountDetails,
      totalAmount,
      receiptImage,
      notes,
      verificationStatus: 'pending'
    };

    const session = await db.startSession();
    let paymentId;
    try {
      await session.withTransaction(async () => {
        const existingPayment = await DeliveryPayment.exists({
          deliveryAssignment,
          verificationStatus: { $in: ['pending', 'verified'] },
        }).session(session);
        if (existingPayment) {
          throw createReceiptError(409, 'Payment was already recorded for this delivery');
        }

        const claim = await DeliveryAssignment.updateOne({
          _id: deliveryAssignment,
          deliveryExecutive: executiveId,
          dealer,
          salesOrder,
          status: 'delivered',
          paymentCollected: { $ne: true },
        }, {
          $set: {
            paymentCollected: true,
            paymentCollectedAt: new Date(),
          },
          $unset: {
            paymentSkippedAt: 1,
            paymentSkipReason: 1,
          },
        }, { session });
        if (claim.matchedCount !== 1) {
          throw createReceiptError(409, 'This delivery payment was already claimed or the assignment changed');
        }

        const [payment] = await DeliveryPayment.create([paymentData], { session });
        paymentId = payment._id;
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
    } finally {
      await session.endSession();
    }

    const payment = await DeliveryPayment.findById(paymentId);
    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: payment,
    });
  } catch (error) {
    console.error('Create payment error:', error);
    const duplicateClaim = error?.code === 11000
      && (error?.keyPattern?.deliveryAssignment || error?.keyValue?.deliveryAssignment);
    const statusCode = duplicateClaim ? 409 : (error.statusCode || 500);
    res.status(statusCode).json({
      success: false,
      message: duplicateClaim
        ? 'Payment was already recorded for this delivery'
        : error.statusCode
          ? error.message
          : 'Failed to record payment',
      error: error.message,
    });
  }
};

// Get today's payments
export const getTodayPayments = async (req, res) => {
  try {
    const { DeliveryPayment } = req.deModels;
    const executiveId = req.user.userId || req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const payments = await DeliveryPayment.find({
      deliveryExecutive: executiveId,
      collectedAt: {
        $gte: today,
        $lt: tomorrow
      }
    })
      .populate('deliveryAssignment', 'status deliverySequence')
      .populate('dealer', 'name phone')
      .populate('salesOrder', 'orderNumber totalAmount')
      .sort({ collectedAt: -1 })
      .lean();

    // Calculate totals
    const totalCash = payments.reduce((sum, p) => sum + (p.cashAmount || 0), 0);
    const totalCheque = payments.reduce((sum, p) => 
      sum + (p.chequeDetails?.reduce((s, c) => s + (c.amount || 0), 0) || 0), 0);
    const totalAmount = payments.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

    res.json({
      success: true,
      data: payments,
      summary: {
        totalPayments: payments.length,
        totalCash,
        totalCheque,
        totalAmount
      }
    });
  } catch (error) {
    console.error('Get today payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error.message,
    });
  }
};

// Get payment history
export const getPaymentHistory = async (req, res) => {
  try {
    const { DeliveryPayment } = req.deModels;
    const executiveId = req.user.userId || req.user._id;
    const { page = 1, limit = 20, startDate, endDate } = req.query;

    const query = { deliveryExecutive: executiveId };

    if (startDate || endDate) {
      query.collectedAt = {};
      if (startDate) {
        query.collectedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.collectedAt.$lte = end;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [payments, total] = await Promise.all([
      DeliveryPayment.find(query)
        .populate('deliveryAssignment', 'status deliverySequence')
        .populate('dealer', 'name phone')
        .populate('salesOrder', 'orderNumber totalAmount')
        .sort({ collectedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      DeliveryPayment.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
      error: error.message,
    });
  }
};

// Get payment by ID
export const getPaymentById = async (req, res) => {
  try {
    const { DeliveryPayment } = req.deModels;
    const { paymentId } = req.params;
    const executiveId = req.user?.userId || req.user?._id;

    const query = { _id: paymentId };
    if (executiveId) {
      query.deliveryExecutive = executiveId;
    }

    const payment = await DeliveryPayment.findOne(query)
      .populate('deliveryAssignment')
      .populate('deliveryExecutive', 'name empId phone')
      .populate('dealer', 'name code phone address')
      .populate('salesOrder', 'orderNumber totalAmount orderDate')
      .populate('verifiedBy', 'name')
      .lean();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error('Get payment by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment',
      error: error.message,
    });
  }
};

// Verify payment (Admin - Web CRM)
export const verifyPayment = async (req, res) => {
  try {
    const { DeliveryPayment, DeliveryAssignment, db } = req.deModels;
    const DealerInvoice = db.models.DealerInvoice || db.model('DealerInvoice', dealerInvoiceSchema);
    const { paymentId } = req.params;
    const { verificationStatus, verificationNotes, bankAccount } = req.body;
    const verifierId = req.user?.userId || req.user?._id;

    if (!verifierId) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!['verified', 'rejected'].includes(verificationStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification status. Must be "verified" or "rejected"',
      });
    }

    const session = await db.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const payment = await DeliveryPayment.findById(paymentId).session(session);
        if (!payment) throw createReceiptError(404, 'Payment not found');

        if (payment.verificationStatus === 'verified'
          && verificationStatus === 'verified'
          && payment.receiptVoucherIds?.length) {
          result = { paymentId: payment._id, replayed: true };
          return;
        }
        if (payment.verificationStatus !== 'pending') {
          throw createReceiptError(
            409,
            `Payment is already ${payment.verificationStatus} and cannot be processed again`
          );
        }

        if (verificationStatus === 'rejected') {
          payment.verificationStatus = 'rejected';
          payment.verifiedBy = verifierId;
          payment.verifiedAt = new Date();
          payment.verificationNotes = verificationNotes || '';
          await payment.save({ session });
          await DeliveryAssignment.updateOne(
            { _id: payment.deliveryAssignment },
            {
              $set: { paymentCollected: false, paymentCollectedAt: null },
              $unset: { paymentSkippedAt: 1, paymentSkipReason: 1 },
            },
            { session }
          );
          result = { paymentId: payment._id, replayed: false };
          return;
        }

        const tenders = [];
        if (Number(payment.cashAmount || 0) > 0) {
          tenders.push({ mode: 'Cash', amount: payment.cashAmount, date: payment.collectedAt });
        }
        for (const cheque of payment.chequeDetails || []) {
          if (Number(cheque.amount || 0) <= 0) continue;
          tenders.push({
            mode: 'Cheque',
            amount: cheque.amount,
            date: payment.collectedAt,
            cheque: {
              chequeNo: cheque.chequeNumber,
              chequeDate: cheque.chequeDate,
              bankName: cheque.bankName,
              image: cheque.chequeImage,
            },
          });
        }
        if (Number(payment.upiDetails?.amount || 0) > 0) {
          tenders.push({
            mode: 'UPI',
            amount: payment.upiDetails.amount,
            date: payment.collectedAt,
            bankAccountId: bankAccount || null,
            transactionId: payment.upiDetails.transactionId,
            upiTransactionId: payment.upiDetails.transactionId,
          });
        }
        if (Number(payment.accountDetails?.amount || 0) > 0) {
          tenders.push({
            mode: 'Bank',
            amount: payment.accountDetails.amount,
            date: payment.collectedAt,
            bankAccountId: bankAccount || null,
            transactionId: payment.accountDetails.transactionId,
          });
        }

        const receipt = await postDealerReceipt({
          dbConnection: db,
          dealerId: payment.dealer,
          receiptDate: payment.collectedAt,
          sourceType: 'DeliveryPayment',
          sourceId: payment._id,
          tenders,
          actorId: verifierId,
          narration: payment.notes || `Delivery collection ${payment._id}`,
          notes: verificationNotes || '',
        }, { session });

        // A Delivery payment is allocated only when the Sales Order resolves to
        // exactly one active invoice. Ambiguous/no-invoice receipts stay on account.
        const invoiceCandidates = await DealerInvoice.find({
          salesOrder: payment.salesOrder,
          dealer: payment.dealer,
          status: 'Approved',
          isDraft: { $ne: true },
          isDeleted: { $ne: true },
          paymentStatus: { $ne: 'Paid' },
        }).session(session);
        if (invoiceCandidates.length === 1) {
          const invoice = invoiceCandidates[0];
          let invoiceRemaining = Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount || 0));
          for (const voucher of receipt.vouchers) {
            if (invoiceRemaining <= 0) break;
            const amount = Math.min(invoiceRemaining, Number(voucher.totalAmount));
            if (amount <= 0) continue;
            await allocateVoucherBatch({
              dbConnection: db,
              voucherId: voucher._id,
              rows: [{ targetType: 'Invoice', invoiceId: invoice._id, allocatedAmount: amount }],
              userId: verifierId,
              notes: `Delivery payment allocated to ${invoice.invoiceNumber}`,
              expectedPartyId: payment.dealer,
              expectedPartyType: 'Dealer',
              expectedVoucherType: 'Receipt',
              staleStateStatus: 409,
            }, { session });
            invoiceRemaining -= amount;
          }
        }

        payment.receiptVoucherIds = receipt.vouchers.map((voucher) => voucher._id);
        payment.receiptPostedAt = payment.receiptPostedAt || new Date();
        payment.verificationStatus = 'verified';
        payment.verifiedBy = verifierId;
        payment.verifiedAt = new Date();
        payment.verificationNotes = verificationNotes || '';
        await payment.save({ session });
        result = { paymentId: payment._id, replayed: receipt.replayed };
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
    } finally {
      await session.endSession();
    }

    const payment = await DeliveryPayment.findById(result.paymentId).populate('verifiedBy', 'name');
    return res.json({
      success: true,
      replayed: result.replayed,
      message: result.replayed ? 'Payment was already verified' : `Payment ${verificationStatus} successfully`,
      data: payment,
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Failed to verify payment',
      error: error.message,
    });
  }
};

// Get all collections (Admin - Web CRM)
export const getAllCollections = async (req, res) => {
  try {
    const { DeliveryPayment } = req.deModels;
    const { 
      deliveryExecutive, 
      dealer,
      verificationStatus,
      startDate, 
      endDate,
      page = 1,
      limit = 20,
      search
    } = req.query;

    const query = {};

    if (deliveryExecutive) {
      query.deliveryExecutive = deliveryExecutive;
    }

    if (dealer) {
      query.dealer = dealer;
    }

    if (verificationStatus) {
      query.verificationStatus = verificationStatus;
    }

    if (startDate || endDate) {
      query.collectedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.collectedAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.collectedAt.$lte = end;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let payments = await DeliveryPayment.find(query)
      .populate('deliveryExecutive', 'name empId phone')
      .populate('dealer', 'name code phone address')
      .populate('salesOrder', 'orderNumber totalAmount orderDate')
      .populate('deliveryAssignment', 'status deliverySequence')
      .populate('verifiedBy', 'name')
      .sort({ collectedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      payments = payments.filter(payment => 
        payment.salesOrder?.orderNumber?.toLowerCase().includes(searchLower) ||
        payment.dealer?.name?.toLowerCase().includes(searchLower) ||
        payment.dealer?.code?.toLowerCase().includes(searchLower) ||
        payment.deliveryExecutive?.name?.toLowerCase().includes(searchLower)
      );
    }

    const total = await DeliveryPayment.countDocuments(query);

    // Calculate summary
    const totalCash = payments.reduce((sum, p) => sum + (p.cashAmount || 0), 0);
    const totalCheque = payments.reduce((sum, p) => 
      sum + (p.chequeDetails?.reduce((s, c) => s + (c.amount || 0), 0) || 0), 0);
    const totalAmount = payments.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

    res.json({
      success: true,
      data: payments,
      summary: {
        totalCash,
        totalCheque,
        totalAmount,
        totalPayments: payments.length
      },
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get all collections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch collections',
      error: error.message,
    });
  }
};


