import express from 'express';
import * as dealerInsightsController from '../controllers/dealerInsightsController.js';
import protect from '../middleware/protect.js';
import protectAdmin from '../middleware/protectAdmin.js';

const router = express.Router();

// Mobile app routes (Sales Executive)
router.get('/:dealerId', protect, dealerInsightsController.getDealerInsights);
router.get('/:dealerId/outstanding', protect, dealerInsightsController.getOutstandingSummary);
router.get('/:dealerId/ageing', protect, dealerInsightsController.getAgeingAnalysis);

// Admin routes (Web CRM) - for future use
// router.post('/scheme', protectAdmin, dealerInsightsController.createScheme);
// router.post('/recommendation', protectAdmin, dealerInsightsController.addRecommendation);

export default router;
