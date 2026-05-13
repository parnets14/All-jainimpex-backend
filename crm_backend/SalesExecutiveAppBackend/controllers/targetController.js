import { getModels } from '../utils/getModels.js';

// Helper: notify the SE about their target
const notifySE = async (req, seUserId, type, title, message, data = {}) => {
  try {
    const { SENotification, User } = getModels(req);
    const notif = await SENotification.create({ user: seUserId, type, title, message, data, priority: 'high' });
    const seUser = await User.findById(seUserId).select('fcmToken').lean();
    if (seUser?.fcmToken) {
      const { sendPushNotification } = await import('../../services/firebaseNotificationService.js');
      await sendPushNotification({
        token: seUser.fcmToken, title, body: message,
        data: { type, notificationId: notif._id.toString(), ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) },
      });
    }
  } catch (e) {
    console.error('notifySE (target) error (non-fatal):', e.message);
  }
};

// Create target (Admin)
export const createTarget = async (req, res) => {
  try {
    const {
      salesExecutive,
      targetType,
      startDate,
      endDate,
      targets,
      incentive,
      notes
    } = req.body;
    const { User, Target } = getModels(req);

    console.log('📊 Creating target for:', salesExecutive);

    const seUser = await User.findById(salesExecutive);
    if (!seUser) {
      return res.status(404).json({
        success: false,
        message: 'Sales executive not found'
      });
    }

    const existingTarget = await Target.findOne({
      salesExecutive,
      targetType,
      status: 'Active',
      $or: [
        {
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) }
        }
      ]
    });

    if (existingTarget) {
      return res.status(400).json({
        success: false,
        message: `An active ${targetType.toLowerCase()} target already exists for this period`
      });
    }

    const target = new Target({
      salesExecutive,
      salesExecutiveName: seUser.name,
      region: seUser.region,
      targetType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      targets,
      incentive,
      notes,
      createdBy: req.user._id
    });

    await target.save();

    console.log(`✅ Target created: ${target.targetNumber}`);

    // Notify the SE that a target has been assigned to them
    notifySE(req, salesExecutive, 'target_assigned',
      '🎯 New Target Assigned',
      `A new ${targetType} target has been assigned to you. Period: ${new Date(startDate).toLocaleDateString('en-IN')} – ${new Date(endDate).toLocaleDateString('en-IN')}`,
      { targetId: target._id.toString(), targetNumber: target.targetNumber, targetType }
    );

    res.status(201).json({
      success: true,
      message: 'Target created successfully',
      target
    });
  } catch (error) {
    console.error('Create target error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create target',
      error: error.message
    });
  }
};

// Get all targets (Admin)
export const getAllTargets = async (req, res) => {
  try {
    const {
      salesExecutive,
      targetType,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query;
    const { Target } = getModels(req);

    console.log('📊 Fetching targets (Admin)');

    let query = {};
    
    if (salesExecutive) query.salesExecutive = salesExecutive;
    if (targetType) query.targetType = targetType;
    if (status) query.status = status;
    
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const targets = await Target.find(query)
      .populate('salesExecutive', 'name email')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Target.countDocuments(query);

    console.log(`✅ Found ${targets.length} targets`);

    res.json({
      success: true,
      targets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get targets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch targets',
      error: error.message
    });
  }
};

// Get my targets (Sales Executive)
export const getMyTargets = async (req, res) => {
  try {
    const { status, targetType } = req.query;
    const salesExecutive = req.user._id;
    const { Target } = getModels(req);

    console.log('📊 Fetching my targets:', req.user.name);

    let query = { salesExecutive };
    if (status) query.status = status;
    if (targetType) query.targetType = targetType;

    const targets = await Target.find(query)
      .sort({ startDate: -1 })
      .lean();

    console.log(`✅ Found ${targets.length} targets for ${req.user.name}`);

    res.json({
      success: true,
      targets
    });
  } catch (error) {
    console.error('Get my targets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch targets',
      error: error.message
    });
  }
};

// Get current targets (Sales Executive)
export const getCurrentTargets = async (req, res) => {
  try {
    const salesExecutive = req.user._id;
    const today = new Date();
    const { Target } = getModels(req);

    console.log('📊 Fetching current targets:', req.user.name);

    const targets = await Target.find({
      salesExecutive,
      status: 'Active',
      startDate: { $lte: today },
      endDate: { $gte: today }
    }).sort({ targetType: 1 }).lean();

    // Calculate achievements for current targets
    for (let target of targets) {
      await calculateTargetAchievement(target._id, req);
    }

    const updatedTargets = await Target.find({
      _id: { $in: targets.map(t => t._id) }
    }).lean();

    console.log(`✅ Found ${updatedTargets.length} current targets`);

    res.json({
      success: true,
      targets: updatedTargets
    });
  } catch (error) {
    console.error('Get current targets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch current targets',
      error: error.message
    });
  }
};

