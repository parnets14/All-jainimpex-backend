import express from "express";
import {
  createExpenseType,
  getExpenseTypes,
  updateExpenseType,
  deleteExpenseType,
} from "../controllers/expenseTypeController.js";
import { protect } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

router
  .route("/")
  .post(protect, logActivity("Expense Type", "Created new expense type", "CREATE"), createExpenseType)
  .get(protect, logActivity("Expense Type", "Viewed expense types list", "READ"), getExpenseTypes);

router
  .route("/:id")
  .put(protect, logActivity("Expense Type", "Updated expense type", "UPDATE"), updateExpenseType)
  .delete(protect, logActivity("Expense Type", "Deleted expense type", "DELETE"), deleteExpenseType);

export default router;
