import express from 'express';
import {
  createDealerType,
  getAllDealerTypes,
  getDealerTypeById,
  updateDealerType,
  deleteDealerType
} from '../controllers/dealerTypeController.js';

const router = express.Router();

// Create a new dealer type
router.post('/', createDealerType);

// Get all dealer types with pagination and search
router.get('/', getAllDealerTypes);

// Get single dealer type by ID
router.get('/:id', getDealerTypeById);

// Update dealer type
router.put('/:id', updateDealerType);

// Delete dealer type
router.delete('/:id', deleteDealerType);

export default router;