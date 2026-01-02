import DeliveryAssignment from '../models/DeliveryAssignment.js';
import SalesOrder from '../../models/SalesOrder.js';
import User from '../../models/User.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Configure multer for file uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // __dirname is: D:\Ravi\JainInpexCRMBackend\crm_backend\DeliveryExecutiveAppBackend\controllers
    // We want: D:\Ravi\JainInpexCRMBackend\crm_backend\uploads\pod
    // So we go up 2 levels: ../../uploads/pod
    const uploadDir = path.join(__dirname, '../../uploads/pod');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    console.log('📁 POD Upload directory:', uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `pod-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, jpg, png) and PDF files are allowed'));
    }
  }
});

export const uploadPOD = upload.array('podImages', 5); // Max 5 images

// Verify delivery OTP
export const verifyDeliveryOTP = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: 'OTP is required',
      });
    }

    const assignment = await DeliveryAssignment.findById(assignmentId)
      .populate('salesOrder', 'orderNumber totalAmount')
      .populate('dealer', 'name phone');

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
        message: 'Unauthorized to verify OTP for this assignment',
      });
    }

    if (assignment.deliveryOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    assignment.otpVerified = true;
    await assignment.save();

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        assignment: assignment,
        order: assignment.salesOrder,
        dealer: assignment.dealer
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: error.message,
    });
  }
};

// Complete delivery with POD
export const completeDelivery = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { otpVerified, notes, location } = req.body;

    const assignment = await DeliveryAssignment.findById(assignmentId)
      .populate('salesOrder', 'orderNumber totalAmount')
      .populate('dealer', 'name phone');

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
        message: 'Unauthorized to complete this delivery',
      });
    }

    // Handle POD images
    const podImages = req.files ? req.files.map(file => `/uploads/pod/${file.filename}`) : [];

    assignment.status = 'delivered';
    assignment.deliveryTime = new Date();
    assignment.otpVerified = otpVerified === true || otpVerified === 'true';
    assignment.podImages = podImages;
    if (notes) assignment.notes = notes;
    if (location) {
      assignment.deliveryLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address || '',
      };
    }

    await assignment.save();

    // Update SalesOrder status
    await SalesOrder.findByIdAndUpdate(assignment.salesOrder, {
      status: 'Delivered'
    });

    res.json({
      success: true,
      message: 'Delivery completed successfully',
      data: assignment,
    });
  } catch (error) {
    console.error('Complete delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete delivery',
      error: error.message,
    });
  }
};

// Request reschedule (requires admin approval)
export const rescheduleDelivery = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { newDate, reason } = req.body;

    if (!newDate || !reason) {
      return res.status(400).json({
        success: false,
        message: 'New date and reason are required',
      });
    }

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
        message: 'Unauthorized to reschedule this delivery',
      });
    }

    // Validate that the new date is in the future
    const requestedDate = new Date(newDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (requestedDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reschedule to a past date',
      });
    }

    // Create reschedule request (pending admin approval)
    assignment.rescheduleRequest = {
      requestedDate: requestedDate,
      requestedBy: executiveId,
      requestedAt: new Date(),
      reason: reason,
      status: 'pending'
    };
    
    // Change status to pending_reschedule
    assignment.status = 'pending_reschedule';
    
    console.log('🔄 Reschedule request created:', {
      assignmentId: assignment._id,
      currentDate: assignment.scheduledDate,
      requestedDate: requestedDate,
      reason: reason,
      status: 'pending_reschedule'
    });

    await assignment.save();

    res.json({
      success: true,
      message: 'Reschedule request submitted successfully. Awaiting admin approval.',
      data: assignment,
    });
  } catch (error) {
    console.error('Reschedule delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit reschedule request',
      error: error.message,
    });
  }
};

// Mark delivery as failed
export const failDelivery = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { reason, location } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Failure reason is required',
      });
    }

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
        message: 'Unauthorized to mark this delivery as failed',
      });
    }

    assignment.status = 'failed';
    assignment.failureReason = reason;
    assignment.failedAt = new Date();
    if (location) {
      assignment.deliveryLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address || '',
      };
    }

    await assignment.save();

    // Update SalesOrder status
    await SalesOrder.findByIdAndUpdate(assignment.salesOrder, {
      status: 'Missing'
    });

    res.json({
      success: true,
      message: 'Delivery marked as failed',
      data: assignment,
    });
  } catch (error) {
    console.error('Fail delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark delivery as failed',
      error: error.message,
    });
  }
};

