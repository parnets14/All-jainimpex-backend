import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { appSettingsSchema } from '../models/AppSettings.js';

const router = express.Router();

// Helper to get model on the company-specific connection
const getModel = (req) => {
  const conn = req.dbConnection;
  return conn.models.AppSettings || conn.model('AppSettings', appSettingsSchema);
};

// GET /api/settings/:key
router.get('/:key', protect, attachCompanyDB, async (req, res) => {
  try {
    const AppSettings = getModel(req);
    const setting = await AppSettings.findOne({ key: req.params.key });
    res.json({ success: true, value: setting ? setting.value : null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/settings/:key  — upsert
router.put('/:key', protect, attachCompanyDB, async (req, res) => {
  try {
    const AppSettings = getModel(req);
    const setting = await AppSettings.findOneAndUpdate(
      { key: req.params.key },
      { value: req.body.value, updatedBy: req.user._id },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, setting });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
