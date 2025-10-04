import express from "express";
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/expenseCategoryController.js";

const router = express.Router();

router.get("/getall", getAllCategories);
router.post("/create", createCategory);
router.put("/:id", updateCategory);
router.delete("/:id", deleteCategory);

export default router;
