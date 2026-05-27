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
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// Extended subcategory routes - READ operations (no permission check)
router.get('/', logActivity("Extended Subcategory", "Viewed extended subcategories list", "READ"), getExtendedSubcategories);
router.get('/tree', logActivity("Extended Subcategory", "Viewed extended subcategory tree", "READ"), getExtendedSubcategoryTree);
router.get('/by-subcategory/:subcategoryId', logActivity("Extended Subcategory", "Viewed extended subcategories by subcategory", "READ"), getExtendedSubcategoriesBySubcategory);
router.get('/by-parent/:parentId', logActivity("Extended Subcategory", "Viewed extended subcategories by parent", "READ"), getExtendedSubcategoriesByParent);
router.get('/:id/parent-chain', logActivity("Extended Subcategory", "Viewed parent chain", "READ"), getExtendedSubcategoryWithParentChain);
router.get('/:id/change-parent-preview', logActivity("Extended Subcategory", "Viewed parent change preview", "READ"), getExtendedSubcategoryParentChangePreview);
router.get('/:id', logActivity("Extended Subcategory", "Viewed extended subcategory details", "READ"), getExtendedSubcategory);

// Extended subcategory WRITE operations (require permissions)
router.post('/', requirePermission('categories.create'), logActivity("Extended Subcategory", "Created extended subcategory", "CREATE"), createExtendedSubcategory);
router.put('/:id/change-parent', requirePermission('categories.update'), logActivity("Extended Subcategory", "Changed extended subcategory parent", "UPDATE"), changeExtendedSubcategoryParent);
router.put('/:id', requirePermission('categories.update'), logActivity("Extended Subcategory", "Updated extended subcategory", "UPDATE"), updateExtendedSubcategory);
router.delete('/:id', requirePermission('categories.delete'), logActivity("Extended Subcategory", "Deleted extended subcategory", "DELETE"), deleteExtendedSubcategory);

export default router;