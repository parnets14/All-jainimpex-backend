import express from 'express';
import {
  createDealerPayment,
  getDealerPayment,
  getAvailableInvoicesForPayment,
  getDealerPayments
} from '../../controllers/dealerPaymentController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { generalLimiter } from '../../middleware/rateLimit.js';
import { dealerSchema } from '../../models/Dealer.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// All routes are protected
router.use(protect);

// Bind every app payment request to the authenticated dealer in the company database.
const bindAuthenticatedDealer = async (req, res, next) => {
  try {
    if (req.user?.role !== 'dealer') {
      return res.status(403).json({
        success: false,
        message: 'Dealer access required'
      });
    }

    const Dealer = req.dbConnection.models.Dealer
      || req.dbConnection.model('Dealer', dealerSchema);
    const dealer = await Dealer.findOne({ code: req.user.username }).select('_id');

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    req.authenticatedDealerId = dealer._id;
    req.paymentOrigin = 'App';
    next();
  } catch (error) {
    console.error('Bind Authenticated Dealer Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating dealer access'
    });
  }
};

router.use(bindAuthenticatedDealer);

// Get only the authenticated dealer's payments.
router.get('/', getDealerPayments);

// Get only the authenticated dealer's available invoices.
router.get('/available-invoices', getAvailableInvoicesForPayment);

// App origin and dealer ownership are derived from trusted server context.
router.post('/', createDealerPayment);

// Get one payment only when it belongs to the authenticated dealer.
router.get('/:id', getDealerPayment);

export default router;
