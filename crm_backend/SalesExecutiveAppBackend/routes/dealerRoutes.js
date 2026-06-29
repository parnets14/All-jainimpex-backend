import express from 'express';
import protect from '../middleware/protect.js';
import { dealerSchema } from '../../models/Dealer.js';

const router = express.Router();

// Get dealers assigned to the logged-in sales executive (paginated)
router.get('/', protect, async (req, res) => {
  try {
    const user = req.user;
    const userId = req.user._id || req.user.userId;

    // ✅ Use company-specific DB connection from token
    const Dealer = req.dbConnection.models.Dealer || req.dbConnection.model('Dealer', dealerSchema);

    // ── Pagination + search params ──────────────────────────────────────────
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = (req.query.search || '').trim();

    // ── Base filter: dealers DIRECTLY assigned to this sales executive ────────
    let baseFilter = { salesExecutiveId: userId, isActive: true };

    // Fallback: if SE has no directly-assigned dealers, try their assigned regions + routes.
    const directCount = await Dealer.countDocuments(baseFilter);
    if (directCount === 0) {
      if (user.assignedRegions && user.assignedRegions.length > 0) {
        // If user also has assignedRoutes, intersect both for tighter filtering
        if (user.assignedRoutes && user.assignedRoutes.length > 0) {
          baseFilter = { regionId: { $in: user.assignedRegions }, routeId: { $in: user.assignedRoutes }, isActive: true };
        } else {
          baseFilter = { regionId: { $in: user.assignedRegions }, isActive: true };
        }
      } else {
        // No direct assignments, no regions → no dealers visible (strict)
        return res.json({
          success: true,
          dealers: [],
          count: 0,
          total: 0,
          page,
          limit,
          totalPages: 0,
          hasMore: false,
          message: 'No dealers assigned. Ask admin to assign dealers or regions.',
        });
      }
    }

    // ── Apply search on top of the base (assignment) filter ───────────────────
    const query = { ...baseFilter };
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      query.$or = [{ name: rx }, { code: rx }, { city: rx }, { phone: rx }];
    }

    const total = await Dealer.countDocuments(query);
    const dealers = await Dealer.find(query)
      .select('name code city phone region address dealerType creditLimit creditDays status')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    console.log(`✅ Dealers for ${user.name} in ${req.company}: page ${page}, returned ${dealers.length}/${total}`);

    res.json({
      success: true,
      dealers,
      count: dealers.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    });
  } catch (error) {
    console.error('Error fetching dealers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dealers', error: error.message });
  }
});

export default router;
