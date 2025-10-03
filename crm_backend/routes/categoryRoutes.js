import express from 'express';
import {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryStats
} from '../controllers/categoryController.js';
import {
  getSubcategoriesByCategory,
  createSubcategory
} from '../controllers/subcategoryController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Category routes
router.get('/stats', requirePermission('categories.view'), getCategoryStats);
router.get('/', requirePermission('categories.view'), getCategories);
router.get('/:id', requirePermission('categories.view'), getCategory);
router.post('/', requirePermission('categories.create'), createCategory);
router.put('/:id', requirePermission('categories.update'), updateCategory);
router.delete('/:id', requirePermission('categories.delete'), deleteCategory);

// Subcategory routes under category
router.get('/:categoryId/subcategories', requirePermission('categories.view'), getSubcategoriesByCategory);
router.post('/:categoryId/subcategories', requirePermission('categories.create'), createSubcategory);

export default router;