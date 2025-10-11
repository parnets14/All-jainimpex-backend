import express from 'express';
import {
  getStock,
  getStockHistory,
  getStockAlerts
} from '../controllers/stockController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getStock);
router.get('/alerts', getStockAlerts);
router.get('/:productId/history', getStockHistory);

export default router;