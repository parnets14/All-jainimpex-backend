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
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

router
  .route("/")
  .post(protect, uploadSingle("document"), handleUploadErrors, logActivity("Expense Management", "Created new expense", "CREATE"), createExpense)
  .get(protect, logActivity("Expense Management", "Viewed expenses list", "READ"), getExpenses);

router.route("/stats/summary").get(protect, logActivity("Expense Management", "Viewed expense statistics", "READ"), getExpenseStats);

router
  .route("/:id")
  .get(protect, logActivity("Expense Management", "Viewed expense details", "READ"), getExpense)
  .put(protect, uploadSingle("document"), handleUploadErrors, logActivity("Expense Management", "Updated expense", "UPDATE"), updateExpense)
  .delete(protect, logActivity("Expense Management", "Deleted expense", "DELETE"), deleteExpense);

export default router;
