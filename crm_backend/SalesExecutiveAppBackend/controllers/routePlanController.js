import { getModels } from '../utils/getModels.js';

// Get single route plan by ID (Admin - Web CRM)
export const getRoutePlanById = async (req, res) => {
  try {
    const { id } = req.params;
    const { RoutePlan } = getModels(req);

    const routePlan = await RoutePlan.findById(id)
      .populate('salesExecutive', 'name empId phone')
      .populate('dealers.dealer', 'name code address phone regionId');

    if (!routePlan) {
      return res.status(404).json({ success: false, message: 'Route plan not found' });
    }

    res.json({ success: true, routePlan });
  } catch (error) {
    console.error('Get route plan by ID error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all route plans (Admin - Web CRM)
export const getAllRoutePlans = async (req, res) => {
  try {
    const { 
      salesExecutive, 
      status, 
      startDate, 
      endDate,
      page = 1,
      limit = 20
    } = req.query;
    const { RoutePlan } = getModels(req);

    const query = {};

    if (salesExecutive) query.salesExecutive = salesExecutive;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const routePlans = await RoutePlan.find(query)
      .populate('salesExecutive', 'name empId phone')
      .populate('dealers.dealer', 'name code address phone regionId')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await RoutePlan.countDocuments(query);

    res.json({
      success: true,
      routePlans,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all route plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch route plans',
      error: error.message
    });
  }
};

// Create route plan (Admin - Web CRM)
export const createRoutePlan = async (req, res) => {
  try {
    const { salesExecutive, date, dealers, remarks } = req.body;
    const { User, Dealer, RoutePlan } = getModels(req);

    const se = await User.findById(salesExecutive);
    if (!se || se.role !== 'sales_executive') {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales executive'
      });
    }

    const existingPlan = await RoutePlan.findOne({
      salesExecutive,
      date: {
        $gte: new Date(date).setHours(0, 0, 0, 0),
        $lt: new Date(date).setHours(23, 59, 59, 999)
      }
    });

    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: 'Route plan already exists for this date'
      });
    }

    const dealerIds = dealers.map(d => d.dealer);
    const dealerDocs = await Dealer.find({ _id: { $in: dealerIds } });

    if (dealerDocs.length !== dealerIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some dealers not found'
      });
    }

    // Note: Admin can assign any dealer to any SE — region check is skipped for admin-created plans.
    // The SE's assignedRegions are used for filtering in the UI but not enforced server-side for admin.

    const routePlan = new RoutePlan({
      salesExecutive,
      date: new Date(date),
      dealers: dealers.map((d, index) => ({
        dealer: d.dealer,
        plannedVisitTime: d.plannedVisitTime,
        visitOrder: index + 1,
        status: 'pending'
      })),
      status: 'draft',
      remarks
    });

    await routePlan.save();

    const populatedPlan = await RoutePlan.findById(routePlan._id)
      .populate('salesExecutive', 'name empId phone')
      .populate('dealers.dealer', 'name code address phone regionId');

    // Send push notification to the SE
    await notifyRoutePlanAssigned(req, salesExecutive, routePlan);

    res.status(201).json({
      success: true,
      message: 'Route plan created successfully',
      routePlan: populatedPlan
    });
  } catch (error) {
    console.error('Create route plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create route plan',
      error: error.message
    });
  }
};

// Update route plan (Admin - Web CRM)
export const updateRoutePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const { RoutePlan } = getModels(req);

    const routePlan = await RoutePlan.findById(id);
    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    if (routePlan.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update completed route plan'
      });
    }

    if (updates.dealers) {
      updates.dealers = updates.dealers.map((d, index) => ({
        ...d,
        visitOrder: index + 1
      }));
    }

    Object.assign(routePlan, updates);
    await routePlan.save();

    const populatedPlan = await RoutePlan.findById(routePlan._id)
      .populate('salesExecutive', 'name empId phone')
      .populate('dealers.dealer', 'name code address phone regionId');

    res.json({
      success: true,
      message: 'Route plan updated successfully',
      routePlan: populatedPlan
    });
  } catch (error) {
    console.error('Update route plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update route plan',
      error: error.message
    });
  }
};

