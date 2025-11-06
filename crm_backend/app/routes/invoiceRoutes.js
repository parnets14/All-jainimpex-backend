import express from 'express';
import {
  getMyInvoices,
  getInvoiceDetails,
  downloadInvoice
} from '../controllers/invoiceController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { generalLimiter } from '../../middleware/rateLimit.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// All routes are protected
router.use(protect);

// Get dealer's invoices
router.get('/', getMyInvoices);

// Get invoice statistics
router.get('/stats', getMyInvoices);

// Get single invoice details
router.get('/:id', getInvoiceDetails);

// Download invoice PDF
router.get('/:id/download', downloadInvoice);

export default router;



