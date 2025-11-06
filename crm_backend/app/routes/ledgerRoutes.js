import express from 'express';
import {
  getMyLedger,
  getLedgerStatement,
  getOutstandingAmount,
  getAgeingBuckets
} from '../controllers/ledgerController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { generalLimiter } from '../../middleware/rateLimit.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// All routes are protected
router.use(protect);

// Get dealer's ledger entries
router.get('/', getMyLedger);

// Get ledger statement (with date range)
router.get('/statement', getLedgerStatement);

// Get outstanding amount summary
router.get('/outstanding', getOutstandingAmount);

// Get ageing buckets
router.get('/ageing', getAgeingBuckets);

export default router;



