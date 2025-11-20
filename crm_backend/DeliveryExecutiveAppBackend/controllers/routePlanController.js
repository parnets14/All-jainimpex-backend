import DeliveryRoute from '../models/DeliveryRoute.js';
import DeliveryAssignment from '../models/DeliveryAssignment.js';
import User from '../../models/User.js';
import SalesOrder from '../../models/SalesOrder.js';
import Notification from '../models/Notification.js';

// Get all route plans (Admin - Web CRM)
export const getAllRoutePlans = async (req, res) => {
  try {
    const { 
      deliveryExecutive, 
      status, 
      startDate, 
      endDate,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    if (deliveryExecutive) {
      query.deliveryExecutive = deliveryExecutive;
    }

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const routePlans = await DeliveryRoute.find(query)
      .populate('deliveryExecutive', 'name empId phone')
      .populate({
        path: 'deliveries',
        populate: {
          path: 'salesOrder',
          select: 'orderNumber totalAmount dealerName',
          populate: {
            path: 'dealer',
            select: 'name code address phone'
          }
        }
      })
      .populate({
        path: 'optimizedRoute.delivery',
        populate: {
          path: 'salesOrder',
          select: 'orderNumber totalAmount dealerName',
          populate: {
            path: 'dealer',
            select: 'name code address phone'
          }
        }
      })
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await DeliveryRoute.countDocuments(query);

    res.json({
      success: true,
      data: routePlans,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        itemsPerPage: parseInt(limit)
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

// Get route plan by ID (Admin - Web CRM)
export const getRoutePlanById = async (req, res) => {
  try {
    const { routeId } = req.params;

    const routePlan = await DeliveryRoute.findById(routeId)
      .populate('deliveryExecutive', 'name empId phone')
      .populate({
        path: 'deliveries',
        populate: {
          path: 'salesOrder',
          populate: {
            path: 'dealer',
            select: 'name code address phone'
          }
        }
      })
      .populate({
        path: 'optimizedRoute.delivery',
        populate: {
          path: 'salesOrder',
          populate: {
            path: 'dealer',
            select: 'name code address phone'
          }
        }
      })
      .lean();

    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    res.json({
      success: true,
      data: routePlan
    });
  } catch (error) {
    console.error('Get route plan by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch route plan',
      error: error.message
    });
  }
};

// Get today's route plan (Mobile App)
export const getTodayRoutePlan = async (req, res) => {
  try {
    const executiveId = req.user.userId || req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const routePlan = await DeliveryRoute.findOne({
      deliveryExecutive: executiveId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    })
      .populate({
        path: 'deliveries',
        populate: {
          path: 'salesOrder',
          populate: {
            path: 'dealer',
            select: 'name code address phone deliveryAddress deliveryCity deliveryPinCode'
          }
        }
      })
      .populate({
        path: 'optimizedRoute.delivery',
        populate: {
          path: 'salesOrder',
          populate: {
            path: 'dealer',
            select: 'name code address phone deliveryAddress deliveryCity deliveryPinCode'
          }
        }
      })
      .lean();

    if (!routePlan) {
      return res.json({
        success: true,
        data: null,
        message: 'No route plan for today'
      });
    }

    res.json({
      success: true,
      data: routePlan
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
    const executiveId = req.user.userId || req.user._id;
    const { routeId, location } = req.body;

    const routePlan = await DeliveryRoute.findById(routeId);
    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    if (routePlan.deliveryExecutive.toString() !== executiveId.toString()) {
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
    await routePlan.save();

    res.json({
      success: true,
      message: 'Route started successfully',
      data: routePlan
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
    const executiveId = req.user.userId || req.user._id;
    const { routeId, totalDistance } = req.body;

    const routePlan = await DeliveryRoute.findById(routeId);
    if (!routePlan) {
      return res.status(404).json({
        success: false,
        message: 'Route plan not found'
      });
    }

    if (routePlan.deliveryExecutive.toString() !== executiveId.toString()) {
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
    if (totalDistance) {
      routePlan.totalDistance = parseFloat(totalDistance);
    }
    await routePlan.save();

    res.json({
      success: true,
      message: 'Route completed successfully',
      data: routePlan
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

// Create route plan from assignments (Admin - Web CRM)
export const createRoutePlanFromAssignments = async (req, res) => {
  try {
    const { deliveryExecutive, date, assignmentIds, optimize = true } = req.body;

    if (!deliveryExecutive || !date || !assignmentIds || !Array.isArray(assignmentIds) || assignmentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Delivery executive, date, and assignment IDs are required'
      });
    }

    // Validate delivery executive
    const executive = await User.findById(deliveryExecutive);
    if (!executive || executive.role !== 'delivery_executive') {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery executive'
      });
    }

    // Check if route plan already exists for this date
    const routeDate = new Date(date);
    routeDate.setHours(0, 0, 0, 0);
    const routeDateEnd = new Date(routeDate);
    routeDateEnd.setDate(routeDateEnd.getDate() + 1);

    const existingPlan = await DeliveryRoute.findOne({
      deliveryExecutive,
      date: {
        $gte: routeDate,
        $lt: routeDateEnd
      }
    });

    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: 'Route plan already exists for this date'
      });
    }

    // Get assignments
    const assignments = await DeliveryAssignment.find({
      _id: { $in: assignmentIds },
      deliveryExecutive: deliveryExecutive
    })
      .populate('salesOrder', 'orderNumber deliveryLatitude deliveryLongitude')
      .populate('dealer', 'name latitude longitude')
      .lean();

    if (assignments.length !== assignmentIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some assignments not found or do not belong to this executive'
      });
    }

    // Build optimized route if requested
    let optimizedRoute = [];
    if (optimize && assignments.length > 0) {
      // Get assignments with coordinates
      const assignmentsWithCoords = assignments.filter(a => {
        const hasDeliveryCoords = a.salesOrder?.deliveryLatitude && a.salesOrder?.deliveryLongitude;
        const hasDealerCoords = a.dealer?.latitude && a.dealer?.longitude;
        return hasDeliveryCoords || hasDealerCoords;
      });

      const assignmentsWithoutCoords = assignments.filter(a => {
        const hasDeliveryCoords = a.salesOrder?.deliveryLatitude && a.salesOrder?.deliveryLongitude;
        const hasDealerCoords = a.dealer?.latitude && a.dealer?.longitude;
        return !hasDeliveryCoords && !hasDealerCoords;
      });

      // Sort assignments with coordinates by nearest neighbor
      if (assignmentsWithCoords.length > 0) {
        const sorted = optimizeAssignmentsRoute(assignmentsWithCoords);
        optimizedRoute = sorted.map((assignment, index) => ({
          sequence: index + 1,
          delivery: assignment._id,
          estimatedTime: 15, // Default 15 minutes per stop
          distance: 0 // Will be calculated if needed
        }));

        // Add assignments without coordinates at the end
        assignmentsWithoutCoords.forEach((assignment) => {
          optimizedRoute.push({
            sequence: optimizedRoute.length + 1,
            delivery: assignment._id,
            estimatedTime: 15,
            distance: 0
          });
        });
      } else {
        // No coordinates, use assignment sequence
        optimizedRoute = assignments.map((assignment, index) => ({
          sequence: (assignment.deliverySequence || index + 1),
          delivery: assignment._id,
          estimatedTime: 15,
          distance: 0
        }));
      }
    } else {
      // Use assignment sequence
      optimizedRoute = assignments.map((assignment, index) => ({
        sequence: (assignment.deliverySequence || index + 1),
        delivery: assignment._id,
        estimatedTime: 15,
        distance: 0
      }));
    }

    // Create route plan
    const routePlan = new DeliveryRoute({
      deliveryExecutive,
      date: routeDate,
      deliveries: assignmentIds,
      optimizedRoute: optimizedRoute,
      status: 'draft'
    });

    await routePlan.save();

    const populatedPlan = await DeliveryRoute.findById(routePlan._id)
      .populate('deliveryExecutive', 'name empId phone')
      .populate({
        path: 'deliveries',
        populate: {
          path: 'salesOrder',
          select: 'orderNumber totalAmount dealerName',
          populate: {
            path: 'dealer',
            select: 'name code address phone'
          }
        }
      })
      .populate({
        path: 'optimizedRoute.delivery',
        populate: {
          path: 'salesOrder',
          select: 'orderNumber totalAmount dealerName',
          populate: {
            path: 'dealer',
            select: 'name code address phone'
          }
        }
      })
      .lean();

    // Create notification for delivery executive
    try {
      await Notification.create({
        user: deliveryExecutive,
        type: 'route_created',
        title: 'Route Plan Created',
        message: `Your optimized route plan for ${new Date(routeDate).toLocaleDateString()} has been created with ${assignmentIds.length} ${assignmentIds.length === 1 ? 'delivery' : 'deliveries'}.`,
        data: {
          routeId: routePlan._id,
          deliveryCount: assignmentIds.length,
          date: routeDate
        }
      });
      console.log(`✅ Route plan notification created for executive ${deliveryExecutive}`);
    } catch (notifError) {
      console.error('⚠️ Failed to create route notification:', notifError);
    }

    res.status(201).json({
      success: true,
      message: 'Route plan created successfully',
      data: populatedPlan
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

// Helper function to optimize assignments route using nearest neighbor
function optimizeAssignmentsRoute(assignments) {
  if (assignments.length <= 1) return assignments;

  const route = [];
  const remaining = [...assignments];
  let current = remaining.shift();

  route.push(current);

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    const currentCoords = getAssignmentCoordinates(current);

    for (let i = 0; i < remaining.length; i++) {
      const nextCoords = getAssignmentCoordinates(remaining[i]);
      const distance = calculateDistance(
        currentCoords.latitude,
        currentCoords.longitude,
        nextCoords.latitude,
        nextCoords.longitude
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    current = remaining.splice(nearestIndex, 1)[0];
    route.push(current);
  }

  return route;
}

// Helper function to get coordinates from assignment
function getAssignmentCoordinates(assignment) {
  // Priority: deliveryLocation > salesOrder delivery coords > dealer coords
  if (assignment.deliveryLocation?.latitude && assignment.deliveryLocation?.longitude) {
    return {
      latitude: assignment.deliveryLocation.latitude,
      longitude: assignment.deliveryLocation.longitude
    };
  }
  if (assignment.salesOrder?.deliveryLatitude && assignment.salesOrder?.deliveryLongitude) {
    return {
      latitude: assignment.salesOrder.deliveryLatitude,
      longitude: assignment.salesOrder.deliveryLongitude
    };
  }
  if (assignment.dealer?.latitude && assignment.dealer?.longitude) {
    return {
      latitude: assignment.dealer.latitude,
      longitude: assignment.dealer.longitude
    };
  }
  return { latitude: 0, longitude: 0 };
}

// Helper function to calculate distance (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

