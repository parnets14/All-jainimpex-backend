import express from 'express';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

// Placeholder routes - implement controllers as needed
router.get('/', async (req, res) => {
  res.json({ success: true, data: [] });
});

router.post('/', async (req, res) => {
  res.json({ success: true, message: 'Fixed asset created' });
});

export default router;