// Calculate target achievement — accepts req for company-specific DB access
export const calculateTargetAchievement = async (targetId, req) => {
  try {
    const { Target, SalesOrder, Collection, RoutePlan } = getModels(req);

    const target = await Target.findById(targetId);
    if (!target) return;

    const { salesExecutive, startDate, endDate } = target;

    console.log(`🔄 Calculating achievement for target: ${target.targetNumber}`);

    const salesData = await SalesOrder.aggregate([
      {
        $match: {
          createdBy: salesExecutive,
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $in: ['Pending', 'Confirmed', 'Processing', 'In Transit', 'Delivered'] }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 }
        }
      }
    ]);

    const collectionData = await Collection.aggregate([
      {
        $match: {
          collectedBy: salesExecutive,
          collectionDate: { $gte: startDate, $lte: endDate },
          status: 'Approved'
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const visitData = await RoutePlan.aggregate([
      {
        $match: {
          salesExecutive,
          date: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$dealers' },
      { $match: { 'dealers.status': 'visited' } },
      {
        $group: {
          _id: null,
          visitCount: { $sum: 1 }
        }
      }
    ]);

    const achievement = {
      salesAmount: salesData[0]?.totalAmount || 0,
      orderCount: salesData[0]?.orderCount || 0,
      collectionAmount: collectionData[0]?.totalAmount || 0,
      visitCount: visitData[0]?.visitCount || 0
    };

    achievement.salesPercentage = target.targets.salesAmount > 0 
      ? Math.round((achievement.salesAmount / target.targets.salesAmount) * 100) 
      : 0;
    
    achievement.orderPercentage = target.targets.orderCount > 0 
      ? Math.round((achievement.orderCount / target.targets.orderCount) * 100) 
      : 0;
    
    achievement.collectionPercentage = target.targets.collectionAmount > 0 
      ? Math.round((achievement.collectionAmount / target.targets.collectionAmount) * 100) 
      : 0;
    
    achievement.visitPercentage = target.targets.visitCount > 0 
      ? Math.round((achievement.visitCount / target.targets.visitCount) * 100) 
      : 0;

    const percentages = [
      achievement.salesPercentage,
      achievement.orderPercentage,
      achievement.collectionPercentage,
      achievement.visitPercentage
    ].filter(p => p > 0);
    
    achievement.overallPercentage = percentages.length > 0 
      ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
      : 0;

    let incentiveEarned = 0;
    if (target.incentive.enabled && achievement.overallPercentage >= target.incentive.minAchievement) {
      if (target.incentive.type === 'Fixed') {
        incentiveEarned = target.incentive.fixedAmount;
      } else if (target.incentive.type === 'Percentage') {
        incentiveEarned = (achievement.salesAmount * target.incentive.percentage) / 100;
      } else if (target.incentive.type === 'Slab') {
        for (const slab of target.incentive.slabs) {
          if (achievement.overallPercentage >= slab.from && achievement.overallPercentage < slab.to) {
            incentiveEarned = slab.bonus;
            break;
          }
        }
      }
    }

    await Target.findByIdAndUpdate(targetId, {
      achievement,
      'incentive.earned': incentiveEarned,
      lastCalculated: new Date()
    });

    console.log(`✅ Achievement calculated: ${achievement.overallPercentage}%`);
    
    return achievement;
  } catch (error) {
    console.error('Calculate achievement error:', error);
    throw error;
  }
};

// Manual calculation trigger (Admin)
export const triggerCalculation = async (req, res) => {
  try {
    const { id } = req.params;
    
    const achievement = await calculateTargetAchievement(id, req);
    
    res.json({
      success: true,
      message: 'Achievement calculated successfully',
      achievement
    });
  } catch (error) {
    console.error('Trigger calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate achievement',
      error: error.message
    });
  }
};

// Get target statistics (Admin)
export const getTargetStats = async (req, res) => {
  try {
    const { Target } = getModels(req);

    console.log('📊 Fetching target statistics');

    const stats = await Target.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgAchievement: { $avg: '$achievement.overallPercentage' }
        }
      }
    ]);

    const typeStats = await Target.aggregate([
      {
        $group: {
          _id: '$targetType',
          count: { $sum: 1 },
          avgAchievement: { $avg: '$achievement.overallPercentage' }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        byStatus: stats,
        byType: typeStats
      }
    });
  } catch (error) {
    console.error('Get target stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};

// Update target (Admin)
export const updateTarget = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const { Target } = getModels(req);

    console.log('📊 Updating target:', id);

    const target = await Target.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    ).populate('salesExecutive', 'name email');

    if (!target) {
      return res.status(404).json({
        success: false,
        message: 'Target not found'
      });
    }

    console.log(`✅ Target updated: ${target.targetNumber}`);

    // Notify the SE that their target was updated
    notifySE(req, target.salesExecutive, 'target_assigned',
      '📝 Target Updated',
      `Your ${target.targetType} target ${target.targetNumber} has been updated by admin.`,
      { targetId: target._id.toString(), targetNumber: target.targetNumber }
    );

    res.json({
      success: true,
      message: 'Target updated successfully',
      target
    });
  } catch (error) {
    console.error('Update target error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update target',
      error: error.message
    });
  }
};

// Delete target (Admin)
export const deleteTarget = async (req, res) => {
  try {
    const { id } = req.params;
    const { Target } = getModels(req);

    console.log('📊 Deleting target:', id);

    const target = await Target.findByIdAndDelete(id);

    if (!target) {
      return res.status(404).json({
        success: false,
        message: 'Target not found'
      });
    }

    console.log(`✅ Target deleted: ${target.targetNumber}`);

    res.json({
      success: true,
      message: 'Target deleted successfully'
    });
  } catch (error) {
    console.error('Delete target error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete target',
      error: error.message
    });
  }
};
