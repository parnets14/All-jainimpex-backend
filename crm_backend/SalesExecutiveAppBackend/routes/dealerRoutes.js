import express from 'express';
import protect from '../middleware/protect.js';
import Dealer from '../../models/Dealer.js';

const router = express.Router();

// Get all dealers assigned to the sales executive's region
router.get('/', protect, async (req, res) => {
  try {
    const user = req.user;

    console.log('📋 User fetching dealers:', {
      name: user.name,
      role: user.role,
      assignedRegions: user.assignedRegions,
      regionCount: Array.isArray(user.assignedRegions) ? user.assignedRegions.length : 0,
    });

    // If no region assigned, return all active dealers
    let query = { isActive: true };
    
    if (user.assignedRegions && user.assignedRegions.length > 0) {
      query.regionId = { $in: user.assignedRegions };
    } else {
      console.log('⚠️ No region assigned to user, returning all dealers');
    }

    // Find dealers
    const dealers = await Dealer.find(query)
      .select('name code city phone region address')
      .sort({ name: 1 });

    console.log(`✅ Found ${dealers.length} dealers`);

    res.json({
      success: true,
      dealers,
      count: dealers.length,
    });
  } catch (error) {
    console.error('Error fetching dealers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dealers',
      error: error.message,
    });
  }
});

export default router;
