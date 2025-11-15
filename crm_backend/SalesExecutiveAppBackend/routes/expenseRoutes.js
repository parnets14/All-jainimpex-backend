import express from 'express';
import {
  createExpense,
  getMyExpenses,
  getExpenseDetails,
  getExpenseTypes,
  getMyExpenseStats
} from '../controllers/expenseController.js';
import protect from '../middleware/protect.js';
import { uploadSingle, handleUploadErrors } from '../middleware/upload.js';

const router = express.Router();

// Expense routes
// IMPORTANT: Specific routes must come before parameterized routes
router.get('/types', protect, getExpenseTypes);
router.get('/stats', protect, getMyExpenseStats);
router.post('/', protect, uploadSingle('document'), handleUploadErrors, createExpense);
router.get('/', protect, getMyExpenses);
router.get('/:id', protect, getExpenseDetails);

export default router;
