import express from 'express';
import {
  createDealerType,
  getAllDealerTypes,
  getDealerTypeById,
  updateDealerType,
  deleteDealerType
} from '../controllers/dealerTypeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// Create a new dealer type
router.post('/', logActivity("Dealer Type", "Created new dealer type", "CREATE"), createDealerType);

// Get all dealer types with pagination and search
router.get('/', logActivity("Dealer Type", "Viewed dealer types list", "READ"), getAllDealerTypes);

// Get single dealer type by ID
router.get('/:id', logActivity("Dealer Type", "Viewed dealer type details", "READ"), getDealerTypeById);

// Update dealer type
router.put('/:id', logActivity("Dealer Type", "Updated dealer type", "UPDATE"), updateDealerType);

// Delete dealer type
router.delete('/:id', logActivity("Dealer Type", "Deleted dealer type", "DELETE"), deleteDealerType);

export default router;