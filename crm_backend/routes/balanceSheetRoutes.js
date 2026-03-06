import express from 'express';
import { 
  generateBalanceSheet, 
  getBalanceSheetComparison,
  exportBalanceSheet 
} from '../controllers/balanceSheetController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Generate balance sheet
router.get('/generate', generateBalanceSheet);

// Get balance sheet comparison
router.get('/comparison', getBalanceSheetComparison);

// Export balance sheet
router.post('/export', exportBalanceSheet);

export default router;
