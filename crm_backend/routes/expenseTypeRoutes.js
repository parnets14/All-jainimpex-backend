import express from "express";
import {
  createExpenseType,
  getExpenseTypes,
  updateExpenseType,
  deleteExpenseType,
} from "../controllers/expenseTypeController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router
  .route("/")
  .post(protect, createExpenseType)
  .get(protect, getExpenseTypes);

router
  .route("/:id")
  .put(protect, updateExpenseType)
  .delete(protect, deleteExpenseType);

export default router;