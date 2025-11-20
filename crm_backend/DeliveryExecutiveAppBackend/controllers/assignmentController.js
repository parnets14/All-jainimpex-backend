import DeliveryAssignment from '../models/DeliveryAssignment.js';
import User from '../../models/User.js';
import SalesOrder from '../../models/SalesOrder.js';
import Dealer from '../../models/Dealer.js';
import Notification from '../models/Notification.js';

// Get confirmed orders that are not yet assigned (or all if showAssigned is true)
export const getConfirmedOrders = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      showAssigned = false,
      search = '',
      dealer = '',
      startDate = '',
      endDate = '',
      minAmount = '',
      maxAmount = ''
    } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    console.log('🔍 Fetching confirmed orders for delivery assignment...', { 
      page: pageNum, 
      limit: limitNum,
      showAssigned: showAssigned === 'true' || showAssigned === true,
      search,
      dealer,
      startDate,
      endDate,
      minAmount,
      maxAmount
    });
    
    // Build query for sales orders
    const orderQuery = { status: 'Confirmed' };
    
    // Date range filter
    if (startDate || endDate) {
      orderQuery.orderDate = {};
      if (startDate) {
        orderQuery.orderDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Include entire end date
        orderQuery.orderDate.$lte = end;
      }
    }
    
    // Amount range filter
    if (minAmount || maxAmount) {
      orderQuery.totalAmount = {};
      if (minAmount) {
        orderQuery.totalAmount.$gte = parseFloat(minAmount);
      }
      if (maxAmount) {
        orderQuery.totalAmount.$lte = parseFloat(maxAmount);
      }
    }
    
    // Get all confirmed sales orders
    // Include delivery address fields (deliveryLatitude, deliveryLongitude, etc.)
    let confirmedOrders = await SalesOrder.find(orderQuery)
      .select('orderNumber dealer dealerName dealerCode pinCode deliveryAddress deliveryCity deliveryArea deliveryPinCode deliveryLatitude deliveryLongitude region products orderDate deliveryDate totalAmount createdAt')
      .populate('dealer', 'name code phone address')
      .populate('region', 'name')
      .populate('products.product', 'productCode itemName')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${confirmedOrders.length} confirmed orders`);

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      confirmedOrders = confirmedOrders.filter(order => 
        order.orderNumber?.toLowerCase().includes(searchLower) ||
        order.dealerName?.toLowerCase().includes(searchLower) ||
        order.dealer?.name?.toLowerCase().includes(searchLower) ||
        order.dealerAddress?.toLowerCase().includes(searchLower) ||
        order.dealer?.address?.toLowerCase().includes(searchLower)
      );
    }
    
    // Dealer filter
    if (dealer) {
      confirmedOrders = confirmedOrders.filter(order => 
        order.dealer?._id?.toString() === dealer ||
        order.dealer?.name?.toLowerCase().includes(dealer.toLowerCase())
      );
    }

    // Get all assigned order IDs with assignment details
    const assignments = await DeliveryAssignment.find({
      status: { $in: ['assigned', 'in_transit'] }
    })
      .populate('deliveryExecutive', 'name phone')
      .populate('salesOrder', 'orderNumber')
      .lean();

    const assignedOrderIds = assignments.map(a => a.salesOrder?._id || a.salesOrder);
    const assignmentMap = new Map();
    assignments.forEach(a => {
      if (a.salesOrder) {
        const orderId = a.salesOrder._id?.toString() || a.salesOrder.toString();
        assignmentMap.set(orderId, {
          executive: a.deliveryExecutive,
          status: a.status,
          scheduledDate: a.scheduledDate,
          assignedDate: a.assignedDate
        });
      }
    });

    console.log(`📦 Found ${assignedOrderIds.length} already assigned orders`);

    // Filter out already assigned orders only if showAssigned is false
    let filteredOrders = confirmedOrders;
    if (showAssigned !== 'true' && showAssigned !== true) {
      filteredOrders = confirmedOrders.filter(
        order => !assignedOrderIds.some(
          assignedId => {
            const assignedIdStr = assignedId?.toString();
            const orderIdStr = order._id?.toString();
            return assignedIdStr === orderIdStr;
          }
        )
      );
    }

    console.log(`✨ ${filteredOrders.length} ${showAssigned === 'true' || showAssigned === true ? 'total' : 'unassigned'} confirmed orders available`);

    // Format orders for frontend
    const formattedOrders = filteredOrders.map(order => {
      const dealer = order.dealer || {};
      // Use delivery address if available (corrected), otherwise use dealer address
      const hasDeliveryAddress = order.deliveryAddress || order.deliveryCity || order.deliveryPinCode;
      const orderIdStr = order._id?.toString();
      const assignment = assignmentMap.get(orderIdStr);
      
      return {
        _id: order._id,
        orderNumber: order.orderNumber,
        dealerName: order.dealerName || dealer.name || 'Unknown Dealer',
        dealerCode: order.dealerCode || dealer.code || '',
        dealerPhone: dealer.phone || '',
        // Use corrected delivery address if available, otherwise use dealer address
        dealerAddress: hasDeliveryAddress 
          ? (order.deliveryAddress || dealer.address || '')
          : (dealer.address || ''),
        dealerCity: hasDeliveryAddress 
          ? (order.deliveryCity || '')
          : '',
        dealerArea: hasDeliveryAddress 
          ? (order.deliveryArea || '')
          : '',
        dealerPinCode: hasDeliveryAddress 
          ? (order.deliveryPinCode || order.pinCode || '')
          : (order.pinCode || ''),
        // Include GPS coordinates if available
        latitude: order.deliveryLatitude || null,
        longitude: order.deliveryLongitude || null,
        dealerId: dealer._id || order.dealer,
        region: order.region?.name || '',
        itemCount: order.products?.length || 0,
        totalAmount: order.totalAmount || 0,
        orderDate: order.orderDate || order.createdAt,
        deliveryDate: order.deliveryDate,
        createdAt: order.createdAt,
        // Assignment details if assigned
        isAssigned: !!assignment,
        assignedExecutive: assignment?.executive ? {
          name: assignment.executive.name,
          phone: assignment.executive.phone
        } : null,
        assignmentStatus: assignment?.status || null,
        scheduledDate: assignment?.scheduledDate || null,
        assignedDate: assignment?.assignedDate || null,
        products: order.products?.map(p => ({
          productName: p.productName || p.product?.itemName || 'Unknown Product',
          quantity: p.quantity || 0,
          totalPrice: p.totalPrice || 0
        })) || []
      };
    });

    // Apply pagination
    const totalItems = formattedOrders.length;
    const paginatedOrders = formattedOrders.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalItems / limitNum);

    console.log(`📋 Returning ${paginatedOrders.length} orders (page ${pageNum} of ${totalPages})`);

    res.json({
      success: true,
      data: paginatedOrders,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalItems,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('❌ Get confirmed orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch confirmed orders',
      error: error.message,
    });
  }
};

// Get all delivery executives
export const getDeliveryExecutives = async (req, res) => {
  try {
    const executives = await User.find({
      role: 'delivery_executive',
      status: 'Active'
    })
      .select('name phone email status')
      .lean();

    // Get assignment counts for each executive
    const executivesWithStats = await Promise.all(
      executives.map(async (exec) => {
        const assignedOrders = await DeliveryAssignment.countDocuments({
          deliveryExecutive: exec._id,
          status: { $in: ['assigned', 'in_transit'] }
        });

        const completedToday = await DeliveryAssignment.countDocuments({
          deliveryExecutive: exec._id,
          status: 'delivered',
          deliveryTime: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        });

        return {
          ...exec,
          assignedOrders,
          completedToday
        };
      })
    );

    res.json({
      success: true,
      data: executivesWithStats
    });
  } catch (error) {
    console.error('Get delivery executives error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery executives',
      error: error.message,
    });
  }
};

// Assign orders to delivery executive
export const assignOrders = async (req, res) => {
  try {
    const { executiveId, orderIds, scheduledDate, correctedAddresses } = req.body;

    if (!executiveId || !orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Executive ID and order IDs are required',
      });
    }

    // Validate executive exists
    const executive = await User.findById(executiveId);
    if (!executive || executive.role !== 'delivery_executive') {
      return res.status(404).json({
        success: false,
        message: 'Delivery executive not found',
      });
    }

    // Validate orders exist and are confirmed
    const orders = await SalesOrder.find({
      _id: { $in: orderIds },
      status: 'Confirmed'
    })
      .populate('dealer', 'name address')
      .lean();

    if (orders.length !== orderIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some orders are invalid or not confirmed',
      });
    }

    // Check if orders are already assigned
    const existingAssignments = await DeliveryAssignment.find({
      salesOrder: { $in: orderIds },
      status: { $in: ['assigned', 'in_transit'] }
    });

    if (existingAssignments.length > 0) {
      const assignedOrderNumbers = await SalesOrder.find({
        _id: { $in: existingAssignments.map(a => a.salesOrder) }
      }).select('orderNumber').lean();
      
      console.log('⚠️ Some orders are already assigned:', assignedOrderNumbers.map(o => o.orderNumber));
      
      return res.status(400).json({
        success: false,
        message: `Some orders are already assigned: ${assignedOrderNumbers.map(o => o.orderNumber).join(', ')}`,
        assignedOrders: assignedOrderNumbers.map(o => o.orderNumber)
      });
    }

    // Create assignments with corrected addresses if provided
    const assignments = await Promise.all(
      orders.map(async (order, index) => {
        // Get corrected address for this order if provided
        const correctedAddress = correctedAddresses?.[order._id.toString()] || {};
        const dealer = order.dealer || {};

        const assignment = new DeliveryAssignment({
          deliveryExecutive: executiveId,
          salesOrder: order._id,
          dealer: order.dealer,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
          deliverySequence: index + 1,
          status: 'assigned',
          assignedBy: req.user.userId || req.user._id,
          notes: correctedAddress.address 
            ? `Corrected address: ${correctedAddress.address}${correctedAddress.city ? ', ' + correctedAddress.city : ''}${correctedAddress.pinCode ? ' - ' + correctedAddress.pinCode : ''}`
            : undefined
        });

        // Store delivery location with coordinates
        // Priority: 1. Corrected address from web form, 2. SalesOrder delivery address
        const hasCorrectAddress = correctedAddress.address || correctedAddress.latitude || correctedAddress.longitude;
        const hasSalesOrderCoords = order.deliveryLatitude || order.deliveryLongitude;
        
        if (hasCorrectAddress || hasSalesOrderCoords || order.deliveryAddress) {
          assignment.deliveryLocation = {
            address: correctedAddress.address || order.deliveryAddress || dealer.address || '',
            latitude: correctedAddress.latitude 
              ? parseFloat(correctedAddress.latitude) 
              : (order.deliveryLatitude ? parseFloat(order.deliveryLatitude) : null),
            longitude: correctedAddress.longitude 
              ? parseFloat(correctedAddress.longitude) 
              : (order.deliveryLongitude ? parseFloat(order.deliveryLongitude) : null)
          };
          
          console.log(`📍 Set delivery location for order ${order.orderNumber}:`, {
            address: assignment.deliveryLocation.address,
            latitude: assignment.deliveryLocation.latitude,
            longitude: assignment.deliveryLocation.longitude
          });
        }

        // Generate OTP for delivery verification
        assignment.generateDeliveryOTP();

        await assignment.save();
        
        // Update SalesOrder status to "Processing" when assigned to delivery executive
        await SalesOrder.findByIdAndUpdate(order._id, {
          status: 'Processing'
        });
        console.log(`✅ Updated SalesOrder ${order.orderNumber} status to "Processing" after assignment`);
        
        return assignment;
      })
    );

    // Create notification for delivery executive
    try {
      console.log(`📢 Creating notification for executive ${executiveId}...`);
      const notification = await Notification.create({
        user: executiveId,
        type: 'new_assignment',
        title: `${assignments.length} New ${assignments.length === 1 ? 'Delivery' : 'Deliveries'} Assigned`,
        message: `You have been assigned ${assignments.length} new ${assignments.length === 1 ? 'delivery' : 'deliveries'} for ${scheduledDate ? new Date(scheduledDate).toLocaleDateString() : 'today'}.`,
        data: {
          assignmentIds: assignments.map(a => a._id),
          count: assignments.length,
          scheduledDate: scheduledDate
        }
      });
      console.log(`✅ Notification created successfully:`, {
        id: notification._id,
        user: notification.user,
        title: notification.title,
        message: notification.message
      });
    } catch (notifError) {
      console.error('⚠️ Failed to create notification:', notifError);
      console.error('⚠️ Notification error details:', {
        name: notifError.name,
        message: notifError.message,
        stack: notifError.stack
      });
      // Don't fail the assignment if notification fails
    }

    res.status(201).json({
      success: true,
      message: `Successfully assigned ${assignments.length} orders`,
      data: assignments,
    });
  } catch (error) {
    console.error('Assign orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign orders',
      error: error.message,
    });
  }
};

// Get all assignments (Admin - Web CRM)
export const getAllAssignments = async (req, res) => {
  try {
    const { 
      deliveryExecutive,
      status, 
      date, 
      startDate, 
      endDate,
      search,
      page = 1,
      limit = 20
    } = req.query;
    const query = {};

    // Delivery executive filter
    if (deliveryExecutive) {
      query.deliveryExecutive = deliveryExecutive;
    }

    // Status filter - include rescheduled items when filtering by 'assigned' or 'all'
    // Rescheduled items are now treated as 'assigned' for the new date
    if (status && status !== 'all') {
      if (status === 'assigned') {
        // Include both 'assigned' and 'rescheduled' statuses when filtering by assigned
        // (rescheduled items are now assigned to the new date)
        query.status = { $in: ['assigned', 'rescheduled'] };
      } else {
        query.status = status;
      }
    }

    // Date filter - support multiple formats
    // When no date filter is provided, show all assignments (including rescheduled ones)
    if (date) {
      // Single date filter
      const startDateFilter = new Date(date);
      startDateFilter.setHours(0, 0, 0, 0);
      const endDateFilter = new Date(date);
      endDateFilter.setHours(23, 59, 59, 999);
      query.scheduledDate = { $gte: startDateFilter, $lte: endDateFilter };
      console.log('📅 Date filter applied (getAllAssignments):', { date, startDateFilter, endDateFilter });
    } else if (startDate || endDate) {
      // Date range filter
      query.scheduledDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.scheduledDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.scheduledDate.$lte = end;
      }
      console.log('📅 Date range filter applied (getAllAssignments):', { startDate, endDate, query: query.scheduledDate });
    }

    // Search filter (order number or dealer name)
    if (search) {
      query.$or = [
        { 'salesOrder.orderNumber': { $regex: search, $options: 'i' } },
        { 'dealer.name': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const assignments = await DeliveryAssignment.find(query)
      .populate({
        path: 'salesOrder',
        select: 'orderNumber totalAmount products dealerName orderDate deliveryDate',
        populate: {
          path: 'products.product',
          select: 'productCode itemName'
        }
      })
      .populate('dealer', 'name phone address city area pinCode latitude longitude')
      .populate('deliveryExecutive', 'name phone empId')
      .populate('assignedBy', 'name')
      .populate('rescheduleHistory.rescheduledBy', 'name')
      .sort({ scheduledDate: -1, deliverySequence: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await DeliveryAssignment.countDocuments(query);

    res.json({
      success: true,
      data: assignments,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get all assignments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assignments',
      error: error.message,
    });
  }
};

// Get assignments for delivery executive
export const getMyAssignments = async (req, res) => {
  try {
    const { 
      status, 
      date, 
      startDate, 
      endDate,
      page = 1,
      limit = 50
    } = req.query;
    const query = { deliveryExecutive: req.user.userId || req.user._id };

    // Status filter - include rescheduled items when filtering by 'assigned' or 'all'
    // Rescheduled items are now treated as 'assigned' for the new date
    if (status && status !== 'all') {
      if (status === 'assigned') {
        // Include both 'assigned' and 'rescheduled' statuses when filtering by assigned
        // (rescheduled items are now assigned to the new date)
        query.status = { $in: ['assigned', 'rescheduled'] };
      } else {
        query.status = status;
      }
    }

    // Date filter - support multiple formats
    // When no date filter is provided, show all assignments (including rescheduled ones)
    if (date) {
      // Single date filter
      const startDateFilter = new Date(date);
      startDateFilter.setHours(0, 0, 0, 0);
      const endDateFilter = new Date(date);
      endDateFilter.setHours(23, 59, 59, 999);
      query.scheduledDate = { $gte: startDateFilter, $lte: endDateFilter };
      console.log('📅 Date filter applied (getMyAssignments):', { date, startDateFilter, endDateFilter, executiveId: req.user.userId || req.user._id });
    } else if (startDate || endDate) {
      // Date range filter
      query.scheduledDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.scheduledDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.scheduledDate.$lte = end;
      }
      console.log('📅 Date range filter applied (getMyAssignments):', { startDate, endDate, query: query.scheduledDate });
    }

    console.log('🔍 Final query for getMyAssignments:', JSON.stringify(query, null, 2));

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const assignments = await DeliveryAssignment.find(query)
      .populate({
        path: 'salesOrder',
        select: 'orderNumber totalAmount products dealerName orderDate deliveryDate',
        populate: {
          path: 'products.product',
          select: 'productCode itemName'
        }
      })
      .populate('dealer', 'name phone address city area pinCode latitude longitude')
      .populate('deliveryExecutive', 'name phone empId')
      .populate('assignedBy', 'name')
      .populate('rescheduleHistory.rescheduledBy', 'name')
      .sort({ scheduledDate: -1, deliverySequence: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await DeliveryAssignment.countDocuments(query);

    res.json({
      success: true,
      data: assignments,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assignments',
      error: error.message,
    });
  }
};

// Update assignment status
export const updateAssignmentStatus = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { status, notes, location } = req.body;

    const assignment = await DeliveryAssignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found',
      });
    }

    // Verify executive owns this assignment
    const executiveId = req.user.userId || req.user._id;
    if (assignment.deliveryExecutive.toString() !== executiveId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update this assignment',
      });
    }

    assignment.status = status;
    if (notes) assignment.notes = notes;
    if (location) {
      assignment.deliveryLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address || '',
      };
    }

    if (status === 'in_transit') {
      assignment.deliveryTime = new Date();
      // Update SalesOrder status to "In Transit"
      await SalesOrder.findByIdAndUpdate(assignment.salesOrder, {
        status: 'In Transit'
      });
      console.log('✅ Updated SalesOrder status to "In Transit"');
    } else if (status === 'delivered') {
      assignment.deliveryTime = new Date();
      // Update SalesOrder status to "Delivered"
      await SalesOrder.findByIdAndUpdate(assignment.salesOrder, {
        status: 'Delivered'
      });
      console.log('✅ Updated SalesOrder status to "Delivered"');
    } else if (status === 'rescheduled') {
      // Update SalesOrder status to "Rescheduled"
      await SalesOrder.findByIdAndUpdate(assignment.salesOrder, {
        status: 'Rescheduled'
      });
      console.log('✅ Updated SalesOrder status to "Rescheduled"');
    } else if (status === 'failed') {
      // Update SalesOrder status to "Missing" (failed delivery)
      await SalesOrder.findByIdAndUpdate(assignment.salesOrder, {
        status: 'Missing'
      });
      console.log('✅ Updated SalesOrder status to "Missing"');
    }

    await assignment.save();

    res.json({
      success: true,
      message: 'Assignment updated successfully',
      data: assignment,
    });
  } catch (error) {
    console.error('Update assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update assignment',
      error: error.message,
    });
  }
};

// Get all active executives (for admin)
export const getActiveExecutives = async (req, res) => {
  try {
    console.log('📡 Fetching active delivery executives...');
    const executives = await User.find({
      role: 'delivery_executive',
      status: 'Active'
    })
      .select('name phone email currentLocation')
      .lean();

    console.log(`✅ Found ${executives.length} active delivery executives`);

    // Get assignment counts for each executive
    const executivesWithStats = await Promise.all(
      executives.map(async (exec) => {
        const assignedOrders = await DeliveryAssignment.countDocuments({
          deliveryExecutive: exec._id,
          status: { $in: ['assigned', 'in_transit'] }
        });

        const completedToday = await DeliveryAssignment.countDocuments({
          deliveryExecutive: exec._id,
          status: 'delivered',
          deliveryTime: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        });

        // Get current delivery assignment
        const currentDelivery = await DeliveryAssignment.findOne({
          deliveryExecutive: exec._id,
          status: { $in: ['assigned', 'in_transit'] }
        })
          .populate('salesOrder', 'orderNumber')
          .populate('dealer', 'name')
          .sort({ scheduledDate: 1 })
          .lean();

        // Check if location is recent (within 5 minutes)
        const hasRecentLocation = exec.currentLocation?.lastUpdated &&
          new Date() - new Date(exec.currentLocation.lastUpdated) < 300000;

        const executiveData = {
          _id: exec._id,
          name: exec.name,
          phone: exec.phone,
          email: exec.email,
          assignedOrders,
          completedToday,
          status: hasRecentLocation ? 'active' : 'idle',
          latitude: exec.currentLocation?.latitude || null,
          longitude: exec.currentLocation?.longitude || null,
          lastLocationUpdate: exec.currentLocation?.lastUpdated || null,
          currentDelivery: currentDelivery ? {
            orderNumber: currentDelivery.salesOrder?.orderNumber,
            dealerName: currentDelivery.dealer?.name
          } : null
        };

        console.log(`📍 Executive ${exec.name}:`, {
          hasLocation: !!(exec.currentLocation?.latitude && exec.currentLocation?.longitude),
          latitude: exec.currentLocation?.latitude,
          longitude: exec.currentLocation?.longitude,
          lastUpdate: exec.currentLocation?.lastUpdated,
          status: executiveData.status
        });

        return executiveData;
      })
    );

    console.log(`✅ Returning ${executivesWithStats.length} executives with stats`);

    res.json({
      success: true,
      data: executivesWithStats,
    });
  } catch (error) {
    console.error('❌ Get active executives error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch executives',
      error: error.message,
    });
  }
};

// Update location
export const updateLocation = async (req, res) => {
  try {
    const { latitude, longitude, accuracy, speed } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
      });
    }

    const userId = req.user.userId || req.user._id;

    console.log(`📍 Updating location for user ${userId}:`, {
      latitude,
      longitude,
      accuracy,
      speed
    });

    const updateData = {
      currentLocation: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: accuracy ? parseFloat(accuracy) : null,
        speed: speed ? parseFloat(speed) : null,
        lastUpdated: new Date()
      }
    };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, select: 'name currentLocation' }
    );

    if (!updatedUser) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    console.log(`✅ Location updated successfully for ${updatedUser.name}`);

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        latitude: updatedUser.currentLocation.latitude,
        longitude: updatedUser.currentLocation.longitude,
        lastUpdated: updatedUser.currentLocation.lastUpdated
      }
    });
  } catch (error) {
    console.error('❌ Update location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message,
    });
  }
};

// Helper function: Get coordinates for an order (priority: delivery > dealer)
function getOrderCoordinates(order) {
  // Priority: deliveryLatitude/Longitude (corrected address) > dealer coordinates
  if (order.deliveryLatitude && order.deliveryLongitude) {
    return {
      latitude: order.deliveryLatitude,
      longitude: order.deliveryLongitude
    };
  }
  if (order.dealer && order.dealer.latitude && order.dealer.longitude) {
    return {
      latitude: order.dealer.latitude,
      longitude: order.dealer.longitude
    };
  }
  return { latitude: null, longitude: null };
}

// Helper function: Get address for an order (priority: delivery > dealer)
function getOrderAddress(order) {
  const dealer = order.dealer || {};
  // Priority: deliveryAddress (corrected) > dealer.address
  return order.deliveryAddress || dealer.address || '';
}

// Optimize route for selected orders
export const optimizeRoute = async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order IDs are required',
      });
    }

    // Get orders with dealer location information
    // Include delivery address fields (deliveryLatitude, deliveryLongitude, etc.)
    const orders = await SalesOrder.find({
      _id: { $in: orderIds }
    })
      .select('_id orderNumber dealer dealerName dealerCode deliveryAddress deliveryCity deliveryArea deliveryPinCode deliveryLatitude deliveryLongitude pinCode products')
      .populate('dealer', 'name address pinCode latitude longitude')
      .lean();
    
    try {
      console.log('🔍 Route optimization - Orders fetched:', orders.map(o => ({
        orderNumber: o.orderNumber,
        hasDeliveryCoords: !!(o.deliveryLatitude && o.deliveryLongitude),
        deliveryLat: o.deliveryLatitude,
        deliveryLng: o.deliveryLongitude,
        hasDealerCoords: !!(o.dealer?.latitude && o.dealer?.longitude)
      })));
    } catch (logError) {
      console.log('🔍 Route optimization - Orders fetched:', orders.length, 'orders');
    }

    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No orders found',
      });
    }

    // Separate orders with and without coordinates
    // Check delivery coordinates first (corrected address), then dealer coordinates
    const ordersWithLocation = orders.filter(order => {
      // Priority: deliveryLatitude/Longitude (corrected) > dealer.latitude/longitude
      const hasDeliveryCoords = order.deliveryLatitude && order.deliveryLongitude;
      const hasDealerCoords = order.dealer && order.dealer.latitude && order.dealer.longitude;
      const hasCoords = hasDeliveryCoords || hasDealerCoords;
      
      if (hasCoords) {
        console.log(`✅ Order ${order.orderNumber} has coordinates:`, {
          delivery: hasDeliveryCoords ? `${order.deliveryLatitude}, ${order.deliveryLongitude}` : 'none',
          dealer: hasDealerCoords ? `${order.dealer.latitude}, ${order.dealer.longitude}` : 'none'
        });
      }
      
      return hasCoords;
    });

    const ordersWithoutLocation = orders.filter(order => {
      // No coordinates in either delivery address or dealer
      const hasDeliveryCoords = order.deliveryLatitude && order.deliveryLongitude;
      const hasDealerCoords = order.dealer && order.dealer.latitude && order.dealer.longitude;
      return !hasDeliveryCoords && !hasDealerCoords;
    });
    
    console.log(`📍 Route optimization summary: ${ordersWithLocation.length} with coordinates, ${ordersWithoutLocation.length} without`);

    let optimizedRoute = [];
    let estimatedDistance = 0;
    let hasCoordinates = false;

    // If we have orders with coordinates, use nearest neighbor algorithm
    if (ordersWithLocation.length > 0) {
      optimizedRoute = optimizeRouteNearestNeighbor(ordersWithLocation);
      estimatedDistance = calculateTotalDistance(optimizedRoute);
      hasCoordinates = true;
      
      // Add orders without coordinates at the end
      ordersWithoutLocation.forEach((order, index) => {
        optimizedRoute.push({
          orderId: order._id,
          orderNumber: order.orderNumber,
          dealerName: order.dealerName || order.dealer?.name || 'Unknown Dealer',
          dealerAddress: getOrderAddress(order),
          latitude: null,
          longitude: null,
          sequence: optimizedRoute.length + 1
        });
      });
    } else {
      // If no coordinates, use simple sequential ordering by dealer name
      optimizedRoute = orders
        .sort((a, b) => {
          const nameA = (a.dealer?.name || a.dealerName || '').toLowerCase();
          const nameB = (b.dealer?.name || b.dealerName || '').toLowerCase();
          return nameA.localeCompare(nameB);
        })
        .map((order, index) => {
          return {
            orderId: order._id,
            orderNumber: order.orderNumber,
            dealerName: order.dealerName || order.dealer?.name || 'Unknown Dealer',
            dealerAddress: getOrderAddress(order),
            latitude: null,
            longitude: null,
            sequence: index + 1
          };
        });
      
      estimatedDistance = 0; // Cannot calculate without coordinates
      hasCoordinates = false;
    }

    res.json({
      success: true,
      data: {
        route: optimizedRoute,
        totalOrders: optimizedRoute.length,
        estimatedDistance: estimatedDistance.toFixed(2),
        hasCoordinates: hasCoordinates,
        message: hasCoordinates 
          ? 'Route optimized using GPS coordinates' 
          : 'Route ordered alphabetically (GPS coordinates not available for distance calculation)'
      },
    });
  } catch (error) {
    console.error('❌ Optimize route error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to optimize route',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Helper function: Nearest Neighbor algorithm for route optimization
function optimizeRouteNearestNeighbor(orders) {
  if (orders.length <= 1) {
    // Return single order with proper coordinates
    const order = orders[0];
    const coords = getOrderCoordinates(order);
    return [{
      orderId: order._id,
      orderNumber: order.orderNumber,
      dealerName: order.dealer?.name || order.dealerName,
      dealerAddress: getOrderAddress(order),
      latitude: coords.latitude,
      longitude: coords.longitude,
      sequence: 1
    }];
  }

  const route = [];
  const remaining = [...orders];
  let current = remaining.shift();
  const currentCoords = getOrderCoordinates(current);

  route.push({
    orderId: current._id,
    orderNumber: current.orderNumber,
    dealerName: current.dealer?.name || current.dealerName,
    dealerAddress: getOrderAddress(current),
    latitude: currentCoords.latitude,
    longitude: currentCoords.longitude,
    sequence: 1
  });

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const nextCoords = getOrderCoordinates(remaining[i]);
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
    const newCurrentCoords = getOrderCoordinates(current);
    route.push({
      orderId: current._id,
      orderNumber: current.orderNumber,
      dealerName: current.dealer?.name || current.dealerName,
      dealerAddress: getOrderAddress(current),
      latitude: newCurrentCoords.latitude,
      longitude: newCurrentCoords.longitude,
      sequence: route.length + 1
    });
    
    // Update current coordinates for next iteration
    Object.assign(currentCoords, newCurrentCoords);
  }

  return route;
}

// Helper function: Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;

  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper function: Calculate total distance of route
function calculateTotalDistance(route) {
  if (!route || route.length < 2) return 0;
  
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const distance = calculateDistance(
      route[i].latitude,
      route[i].longitude,
      route[i + 1].latitude,
      route[i + 1].longitude
    );
    // Only add valid distances (not Infinity)
    if (distance !== Infinity && !isNaN(distance)) {
      total += distance;
    }
  }
  return total; // Return number, not string
}


// Reassign delivery to different executive or date
export const reassignDelivery = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { executiveId, scheduledDate } = req.body;

    console.log(`🔄 Reassigning delivery ${assignmentId}...`, { executiveId, scheduledDate });

    // Find the assignment
    const assignment = await DeliveryAssignment.findById(assignmentId)
      .populate('deliveryExecutive', 'name')
      .populate('salesOrder', 'orderNumber');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found',
      });
    }

    // Check if assignment can be edited
    const scheduledDateObj = new Date(assignment.scheduledDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    scheduledDateObj.setHours(0, 0, 0, 0);

    if (scheduledDateObj <= today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit delivery on or after the scheduled date',
      });
    }

    if (['in_transit', 'delivered', 'failed'].includes(assignment.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit delivery that is in transit or completed',
      });
    }

    // Validate new executive if provided
    if (executiveId) {
      const executive = await User.findById(executiveId);
      if (!executive || executive.role !== 'delivery_executive') {
        return res.status(404).json({
          success: false,
          message: 'Delivery executive not found',
        });
      }
    }

    // Validate new date if provided
    if (scheduledDate) {
      const newDate = new Date(scheduledDate);
      newDate.setHours(0, 0, 0, 0);
      if (newDate <= today) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled date must be in the future',
        });
      }
    }

    const oldExecutiveId = assignment.deliveryExecutive;
    const oldExecutiveName = assignment.deliveryExecutive?.name || 'Unknown';
    const oldDate = assignment.scheduledDate;

    // Update assignment
    if (executiveId) {
      assignment.deliveryExecutive = executiveId;
    }
    if (scheduledDate) {
      assignment.scheduledDate = new Date(scheduledDate);
    }
    assignment.status = 'rescheduled';

    // Add to reschedule history
    assignment.rescheduleHistory = assignment.rescheduleHistory || [];
    assignment.rescheduleHistory.push({
      previousDate: oldDate,
      newDate: scheduledDate ? new Date(scheduledDate) : assignment.scheduledDate,
      previousExecutive: oldExecutiveId,
      newExecutive: executiveId || assignment.deliveryExecutive,
      reason: 'Reassigned by admin',
      rescheduledBy: req.user.userId || req.user._id,
      rescheduledAt: new Date()
    });

    await assignment.save();

    // Get new executive details
    const newExecutive = await User.findById(assignment.deliveryExecutive).select('name');

    // Create notification for new executive
    try {
      const dateStr = new Date(assignment.scheduledDate).toLocaleDateString('en-IN', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      await Notification.create({
        user: assignment.deliveryExecutive,
        type: 'assignment_updated',
        title: 'Delivery Assignment Updated',
        message: `Delivery for order #${assignment.salesOrder?.orderNumber || 'N/A'} has been reassigned to you for ${dateStr}.`,
        data: {
          assignmentId: assignment._id,
          orderNumber: assignment.salesOrder?.orderNumber,
          scheduledDate: assignment.scheduledDate
        }
      });
      console.log(`✅ Notification sent to new executive ${assignment.deliveryExecutive}`);
    } catch (notifError) {
      console.error('⚠️ Failed to create notification:', notifError);
    }

    // If executive changed, notify old executive
    if (executiveId && oldExecutiveId.toString() !== executiveId.toString()) {
      try {
        await Notification.create({
          user: oldExecutiveId,
          type: 'assignment_updated',
          title: 'Delivery Assignment Removed',
          message: `Delivery for order #${assignment.salesOrder?.orderNumber || 'N/A'} has been reassigned to another executive.`,
          data: {
            assignmentId: assignment._id,
            orderNumber: assignment.salesOrder?.orderNumber
          }
        });
        console.log(`✅ Notification sent to old executive ${oldExecutiveId}`);
      } catch (notifError) {
        console.error('⚠️ Failed to create notification for old executive:', notifError);
      }
    }

    console.log(`✅ Delivery reassigned successfully from ${oldExecutiveName} to ${newExecutive?.name}`);

    res.json({
      success: true,
      message: `Delivery reassigned successfully to ${newExecutive?.name || 'executive'}`,
      data: assignment,
    });
  } catch (error) {
    console.error('❌ Reassign delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reassign delivery',
      error: error.message,
    });
  }
};
