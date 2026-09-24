import express from 'express';
import {
  getAllServiceCharges,
  getServiceChargeById,
  createServiceCharge,
  updateServiceCharge,
  deleteServiceCharge,
  toggleServiceChargeStatus
} from '../controllers/serviceChargeMasterController.js';
import { protect } from '../middleware/authMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.route('/')
  .get(
    logActivity('Service Charge Master', 'Viewed service charges list', 'READ'),
    getAllServiceCharges
  )
  .post(
    logActivity('Service Charge Master', 'Created service charge', 'CREATE'),
    createServiceCharge
  );

router.route('/:id')
  .get(
    logActivity('Service Charge Master', 'Viewed service charge details', 'READ'),
    getServiceChargeById
  )
  .put(
    logActivity('Service Charge Master', 'Updated service charge', 'UPDATE'),
    updateServiceCharge
  )
  .delete(
    logActivity('Service Charge Master', 'Deactivated service charge', 'DELETE'),
    deleteServiceCharge
  );

router.patch('/:id/toggle-status',
  logActivity('Service Charge Master', 'Toggled service charge status', 'UPDATE'),
  toggleServiceChargeStatus
);

export default router;
