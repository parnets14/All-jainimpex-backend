import express from 'express';
import { ingestPunches, getSyncState } from '../controllers/biometricController.js';

const router = express.Router();

// Device agent authenticates with a shared API key (no user JWT).
const requireApiKey = (req, res, next) => {
  const configured = process.env.BIOMETRIC_API_KEY;
  if (!configured) {
    return res.status(500).json({ success: false, message: 'BIOMETRIC_API_KEY not configured on server' });
  }
  const key = req.headers['x-api-key'] || req.body?.apiKey || req.query?.apiKey;
  if (key !== configured) {
    return res.status(401).json({ success: false, message: 'Invalid API key' });
  }
  next();
};

router.post('/punch', requireApiKey, ingestPunches);
router.get('/sync-state', requireApiKey, getSyncState);

export default router;
