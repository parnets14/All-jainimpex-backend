import express from "express";
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/expenseCategoryController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/getall", protect, getAllCategories);
router.post("/create", protect, createCategory);
router.put("/:id", protect, updateCategory);
router.delete("/:id", protect, deleteCategory);

export default router;
