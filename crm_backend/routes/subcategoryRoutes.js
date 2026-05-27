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
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// Subcategory routes - READ operations (no permission check)
router.get("/", logActivity("Subcategory Management", "Viewed subcategories list", "READ"), getSubcategories);
router.get("/:id/change-parent-preview", logActivity("Subcategory Management", "Viewed parent change preview", "READ"), getSubcategoryParentChangePreview);

// Subcategory WRITE operations (require permissions)
router.put(
  "/:id/change-parent",
  requirePermission("categories.update"),
  logActivity("Subcategory Management", "Changed subcategory parent", "UPDATE"),
  changeSubcategoryParent
);
router.put("/:id", requirePermission("categories.update"), logActivity("Subcategory Management", "Updated subcategory", "UPDATE"), updateSubcategory);
router.delete(
  "/:id",
  requirePermission("categories.delete"),
  logActivity("Subcategory Management", "Deleted subcategory", "DELETE"),
  deleteSubcategory
);

export default router;
