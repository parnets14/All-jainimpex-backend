import express from 'express';
import {
  createTarget,
  getAllTargets,
  getMyTargets,
  getCurrentTargets,
  updateTarget,
  deleteTarget,
  triggerCalculation,
  getTargetStats
} from '../controllers/targetController.js';
import protect from '../middleware/protect.js';
import protectAdmin from '../middleware/protectAdmin.js';

const router = express.Router();

// Admin routes
router.post('/', protectAdmin, createTarget);
router.get('/', protectAdmin, getAllTargets);
router.get('/stats', protectAdmin, getTargetStats);
router.put('/:id', protectAdmin, updateTarget);
router.delete('/:id', protectAdmin, deleteTarget);
router.post('/:id/calculate', protectAdmin, triggerCalculation);

// Sales Executive routes
router.get('/my-targets', protect, getMyTargets);
router.get('/current', protect, getCurrentTargets);

export default router;
