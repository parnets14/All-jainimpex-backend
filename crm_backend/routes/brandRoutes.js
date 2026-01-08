import express from 'express';
import {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand
} from '../controllers/brandController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Brand routes
router.get('/', requirePermission('categories.view'), getBrands);
router.post('/', requirePermission('categories.create'), createBrand);
router.put('/:id', requirePermission('categories.update'), updateBrand);
router.delete('/:id', requirePermission('categories.delete'), deleteBrand);

export default router;