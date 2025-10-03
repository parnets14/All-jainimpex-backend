import express from 'express';
import {
  getSubcategories,
  updateSubcategory,
  deleteSubcategory
} from '../controllers/subcategoryController.js';
import {
  getBrandsBySubcategory,
  createBrand
} from '../controllers/brandController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Subcategory routes
router.get('/', requirePermission('categories.view'), getSubcategories);
router.put('/:id', requirePermission('categories.update'), updateSubcategory);
router.delete('/:id', requirePermission('categories.delete'), deleteSubcategory);

// Brand routes under subcategory
router.get('/:subcategoryId/brands', requirePermission('categories.view'), getBrandsBySubcategory);
router.post('/:subcategoryId/brands', requirePermission('categories.create'), createBrand);

export default router;