// Delete route plan (Admin - Web CRM)
export const deleteRoutePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { RoutePlan } = getModels(req);

    const routePlan = await RoutePlan.findById(id);
    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    if (routePlan.status === 'active' || routePlan.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete active or completed route plan'
      });
    }

    await routePlan.deleteOne();

    res.json({
      success: true,
      message: 'Route plan deleted successfully'
    });
  } catch (error) {
    console.error('Delete route plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete route plan',
      error: error.message
    });
  }
};

// Get today's route plan (Mobile App)
export const getTodayRoutePlan = async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const { RoutePlan } = getModels(req);

    console.log('🔍 getTodayRoutePlan called');
    console.log('   User ID:', userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const routePlan = await RoutePlan.findOne({
      salesExecutive: userId,
      date: { $gte: today, $lt: tomorrow }
    })
      .populate('dealers.dealer', 'name code address phone contactPerson regionId');

    console.log('   Route plan found:', !!routePlan);

    if (!routePlan) {
      return res.json({
        success: true,
        routePlan: null,
        message: 'No route plan for today'
      });
    }

    res.json({
      success: true,
      routePlan
    });
  } catch (error) {
    console.error('Get today route plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today\'s route plan',
      error: error.message
    });
  }
};

// Start route (Mobile App)
export const startRoute = async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const { routePlanId, location } = req.body;
    const { RoutePlan } = getModels(req);

    const routePlan = await RoutePlan.findById(routePlanId);
    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    if (routePlan.salesExecutive.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (routePlan.status === 'active') {
      return res.status(400).json({ success: false, message: 'Route already started' });
    }

    routePlan.startTime = new Date();
    routePlan.status = 'active';
    
    if (location) {
      routePlan.startLocation = {
        type: 'Point',
        coordinates: [location.longitude, location.latitude],
        address: location.address
      };
    }

    await routePlan.save();

    res.json({
      success: true,
      message: 'Route started successfully',
      routePlan
    });
  } catch (error) {
    console.error('Start route error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start route',
      error: error.message
    });
  }
};

// End route (Mobile App)
export const endRoute = async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const { routePlanId, location, totalDistance } = req.body;
    const { RoutePlan } = getModels(req);

    const routePlan = await RoutePlan.findById(routePlanId);
    if (!routePlan) {
      return res.status(404).json({ success: false, message: 'Route plan not found' });
    }

    if (routePlan.salesExecutive.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (routePlan.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Route is not active' });
    }

    routePlan.endTime = new Date();
    routePlan.status = 'completed';
    
    if (location) {
      routePlan.endLocation = {
        type: 'Point',
        coordinates: [location.longitude, location.latitude],
        address: location.address
      };
    }

    if (totalDistance) {
      routePlan.totalDistance = totalDistance;
    }

    await routePlan.save();

    res.json({
      success: true,
      message: 'Route ended successfully',
      routePlan
    });
  } catch (error) {
    console.error('End route error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end route',
      error: error.message
    });
  }
};

// Get route history (Mobile App)
export const getRouteHistory = async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const { page = 1, limit = 10 } = req.query;
    const { RoutePlan } = getModels(req);

    const skip = (page - 1) * limit;

    const routePlans = await RoutePlan.find({ salesExecutive: userId })
      .populate('dealers.dealer', 'name code address')
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await RoutePlan.countDocuments({ salesExecutive: userId });

    res.json({
      success: true,
      routePlans,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get route history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch route history',
      error: error.message
    });
  }
};

// Get dealers by SE's region (Mobile App)
export const getAssignedDealers = async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const { User, Dealer } = getModels(req);

    const se = await User.findById(userId);
    if (!se) {
      return res.json({
        success: true,
        dealers: [],
        message: 'Sales executive not found'
      });
    }

    // Primary: dealers directly assigned to this SE
    let dealers = await Dealer.find({
      salesExecutiveId: userId,
      isActive: true
    }).select('name code address phone contactPerson regionId');

    // Fallback: if no direct assignments, use region-based
    if (dealers.length === 0 && se.assignedRegions && se.assignedRegions.length > 0) {
      dealers = await Dealer.find({
        regionId: { $in: se.assignedRegions },
        isActive: true
      }).select('name code address phone contactPerson regionId');
    }

    res.json({
      success: true,
      dealers
    });
  } catch (error) {
    console.error('Get assigned dealers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned dealers',
      error: error.message
    });
  }
};

