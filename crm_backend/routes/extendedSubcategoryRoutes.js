import express from 'express';
import {
  getExtendedSubcategories,
  getExtendedSubcategory,
  createExtendedSubcategory,
  updateExtendedSubcategory,
  deleteExtendedSubcategory,
  getExtendedSubcategoryTree,
  getExtendedSubcategoriesBySubcategory,
  getExtendedSubcategoriesByParent,
  getExtendedSubcategoryWithParentChain,
  changeExtendedSubcategoryParent,
  getExtendedSubcategoryParentChangePreview
} from '../controllers/extendedSubcategoryController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// Extended subcategory routes - READ operations (no permission check)
router.get('/', getExtendedSubcategories);
router.get('/tree', getExtendedSubcategoryTree);
router.get('/by-subcategory/:subcategoryId', getExtendedSubcategoriesBySubcategory);
router.get('/by-parent/:parentId', getExtendedSubcategoriesByParent);
router.get('/:id/parent-chain', getExtendedSubcategoryWithParentChain);
router.get('/:id/change-parent-preview', getExtendedSubcategoryParentChangePreview);
router.get('/:id', getExtendedSubcategory);

// Extended subcategory WRITE operations (require permissions)
router.post('/', requirePermission('categories.create'), createExtendedSubcategory);
router.put('/:id/change-parent', requirePermission('categories.update'), changeExtendedSubcategoryParent);
router.put('/:id', requirePermission('categories.update'), updateExtendedSubcategory);
router.delete('/:id', requirePermission('categories.delete'), deleteExtendedSubcategory);

export default router;