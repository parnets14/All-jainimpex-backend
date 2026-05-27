import express from "express";
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/expenseCategoryController.js";
import { protect } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

router.get("/getall", protect, logActivity("Expense Category", "Viewed expense categories list", "READ"), getAllCategories);
router.post("/create", protect, logActivity("Expense Category", "Created new expense category", "CREATE"), createCategory);
router.put("/:id", protect, logActivity("Expense Category", "Updated expense category", "UPDATE"), updateCategory);
router.delete("/:id", protect, logActivity("Expense Category", "Deleted expense category", "DELETE"), deleteCategory);

export default router;
