import express from 'express';
import {
  createDealerPayment,
  getDealerPayment,
  getAvailableInvoicesForPayment,
  getDealerPayments
} from '../../controllers/dealerPaymentController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { generalLimiter } from '../../middleware/rateLimit.js';
import Dealer from '../../models/Dealer.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// All routes are protected
router.use(protect);

// Get dealer's payments (for app - only their own payments)
router.get('/', async (req, res) => {
  try {
    // Get dealer by username (dealer code) - same as invoice routes
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;

    // Call the main controller but filter by dealer
    req.query.dealer = dealerId;
    return getDealerPayments(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching payments',
      error: error.message
    });
  }
});

// Get available invoices for payment (for the logged-in dealer)
router.get('/available-invoices', async (req, res) => {
  try {
    // Get dealer by username (dealer code) - same as invoice routes
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;

    // Filter by dealer
    req.query.dealer = dealerId;
    return getAvailableInvoicesForPayment(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching available invoices',
      error: error.message
    });
  }
});

// Create payment (from app - auto-approved)
router.post('/', async (req, res) => {
  try {
    // Set source to App and auto-approve
    req.body.source = 'App';
    return createDealerPayment(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating payment',
      error: error.message
    });
  }
});

// Get single payment details
router.get('/:id', getDealerPayment);

export default router;

