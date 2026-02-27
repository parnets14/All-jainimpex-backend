import express from "express";
import {
  getSubcategories,
  updateSubcategory,
  deleteSubcategory,
  changeSubcategoryParent,
  getSubcategoryParentChangePreview,
} from "../controllers/subcategoryController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Subcategory routes - READ operations (no permission check)
router.get("/", getSubcategories);
router.get("/:id/change-parent-preview", getSubcategoryParentChangePreview);

// Subcategory WRITE operations (require permissions)
router.put(
  "/:id/change-parent",
  requirePermission("categories.update"),
  changeSubcategoryParent
);
router.put("/:id", requirePermission("categories.update"), updateSubcategory);
router.delete(
  "/:id",
  requirePermission("categories.delete"),
  deleteSubcategory
);

export default router;