// Mark dealer as visited (Mobile App)
export const markDealerVisited = async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const { routePlanId, dealerId, remarks, orderTaken, orderAmount, paymentReceived, paymentAmount, location, visitTime } = req.body;
    const { RoutePlan } = getModels(req);

    const routePlan = await RoutePlan.findById(routePlanId);
    if (!routePlan) {
      return res.status(404).json({ success: false, message: 'Route plan not found' });
    }

    if (routePlan.salesExecutive.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const dealerIndex = routePlan.dealers.findIndex(d => d.dealer.toString() === dealerId);
    if (dealerIndex === -1) {
      return res.status(404).json({ success: false, message: 'Dealer not found in route plan' });
    }

    routePlan.dealers[dealerIndex].status = 'visited';
    routePlan.dealers[dealerIndex].actualVisitTime = visitTime || new Date();
    routePlan.dealers[dealerIndex].remarks = remarks;

    if (!routePlan.dealers[dealerIndex].visitData) {
      routePlan.dealers[dealerIndex].visitData = {};
    }
    routePlan.dealers[dealerIndex].visitData = {
      orderTaken,
      orderAmount,
      paymentReceived,
      paymentAmount,
      location,
      actualVisitTime: visitTime || new Date(),  // also store here for web compatibility
      remarks,                                    // also store here for web compatibility
    };

    await routePlan.save();

    res.json({
      success: true,
      message: 'Dealer marked as visited',
      routePlan
    });
  } catch (error) {
    console.error('Mark dealer visited error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark dealer as visited',
      error: error.message
    });
  }
};

// Skip dealer (Mobile App)
export const skipDealer = async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const { routePlanId, dealerId, reason } = req.body;
    const { RoutePlan } = getModels(req);

    const routePlan = await RoutePlan.findById(routePlanId);
    if (!routePlan) {
      return res.status(404).json({ success: false, message: 'Route plan not found' });
    }

    if (routePlan.salesExecutive.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const dealerIndex = routePlan.dealers.findIndex(d => d.dealer.toString() === dealerId);
    if (dealerIndex === -1) {
      return res.status(404).json({ success: false, message: 'Dealer not found in route plan' });
    }

    routePlan.dealers[dealerIndex].status = 'skipped';
    routePlan.dealers[dealerIndex].remarks = reason;
    routePlan.dealers[dealerIndex].skipReason = reason;  // web reads d.skipReason

    await routePlan.save();

    res.json({
      success: true,
      message: 'Dealer skipped',
      routePlan
    });
  } catch (error) {
    console.error('Skip dealer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to skip dealer',
      error: error.message
    });
  }
};

