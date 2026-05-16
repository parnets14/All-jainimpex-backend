const de = (req) => req.deModels;

// Get all pending reschedule requests
export const getPendingReschedules = async (req, res) => {
  try {
    const { DeliveryAssignment } = de(req);
    const { page = 1, limit = 20 } = req.query;
    
    const assignments = await DeliveryAssignment.find({
      status: 'pending_reschedule',
      'rescheduleRequest.status': 'pending'
    })
      .populate('deliveryExecutive', 'name phone')
      .populate('dealer', 'name phone address')
      .populate('salesOrder', 'orderNumber totalAmount')
      .populate('rescheduleRequest.requestedBy', 'name')
      .sort({ 'rescheduleRequest.requestedAt': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await DeliveryAssignment.countDocuments({
      status: 'pending_reschedule',
      'rescheduleRequest.status': 'pending'
    });

    res.json({
      success: true,
      data: assignments,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get pending reschedules error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending reschedules',
      error: error.message
    });
  }
};

// Approve reschedule request
export const approveReschedule = async (req, res) => {
  try {
    const { DeliveryAssignment } = de(req);
    const { assignmentId } = req.params;
    const { approvedDate, notes } = req.body;

    const assignment = await DeliveryAssignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    if (assignment.status !== 'pending_reschedule') {
      return res.status(400).json({
        success: false,
        message: 'Assignment is not pending reschedule'
      });
    }

    const adminId = req.user.userId || req.user._id;
    const originalScheduledDate = assignment.scheduledDate;
    const finalDate = approvedDate ? new Date(approvedDate) : assignment.rescheduleRequest.requestedDate;

    // Update reschedule request status
    assignment.rescheduleRequest.status = 'approved';
    assignment.rescheduleRequest.approvedBy = adminId;
    assignment.rescheduleRequest.approvedAt = new Date();
    assignment.rescheduleRequest.approvedDate = finalDate;

    // Add to reschedule history
    if (!assignment.rescheduleHistory) {
      assignment.rescheduleHistory = [];
    }
    assignment.rescheduleHistory.push({
      originalDate: originalScheduledDate,
      rescheduledTo: finalDate,
      reason: assignment.rescheduleRequest.reason,
      rescheduledAt: new Date(),
      rescheduledBy: assignment.rescheduleRequest.requestedBy,
      approvedBy: adminId,
      approvedAt: new Date()
    });

    // Update assignment
    assignment.scheduledDate = finalDate;
    assignment.rescheduledDate = finalDate;
    assignment.rescheduleReason = assignment.rescheduleRequest.reason;
    assignment.status = 'assigned';
    
    // Reset delivery-related fields
    assignment.deliveryTime = null;
    assignment.otpVerified = false;
    assignment.deliveryOTP = null;
    assignment.podImages = [];

    if (notes) {
      assignment.notes = (assignment.notes || '') + `\nAdmin note: ${notes}`;
    }

    await assignment.save();

    // Update SalesOrder
    await SalesOrder.findByIdAndUpdate(assignment.salesOrder, {
      status: 'Rescheduled',
      deliveryDate: finalDate
    });

    res.json({
      success: true,
      message: 'Reschedule request approved successfully',
      data: assignment
    });
  } catch (error) {
    console.error('Approve reschedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve reschedule',
      error: error.message
    });
  }
};

// Reject reschedule request
export const rejectReschedule = async (req, res) => {
  try {
    const { DeliveryAssignment } = de(req);
    const { assignmentId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const assignment = await DeliveryAssignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    if (assignment.status !== 'pending_reschedule') {
      return res.status(400).json({
        success: false,
        message: 'Assignment is not pending reschedule'
      });
    }

    const adminId = req.user.userId || req.user._id;

    // Update reschedule request status
    assignment.rescheduleRequest.status = 'rejected';
    assignment.rescheduleRequest.approvedBy = adminId;
    assignment.rescheduleRequest.rejectionReason = reason;
    assignment.rescheduleRequest.rejectedAt = new Date();

    // Revert status to assigned
    assignment.status = 'assigned';

    await assignment.save();

    res.json({
      success: true,
      message: 'Reschedule request rejected',
      data: assignment
    });
  } catch (error) {
    console.error('Reject reschedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject reschedule',
      error: error.message
    });
  }
};

// Get all failed deliveries
export const getFailedDeliveries = async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate } = req.query;
    
    const query = { status: 'failed' };
    
    if (startDate || endDate) {
      query.failedAt = {};
      if (startDate) query.failedAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.failedAt.$lte = end;
      }
    }

    const assignments = await DeliveryAssignment.find(query)
      .populate('deliveryExecutive', 'name phone')
      .populate('dealer', 'name phone address')
      .populate('salesOrder', 'orderNumber totalAmount')
      .sort({ failedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await DeliveryAssignment.countDocuments(query);

    res.json({
      success: true,
      data: assignments,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get failed deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch failed deliveries',
      error: error.message
    });
  }
};

// Reassign delivery
export const reassignDelivery = async (req, res) => {
  try {
    const { DeliveryAssignment, User } = de(req);
    const { assignmentId } = req.params;
    const { newExecutiveId, newDate, reason } = req.body;

    if (!newExecutiveId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'New executive and reason are required'
      });
    }

    const assignment = await DeliveryAssignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    const adminId = req.user.userId || req.user._id;
    const oldExecutiveId = assignment.deliveryExecutive;

    // Add to reassignment history
    if (!assignment.reassignmentHistory) {
      assignment.reassignmentHistory = [];
    }
    assignment.reassignmentHistory.push({
      fromExecutive: oldExecutiveId,
      toExecutive: newExecutiveId,
      reason: reason,
      reassignedBy: adminId,
      reassignedAt: new Date()
    });

    // Update assignment
    assignment.deliveryExecutive = newExecutiveId;
    
    if (newDate) {
      assignment.scheduledDate = new Date(newDate);
    }

    // Reset status and delivery fields
    assignment.status = 'assigned';
    assignment.deliveryTime = null;
    assignment.otpVerified = false;
    assignment.deliveryOTP = null;
    assignment.podImages = [];
    assignment.failureReason = null;
    assignment.failedAt = null;

    await assignment.save();

    res.json({
      success: true,
      message: 'Delivery reassigned successfully',
      data: assignment
    });
  } catch (error) {
    console.error('Reassign delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reassign delivery',
      error: error.message
    });
  }
};

// Edit reschedule date (before approval)
export const editRescheduleDate = async (req, res) => {
  try {
    const { DeliveryAssignment } = de(req);
    const { assignmentId } = req.params;
    const { newDate } = req.body;

    if (!newDate) {
      return res.status(400).json({
        success: false,
        message: 'New date is required'
      });
    }

    const assignment = await DeliveryAssignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    if (assignment.status !== 'pending_reschedule') {
      return res.status(400).json({
        success: false,
        message: 'Assignment is not pending reschedule'
      });
    }

    // Update requested date
    assignment.rescheduleRequest.requestedDate = new Date(newDate);

    await assignment.save();

    res.json({
      success: true,
      message: 'Reschedule date updated successfully',
      data: assignment
    });
  } catch (error) {
    console.error('Edit reschedule date error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to edit reschedule date',
      error: error.message
    });
  }
};
