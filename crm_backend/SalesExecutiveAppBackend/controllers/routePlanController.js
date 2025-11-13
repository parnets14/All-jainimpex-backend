import RoutePlan from '../models/RoutePlan.js';
import Dealer from '../../models/Dealer.js';
import User from '../../models/User.js';

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

    const query = {};

    if (salesExecutive) {
      query.salesExecutive = salesExecutive;
    }

    if (status) {
      query.status = status;
    }

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

    // Validate sales executive
    const se = await User.findById(salesExecutive);
    if (!se || se.role !== 'sales_executive') {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales executive'
      });
    }

    // Check if route plan already exists for this date
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

    // Validate dealers and check if they belong to SE's region
    const dealerIds = dealers.map(d => d.dealer);
    const dealerDocs = await Dealer.find({ _id: { $in: dealerIds } });

    if (dealerDocs.length !== dealerIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some dealers not found'
      });
    }

    // Check if dealers belong to SE's assigned regions
    const seRegions = se.assignedRegions || [];
    const seRegionIds = seRegions.map(r => r.toString());
    
    const invalidDealers = dealerDocs.filter(dealer => 
      !seRegionIds.includes(dealer.regionId?.toString())
    );

    if (invalidDealers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Some dealers are not in the sales executive's assigned regions: ${invalidDealers.map(d => d.name).join(', ')}`
      });
    }

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

    const routePlan = await RoutePlan.findById(id);
    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    // Don't allow updates to completed plans
    if (routePlan.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update completed route plan'
      });
    }

    // Update dealers if provided
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

    const routePlan = await RoutePlan.findById(id);
    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    // Don't allow deletion of active or completed plans
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

    console.log('🔍 getTodayRoutePlan called');
    console.log('   User ID:', userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log('   Date range:', { today: today.toISOString(), tomorrow: tomorrow.toISOString() });

    const routePlan = await RoutePlan.findOne({
      salesExecutive: userId,
      date: { $gte: today, $lt: tomorrow }
    })
      .populate('dealers.dealer', 'name code address phone contactPerson regionId');

    console.log('   Route plan found:', !!routePlan);
    if (routePlan) {
      console.log('   Route plan ID:', routePlan._id);
      console.log('   Dealers count:', routePlan.dealers?.length);
    }

    if (!routePlan) {
      console.log('   ❌ No route plan found for user:', userId);
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

    const routePlan = await RoutePlan.findById(routePlanId);
    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    if (routePlan.salesExecutive.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (routePlan.status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'Route already started'
      });
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

    const routePlan = await RoutePlan.findById(routePlanId);
    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    if (routePlan.salesExecutive.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (routePlan.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Route is not active'
      });
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
    const userId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const routePlans = await RoutePlan.find({
      salesExecutive: userId
    })
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
    const userId = req.user.userId;

    // Get sales executive with assigned regions
    const se = await User.findById(userId);
    if (!se || !se.assignedRegions || se.assignedRegions.length === 0) {
      return res.json({
        success: true,
        dealers: [],
        message: 'No regions assigned to this sales executive'
      });
    }

    // Find dealers in the assigned regions
    const dealers = await Dealer.find({
      regionId: { $in: se.assignedRegions },
      isActive: true
    }).select('name code address phone contactPerson regionId');

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

    const routePlan = await RoutePlan.findById(routePlanId);
    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    if (routePlan.salesExecutive.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find the dealer in the route plan
    const dealerIndex = routePlan.dealers.findIndex(d => d.dealer.toString() === dealerId);
    if (dealerIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found in route plan'
      });
    }

    // Update dealer status
    routePlan.dealers[dealerIndex].status = 'visited';
    routePlan.dealers[dealerIndex].actualVisitTime = visitTime || new Date();
    routePlan.dealers[dealerIndex].remarks = remarks;

    // Store additional visit data
    if (!routePlan.dealers[dealerIndex].visitData) {
      routePlan.dealers[dealerIndex].visitData = {};
    }
    routePlan.dealers[dealerIndex].visitData = {
      orderTaken,
      orderAmount,
      paymentReceived,
      paymentAmount,
      location
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

    const routePlan = await RoutePlan.findById(routePlanId);
    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    if (routePlan.salesExecutive.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find the dealer in the route plan
    const dealerIndex = routePlan.dealers.findIndex(d => d.dealer.toString() === dealerId);
    if (dealerIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found in route plan'
      });
    }

    // Update dealer status
    routePlan.dealers[dealerIndex].status = 'skipped';
    routePlan.dealers[dealerIndex].remarks = reason;

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
