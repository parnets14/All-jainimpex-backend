import express from 'express';
import {
  getMyInvoices,
  getInvoiceDetails,
  downloadInvoice,
  viewInvoiceHTML,
} from '../controllers/invoiceController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { generalLimiter } from '../../middleware/rateLimit.js';

const router = express.Router();

router.use(generalLimiter);
router.use(protect);

router.get('/', getMyInvoices);
router.get('/stats', getMyInvoices);
router.get('/:id', getInvoiceDetails);
router.get('/:id/download', downloadInvoice);
// Returns full HTML invoice (same as web) — opened in device browser
router.get('/:id/view', viewInvoiceHTML);

export default router;



