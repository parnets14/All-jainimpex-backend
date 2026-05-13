import express from 'express';
import protect from '../middleware/protect.js';
import { dealerSchema } from '../../models/Dealer.js';

const router = express.Router();

// Get all dealers assigned to the sales executive's region
router.get('/', protect, async (req, res) => {
  try {
    const user = req.user;

    // ✅ Use company-specific DB connection from token
    const Dealer = req.dbConnection.models.Dealer || req.dbConnection.model('Dealer', dealerSchema);

    console.log('📋 User fetching dealers:', {
      name: user.name,
      company: req.company,
      assignedRegions: user.assignedRegions,
    });

    let query = { isActive: true };
    if (user.assignedRegions && user.assignedRegions.length > 0) {
      query.regionId = { $in: user.assignedRegions };
    }

    const dealers = await Dealer.find(query)
      .select('name code city phone region address dealerType creditLimit creditDays status')
      .sort({ name: 1 });

    console.log(`✅ Found ${dealers.length} dealers in ${req.company}`);

    res.json({ success: true, dealers, count: dealers.length });
  } catch (error) {
    console.error('Error fetching dealers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dealers', error: error.message });
  }
});

export default router;
