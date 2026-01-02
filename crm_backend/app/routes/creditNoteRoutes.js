import express from 'express';
import {
  getMyCreditNotes,
  getCreditNoteSummary,
  getCreditNoteDetails
} from '../controllers/creditNoteController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { generalLimiter } from '../../middleware/rateLimit.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// All routes are protected
router.use(protect);

// Get credit note summary (must be before /:id route)
router.get('/summary', getCreditNoteSummary);

// Get dealer's credit notes
router.get('/', getMyCreditNotes);

// Get single credit note details
router.get('/:id', getCreditNoteDetails);

export default router;