// ── Helper: Notify SE about route plan assignment ────────────────────────────
async function notifyRoutePlanAssigned(req, seUserId, routePlan, totalPlans = 1) {
  try {
    const { User, SENotification } = getModels(req);
    const seId = typeof seUserId === 'object' ? seUserId._id || seUserId : seUserId;

    const planDate = new Date(routePlan.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const dealerCount = routePlan.dealers?.length || 0;

    const title = totalPlans > 1
      ? `📍 ${totalPlans} Route Plans Assigned`
      : '📍 New Route Plan Assigned';

    const message = totalPlans > 1
      ? `${totalPlans} route plans have been assigned to you starting ${planDate} with ${dealerCount} dealers each.`
      : `Route plan for ${planDate} with ${dealerCount} dealers has been assigned to you.`;

    // Create in-app notification
    await SENotification.create({
      user: seId,
      type: 'route_plan_assigned',
      title,
      message,
      data: {
        routePlanId: routePlan._id.toString(),
        date: routePlan.date,
        dealerCount,
        totalPlans,
      },
      priority: 'high',
    });

    // Send FCM push notification
    const seUser = await User.findById(seId).select('fcmToken').lean();
    if (seUser?.fcmToken) {
      const { sendPushNotification } = await import('../services/firebaseNotificationService.js');
      await sendPushNotification({
        token: seUser.fcmToken,
        title,
        body: message,
        data: {
          type: 'route_plan_assigned',
          routePlanId: routePlan._id.toString(),
          screen: 'RoutePlan', // For navigation in the app
        },
      });
      console.log(`📱 Push notification sent to SE for route plan`);
    }
  } catch (error) {
    // Non-fatal — don't fail the main operation
    console.error('notifyRoutePlanAssigned error (non-fatal):', error.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW: Enhanced Route Plan Management APIs
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get all dealers on a specific route
 * GET /api/se/route-plans/admin/route-dealers/:routeId
 */
export const getRouteDealers = async (req, res) => {
  try {
    const { routeId } = req.params;
    const { Route, Dealer, User } = getModels(req);

    const route = await Route.findById(routeId)
      .populate('salesExecutive', 'name empId phone assignedRegions');

    if (!route) {
      return res.status(404).json({ success: false, message: 'Route not found' });
    }

    // First try: Find dealers assigned to this route directly
    let dealers = await Dealer.find({
      routeId: routeId,
      isActive: true
    }).select('name code address phone contactPerson location regionId routeId').lean();

    // Fallback: If no dealers have routeId set, find by SE's assigned regions
    if (dealers.length === 0 && route.salesExecutive) {
      const se = route.salesExecutive;
      const regionIds = (se.assignedRegions || []).map(r => typeof r === 'object' ? r._id || r : r);
      
      if (regionIds.length > 0) {
        dealers = await Dealer.find({
          regionId: { $in: regionIds },
          isActive: true
        }).select('name code address phone contactPerson location regionId routeId').lean();
      }
    }

    res.json({
      success: true,
      route: {
        _id: route._id,
        name: route.name,
        code: route.code,
        visitDays: route.visitDays,
        salesExecutive: route.salesExecutive,
        priority: route.priority,
        areas: route.areas,
        estimatedDuration: route.estimatedDuration,
      },
      dealers,
      totalDealers: dealers.length,
    });
  } catch (error) {
    console.error('Get route dealers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Auto-generate route plans based on route's visitDays
 * POST /api/se/route-plans/admin/auto-generate
 * 
 * Body: { routeId, startDate, endDate, skipExisting: true }
 * 
 * Generates RoutePlans for each matching visitDay in the date range.
 * E.g., if route has visitDays: ['Monday', 'Thursday'] and range is 2 weeks,
 * it creates 4 plans (2 Mondays + 2 Thursdays).
 */
export const autoGenerateRoutePlans = async (req, res) => {
  try {
    const { routeId, startDate, endDate, skipExisting = true } = req.body;
    const { Route, Dealer, RoutePlan } = getModels(req);

    if (!routeId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'routeId, startDate, and endDate are required'
      });
    }

    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({ success: false, message: 'Route not found' });
    }

    if (!route.salesExecutive) {
      return res.status(400).json({
        success: false,
        message: 'Route has no assigned Sales Executive. Please assign one first.'
      });
    }

    if (!route.visitDays || route.visitDays.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Route has no visit days configured. Please set visit days in Route Master.'
      });
    }

    // Get all dealers on this route
    const dealers = await Dealer.find({
      routeId: routeId,
      isActive: true
    }).select('_id name location').lean();

    if (dealers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active dealers found on this route'
      });
    }

    // Optimize dealer order by proximity (nearest-neighbor)
    const optimizedDealers = optimizeByProximity(dealers);

    // Generate dates that match visitDays in the range
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const matchingDates = [];
    const current = new Date(start);

    while (current <= end) {
      const dayName = dayNames[current.getDay()];
      if (route.visitDays.includes(dayName)) {
        matchingDates.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    if (matchingDates.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No matching days found in the date range for visit days: ${route.visitDays.join(', ')}`
      });
    }

    // Create route plans for each matching date
    const createdPlans = [];
    const skippedDates = [];

    for (const date of matchingDates) {
      // Check if plan already exists for this date + SE
      if (skipExisting) {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const existing = await RoutePlan.findOne({
          salesExecutive: route.salesExecutive,
          date: { $gte: dayStart, $lte: dayEnd }
        });

        if (existing) {
          skippedDates.push(date.toISOString().split('T')[0]);
          continue;
        }
      }

      const routePlan = new RoutePlan({
        salesExecutive: route.salesExecutive,
        date,
        dealers: optimizedDealers.map((d, index) => ({
          dealer: d._id,
          visitOrder: index + 1,
          status: 'pending'
        })),
        status: 'draft',
        remarks: `Auto-generated from route: ${route.name} (${route.code})`
      });

      await routePlan.save();
      createdPlans.push(routePlan);
    }

    // Notify SE about new route plans
    if (createdPlans.length > 0) {
      await notifyRoutePlanAssigned(req, route.salesExecutive, createdPlans[0], createdPlans.length);
    }

    res.status(201).json({
      success: true,
      message: `Created ${createdPlans.length} route plan(s)${skippedDates.length > 0 ? `, skipped ${skippedDates.length} (already exist)` : ''}`,
      data: {
        created: createdPlans.length,
        skipped: skippedDates.length,
        skippedDates,
        totalDealersPerPlan: optimizedDealers.length,
        route: { name: route.name, code: route.code, visitDays: route.visitDays },
      }
    });
  } catch (error) {
    console.error('Auto-generate route plans error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Optimize dealer visit order (nearest-neighbor algorithm)
 * POST /api/se/route-plans/admin/optimize-order
 * 
 * Body: { dealerIds: [...] } or { routeId }
 * Returns optimized order of dealers based on GPS proximity.
 */
export const optimizeDealerOrder = async (req, res) => {
  try {
    const { dealerIds, routeId } = req.body;
    const { Dealer, Route } = getModels(req);

    let dealers;

    if (routeId) {
      dealers = await Dealer.find({ routeId, isActive: true })
        .select('_id name code address location').lean();
    } else if (dealerIds && dealerIds.length > 0) {
      dealers = await Dealer.find({ _id: { $in: dealerIds } })
        .select('_id name code address location').lean();
    } else {
      return res.status(400).json({
        success: false,
        message: 'Provide either routeId or dealerIds'
      });
    }

    if (dealers.length === 0) {
      return res.json({ success: true, dealers: [], message: 'No dealers found' });
    }

    const optimized = optimizeByProximity(dealers);

    res.json({
      success: true,
      dealers: optimized.map((d, i) => ({
        _id: d._id,
        name: d.name,
        code: d.code,
        address: d.address,
        location: d.location,
        visitOrder: i + 1,
      })),
      totalDealers: optimized.length,
      hasCoordinates: optimized.filter(d => getCoords(d)).length,
      withoutCoordinates: optimized.filter(d => !getCoords(d)).length,
    });
  } catch (error) {
    console.error('Optimize dealer order error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Helper: Get coordinates from dealer ──────────────────────────────────────
function getCoords(dealer) {
  const c = dealer.location?.coordinates;
  // Actual schema shape: location.coordinates = { lat, lng } (object)
  if (c && typeof c === 'object' && !Array.isArray(c) &&
      (c.lat || c.lng) && (c.lat !== 0 || c.lng !== 0)) {
    return { lat: c.lat, lng: c.lng };
  }
  // GeoJSON array fallback: [lng, lat]
  if (Array.isArray(c) && c.length === 2 && (c[0] !== 0 || c[1] !== 0)) {
    return { lng: c[0], lat: c[1] };
  }
  if (dealer.location?.latitude && dealer.location?.longitude) {
    return { lat: dealer.location.latitude, lng: dealer.location.longitude };
  }
  return null;
}

// ── Helper: Haversine distance (km) ─────────────────────────────────────────
function haversineDistance(coord1, coord2) {
  const R = 6371; // Earth radius in km
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Helper: Nearest-neighbor route optimization ─────────────────────────────
function optimizeByProximity(dealers) {
  // Separate dealers with and without coordinates
  const withCoords = dealers.filter(d => getCoords(d));
  const withoutCoords = dealers.filter(d => !getCoords(d));

  if (withCoords.length <= 1) {
    // Can't optimize, return as-is
    return [...withCoords, ...withoutCoords];
  }

  // Nearest-neighbor algorithm
  const optimized = [];
  const remaining = [...withCoords];

  // Start with first dealer
  let current = remaining.shift();
  optimized.push(current);

  while (remaining.length > 0) {
    const currentCoords = getCoords(current);
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const coords = getCoords(remaining[i]);
      if (coords) {
        const dist = haversineDistance(currentCoords, coords);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
    }

    current = remaining.splice(nearestIdx, 1)[0];
    optimized.push(current);
  }

  // Append dealers without coordinates at the end
  return [...optimized, ...withoutCoords];
}
