import express from 'express';
import {
  getExtendedSubcategories,
  getExtendedSubcategory,
  createExtendedSubcategory,
  updateExtendedSubcategory,
  deleteExtendedSubcategory,
  getExtendedSubcategoryTree,
  getExtendedSubcategoriesBySubcategory
} from '../controllers/extendedSubcategoryController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Extended subcategory routes
router.get('/', requirePermission('categories.view'), getExtendedSubcategories);
router.post('/', requirePermission('categories.create'), createExtendedSubcategory);
router.get('/tree', requirePermission('categories.view'), getExtendedSubcategoryTree);
router.get('/by-subcategory/:subcategoryId', requirePermission('categories.view'), getExtendedSubcategoriesBySubcategory);
router.get('/:id', requirePermission('categories.view'), getExtendedSubcategory);
router.put('/:id', requirePermission('categories.update'), updateExtendedSubcategory);
router.delete('/:id', requirePermission('categories.delete'), deleteExtendedSubcategory);

export default router;