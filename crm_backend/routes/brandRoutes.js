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

const router = express.Router();

// All routes are protected
router.use(protect);

// Brand stats and child counts
router.get("/stats", requirePermission("categories.view"), getBrandStats);
router.get(
  "/:id/child-counts",
  requirePermission("categories.view"),
  getBrandChildCounts
);

// Brand CRUD routes
router.get("/", requirePermission("categories.view"), getBrands);
router.get("/:id", requirePermission("categories.view"), getBrand);
router.post("/", requirePermission("categories.create"), createBrand);
router.put("/:id", requirePermission("categories.update"), updateBrand);
router.delete("/:id", requirePermission("categories.delete"), deleteBrand);

// Nested routes: Brand → Categories
router.get(
  "/:brandId/categories",
  requirePermission("categories.view"),
  getCategoriesByBrand
);
router.post(
  "/:brandId/categories",
  requirePermission("categories.create"),
  createCategoryUnderBrand
);

// Nested routes: Brand → Category → Subcategories
router.get(
  "/:brandId/categories/:categoryId/subcategories",
  requirePermission("categories.view"),
  getSubcategoriesByBrandAndCategory
);
router.post(
  "/:brandId/categories/:categoryId/subcategories",
  requirePermission("categories.create"),
  createSubcategoryUnderBrandCategory
);

// Nested routes: Brand → Category → Subcategory → Extended
router.get(
  "/:brandId/categories/:categoryId/subcategories/:subcategoryId/extended",
  requirePermission("categories.view"),
  getExtendedByBrandCategorySubcategory
);
router.post(
  "/:brandId/categories/:categoryId/subcategories/:subcategoryId/extended",
  requirePermission("categories.create"),
  createExtendedUnderBrandCategorySubcategory
);

export default router;
