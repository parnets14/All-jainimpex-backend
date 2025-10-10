import express from 'express';
import {
  createGRN,
  getGRNs,
  getGRN,
  updateGRN,
  deleteGRN,
  getGRNStats,
  getApprovedPOs
} from '../controllers/grnController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

router.post('/', createGRN);
router.get('/', getGRNs);
router.get('/stats', getGRNStats);
router.get('/approved-pos', getApprovedPOs);
router.get('/:id', getGRN);
router.put('/:id', updateGRN);
router.delete('/:id', deleteGRN);

export default router;