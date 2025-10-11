import express from 'express';
import { migrateStockMovements, forceCreateStockMovements } from '../controllers/stockController.js';

const router = express.Router();

// Test migration endpoint without auth
router.post('/migrate-test', migrateStockMovements);
router.post('/force-migrate', forceCreateStockMovements);

export default router;
