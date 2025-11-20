import DeliveryPayment from '../models/DeliveryPayment.js';
import DeliveryAssignment from '../models/DeliveryAssignment.js';
import SalesOrder from '../../models/SalesOrder.js';
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
    const uploadDir = path.join(__dirname, '../../../uploads/payments');
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

    // Create payment record
    const payment = new DeliveryPayment({
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
    });

    await payment.save();

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: payment,
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message,
    });
  }
};

// Get today's payments
export const getTodayPayments = async (req, res) => {
  try {
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

// Get all collections (Admin - Web CRM)
export const getAllCollections = async (req, res) => {
  try {
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


