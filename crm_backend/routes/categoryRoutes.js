import express from "express";
import {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryStats,
  getCategoryChildCounts,
  deleteCategoryWithCascade,
  changeCategoryParent,
  getCategoryParentChangePreview,
} from "../controllers/categoryController.js";
import {
  getSubcategoriesByCategory,
  createSubcategory,
} from "../controllers/subcategoryController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// Category routes - READ operations (no permission check)
router.get("/stats", logActivity("Category Management", "Viewed category statistics", "READ"), getCategoryStats);
router.get("/:id/child-counts", logActivity("Category Management", "Viewed category child counts", "READ"), getCategoryChildCounts);
router.get("/:id/change-parent-preview", logActivity("Category Management", "Viewed parent change preview", "READ"), getCategoryParentChangePreview);
router.get("/", logActivity("Category Management", "Viewed categories list", "READ"), getCategories);
router.get("/:id", logActivity("Category Management", "Viewed category details", "READ"), getCategory);

// Category WRITE operations (require permissions)
router.delete(
  "/:id/cascade",
  requirePermission("categories.delete"),
  logActivity("Category Management", "Deleted category with cascade", "DELETE"),
  deleteCategoryWithCascade
);
router.put(
  "/:id/change-parent",
  requirePermission("categories.update"),
  logActivity("Category Management", "Changed category parent", "UPDATE"),
  changeCategoryParent
);
router.post("/", requirePermission("categories.create"), logActivity("Category Management", "Created new category", "CREATE"), createCategory);
router.put("/:id", requirePermission("categories.update"), logActivity("Category Management", "Updated category", "UPDATE"), updateCategory);
router.delete("/:id", requirePermission("categories.delete"), logActivity("Category Management", "Deleted category", "DELETE"), deleteCategory);

// Subcategory routes under category
router.get("/:categoryId/subcategories", logActivity("Category Management", "Viewed subcategories", "READ"), getSubcategoriesByCategory); // READ - no permission check
router.post(
  "/:categoryId/subcategories",
  requirePermission("categories.create"),
  logActivity("Category Management", "Created subcategory", "CREATE"),
  createSubcategory
);

export default router;
