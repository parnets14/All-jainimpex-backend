const de = (req) => req.deModels;

// Get delivery history (Mobile App & Web)
export const getDeliveryHistory = async (req, res) => {
  try {
    const { DeliveryAssignment } = de(req);
    const executiveId = req.user?.userId || req.user?._id;
    const { 
      page = 1, 
      limit = 20, 
      startDate, 
      endDate,
      status,
      search,
      dealer
    } = req.query;

    const query = {};

    // If executiveId is provided (mobile app), filter by executive
    // If not provided (web admin), show all
    if (executiveId) {
      query.deliveryExecutive = executiveId;
    }

    // Status filter
    if (status) {
      query.status = status;
    } else {
      // Default: show completed, delivered, and failed deliveries
      query.status = { $in: ['delivered', 'failed'] };
    }

    // Date range filter
    if (startDate || endDate) {
      query.deliveryTime = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.deliveryTime.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.deliveryTime.$lte = end;
      }
    }

    // Dealer filter
    if (dealer) {
      query.dealer = dealer;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let assignments = await DeliveryAssignment.find(query)
      .populate('deliveryExecutive', 'name empId phone')
      .populate('dealer', 'name code phone address')
      .populate({
        path: 'salesOrder',
        select: 'orderNumber totalAmount orderDate products',
        populate: {
          path: 'products.product',
          select: 'productCode itemName'
        }
      })
      .populate('assignedBy', 'name')
      .sort({ deliveryTime: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Search filter (by order number, dealer name, etc.)
    if (search) {
      const searchLower = search.toLowerCase();
      assignments = assignments.filter(assignment => 
        assignment.salesOrder?.orderNumber?.toLowerCase().includes(searchLower) ||
        assignment.dealer?.name?.toLowerCase().includes(searchLower) ||
        assignment.dealer?.code?.toLowerCase().includes(searchLower)
      );
    }

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
    console.error('Get delivery history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery history',
      error: error.message
    });
  }
};

// Get delivery history statistics
export const getDeliveryHistoryStats = async (req, res) => {
  try {
    const { DeliveryAssignment } = de(req);
    const executiveId = req.user?.userId || req.user?._id;
    const { startDate, endDate } = req.query;

    const query = {};

    if (executiveId) {
      query.deliveryExecutive = executiveId;
    }

    if (startDate || endDate) {
      query.deliveryTime = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.deliveryTime.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.deliveryTime.$lte = end;
      }
    }

    const [totalDeliveries, delivered, failed, inTransit] = await Promise.all([
      DeliveryAssignment.countDocuments({ ...query, status: { $in: ['delivered', 'failed', 'in_transit'] } }),
      DeliveryAssignment.countDocuments({ ...query, status: 'delivered' }),
      DeliveryAssignment.countDocuments({ ...query, status: 'failed' }),
      DeliveryAssignment.countDocuments({ ...query, status: 'in_transit' })
    ]);

    // Calculate success rate
    const successRate = totalDeliveries > 0 
      ? ((delivered / totalDeliveries) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        totalDeliveries,
        delivered,
        failed,
        inTransit,
        successRate: parseFloat(successRate)
      }
    });
  } catch (error) {
    console.error('Get delivery history stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery statistics',
      error: error.message
    });
  }
};

// Get delivery by ID
export const getDeliveryById = async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const executiveId = req.user?.userId || req.user?._id;

    const query = { _id: deliveryId };
    if (executiveId) {
      query.deliveryExecutive = executiveId;
    }

    const assignment = await DeliveryAssignment.findOne(query)
      .populate('deliveryExecutive', 'name empId phone')
      .populate('dealer', 'name code phone address')
      .populate({
        path: 'salesOrder',
        populate: {
          path: 'products.product',
          select: 'productCode itemName'
        }
      })
      .populate('assignedBy', 'name')
      .lean();

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    res.json({
      success: true,
      data: assignment
    });
  } catch (error) {
    console.error('Get delivery by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery',
      error: error.message
    });
  }
};




