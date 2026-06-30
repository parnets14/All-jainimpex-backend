import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { listPunches, punchStats, listDeviceCards } from '../controllers/biometricController.js';

const router = express.Router();

// Authenticated, company-scoped admin view of biometric punches.
router.use(protect);
router.use(attachCompanyDB);

router.get('/punches', listPunches);
router.get('/stats', punchStats);
router.get('/device-cards', listDeviceCards);

// Lightweight health/ping for the "Test Connection" button in the admin screen.
router.get('/ping', (req, res) => {
  res.json({
    success: true,
    message: 'Biometric service reachable',
    company: req.company || null,
    serverTime: new Date().toISOString(),
  });
});

export default router;
