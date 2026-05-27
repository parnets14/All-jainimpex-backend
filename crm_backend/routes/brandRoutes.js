import express from "express";
import {
  getBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand,
  getBrandStats,
  getBrandChildCounts,
} from "../controllers/brandController.js";
import {
  getCategoriesByBrand,
  createCategoryUnderBrand,
} from "../controllers/categoryController.js";
import {
  getSubcategoriesByBrandAndCategory,
  createSubcategoryUnderBrandCategory,
} from "../controllers/subcategoryController.js";
import {
  getExtendedByBrandCategorySubcategory,
  createExtendedUnderBrandCategorySubcategory,
} from "../controllers/extendedSubcategoryController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// Brand stats and child counts - READ operations (no permission check)
router.get("/stats", logActivity("Brand Management", "Viewed brand statistics", "READ"), getBrandStats);
router.get("/:id/child-counts", logActivity("Brand Management", "Viewed brand child counts", "READ"), getBrandChildCounts);

// Brand CRUD routes
router.get("/", logActivity("Brand Management", "Viewed brands list", "READ"), getBrands); // READ - no permission check
router.get("/:id", logActivity("Brand Management", "Viewed brand details", "READ"), getBrand); // READ - no permission check
router.post("/", requirePermission("categories.create"), logActivity("Brand Management", "Created new brand", "CREATE"), createBrand);
router.put("/:id", requirePermission("categories.update"), logActivity("Brand Management", "Updated brand", "UPDATE"), updateBrand);
router.delete("/:id", requirePermission("categories.delete"), logActivity("Brand Management", "Deleted brand", "DELETE"), deleteBrand);

// Nested routes: Brand → Categories
router.get("/:brandId/categories", logActivity("Brand Management", "Viewed brand categories", "READ"), getCategoriesByBrand); // READ - no permission check
router.post(
  "/:brandId/categories",
  requirePermission("categories.create"),
  logActivity("Brand Management", "Created category under brand", "CREATE"),
  createCategoryUnderBrand
);

// Nested routes: Brand → Category → Subcategories
router.get(
  "/:brandId/categories/:categoryId/subcategories",
  logActivity("Brand Management", "Viewed brand subcategories", "READ"),
  getSubcategoriesByBrandAndCategory
); // READ - no permission check
router.post(
  "/:brandId/categories/:categoryId/subcategories",
  requirePermission("categories.create"),
  logActivity("Brand Management", "Created subcategory under brand", "CREATE"),
  createSubcategoryUnderBrandCategory
);

// Nested routes: Brand → Category → Subcategory → Extended
router.get(
  "/:brandId/categories/:categoryId/subcategories/:subcategoryId/extended",
  logActivity("Brand Management", "Viewed extended subcategories", "READ"),
  getExtendedByBrandCategorySubcategory
); // READ - no permission check
router.post(
  "/:brandId/categories/:categoryId/subcategories/:subcategoryId/extended",
  requirePermission("categories.create"),
  logActivity("Brand Management", "Created extended subcategory", "CREATE"),
  createExtendedUnderBrandCategorySubcategory
);

export default router;
