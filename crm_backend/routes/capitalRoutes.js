import express from 'express';
import { 
  getAllCapitals, 
  createCapital, 
  updateCapital, 
  deleteCapital 
} from '../controllers/capitalController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/', logActivity("Capital Management", "Viewed capital entries list", "READ"), getAllCapitals);
router.post('/', logActivity("Capital Management", "Created new capital entry", "CREATE"), createCapital);
router.put('/:id', logActivity("Capital Management", "Updated capital entry", "UPDATE"), updateCapital);
router.delete('/:id', logActivity("Capital Management", "Deleted capital entry", "DELETE"), deleteCapital);

export default router;
