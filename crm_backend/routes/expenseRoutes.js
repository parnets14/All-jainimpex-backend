import express from "express";
import {
  createExpense,
  getExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats,
} from "../controllers/expenseController.js";
import { protect } from "../middleware/authMiddleware.js";
import { uploadSingle, handleUploadErrors } from "../middleware/upload.js";

const router = express.Router();

router
  .route("/")
  .post(protect, uploadSingle("document"), handleUploadErrors, createExpense)
  .get(protect, getExpenses);

router.route("/stats/summary").get(protect, getExpenseStats);

router
  .route("/:id")
  .get(protect, getExpense)
  .put(protect, uploadSingle("document"), handleUploadErrors, updateExpense)
  .delete(protect, deleteExpense);

export default router;