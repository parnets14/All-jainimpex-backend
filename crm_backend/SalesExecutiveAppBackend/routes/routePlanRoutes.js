import express from 'express';
import * as routePlanController from '../controllers/routePlanController.js';
import protect from '../middleware/protect.js';
import protectAdmin from '../middleware/protectAdmin.js';

const router = express.Router();

// Admin routes (Web CRM)
router.get('/admin/all', protectAdmin, routePlanController.getAllRoutePlans);
router.post('/admin/create', protectAdmin, routePlanController.createRoutePlan);
router.put('/admin/:id', protectAdmin, routePlanController.updateRoutePlan);
router.delete('/admin/:id', protectAdmin, routePlanController.deleteRoutePlan);

// Mobile app routes
router.get('/today', protect, routePlanController.getTodayRoutePlan);
router.post('/start', protect, routePlanController.startRoute);
router.post('/end', protect, routePlanController.endRoute);
router.post('/dealer/visit', protect, routePlanController.markDealerVisited);
router.post('/dealer/skip', protect, routePlanController.skipDealer);
router.get('/history', protect, routePlanController.getRouteHistory);
router.get('/dealers', protect, routePlanController.getAssignedDealers);

export default router;
