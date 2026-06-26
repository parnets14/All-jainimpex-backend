import express from 'express';
import {
  startVisit, endVisit, getActiveVisit, getMyVisits, getAllVisits,
} from '../controllers/dealerVisitController.js';
import protect from '../middleware/protect.js';
import protectAdmin from '../middleware/protectAdmin.js';

const router = express.Router();

// Admin/Web list (must be before protect so admin token is used)
router.get('/all', protectAdmin, getAllVisits);

// Sales Executive routes
router.use(protect);
router.post('/check-in', startVisit);
router.post('/check-out', endVisit);
router.get('/active', getActiveVisit);
router.get('/my', getMyVisits);

export default router;
