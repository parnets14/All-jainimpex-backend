import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getDeModels } from '../utils/deDbHelper.js';
import { sendPushNotification } from '../../services/firebaseNotificationService.js';
import { notifyDeliveryCompleted, notifyDeliveryFailed, notifyDeliveryRescheduled } from '../../services/adminNotificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Multer config for POD images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/pod');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `pod-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only jpeg, jpg, png, pdf files allowed'));
    }
  },
});

export const uploadPOD = upload.array('podImages', 5);

// Helper: get models from request
const de = (req) => req.deModels;

// ─────────────────────────────────────────────────────────────
// REQUEST DELIVERY OTP (Executive calls this when arriving at dealer)
// Generates fresh OTP → sends FCM push to dealer
// ─────────────────────────────────────────────────────────────
export const requestDeliveryOTP = async (req, res) => {
  try {
    const { DeliveryAssignment, Dealer } = de(req);
    const { assignmentId } = req.params;

    const assignment = await DeliveryAssignment.findById(assignmentId)
      .populate('salesOrder', 'orderNumber totalAmount')
      .populate('dealer', 'name phone fcmToken');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Verify executive owns this
    const executiveId = req.user.userId || req.user._id;
    if (assignment.deliveryExecutive.toString() !== executiveId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Check resend limit (max 3)
    const resendCount = assignment.otpResendCount || 0;
    if (resendCount >= 3) {
      return res.status(429).json({ success: false, message: 'Maximum OTP resend limit reached (3). Contact admin.' });
    }

    // Generate fresh 4-digit OTP
    const otp = String(Math.floor(1000 + Math.random() * 9000));

    // Save to assignment
    assignment.deliveryOTP = otp;
    assignment.otpGeneratedAt = new Date();
    assignment.otpResendCount = resendCount + 1;
    assignment.otpVerified = false;
    assignment.otpAttempts = 0;
    await assignment.save();

    // Send FCM push to dealer
    const dealer = assignment.dealer;
    if (dealer?.fcmToken) {
      await sendPushNotification({
        token: dealer.fcmToken,
        title: `🔑 OTP: ${otp}`,
        body: `Order #${assignment.salesOrder?.orderNumber || ''} — Share this OTP with delivery person`,
        data: {
          type: 'delivery_otp',
          otp: otp,
          orderNumber: assignment.salesOrder?.orderNumber || '',
          assignmentId: assignmentId,
        },
        channelId: 'dealer_notifications',
      });
      console.log(`📱 OTP ${otp} sent to dealer ${dealer.name} via FCM`);
    } else {
      console.log(`⚠️ Dealer ${dealer?.name} has no FCM token — OTP generated but not pushed`);
    }

    // Save notification to dealer's Notification collection (so it shows in-app)
    try {
      const { Notification } = de(req);
      await Notification.create({
        dealer: dealer._id,
        type: 'delivery_otp',
        title: `🔑 Delivery OTP: ${otp}`,
        message: `Your OTP for Order #${assignment.salesOrder?.orderNumber || ''} is ${otp}. Share this code with the delivery person to confirm receipt.`,
        orderNumber: assignment.salesOrder?.orderNumber || null,
        priority: 'high',
        metadata: { otp, assignmentId },
      });
      console.log(`💾 OTP notification saved to dealer DB`);
    } catch (dbErr) {
      console.error('⚠️ Failed to save OTP notification to DB (non-blocking):', dbErr.message);
    }

    res.json({
      success: true,
      message: 'OTP sent to dealer',
      data: {
        otpSent: true,
        resendCount: resendCount + 1,
        maxResends: 3,
        expiresInMinutes: 10,
        dealerName: dealer?.name,
        dealerHasFcm: !!dealer?.fcmToken,
      },
    });
  } catch (error) {
    console.error('Request OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// VERIFY DELIVERY OTP
// ─────────────────────────────────────────────────────────────
export const verifyDeliveryOTP = async (req, res) => {
  try {
    const { DeliveryAssignment } = de(req);
    const { assignmentId } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP is required' });
    }

    const assignment = await DeliveryAssignment.findById(assignmentId)
      .populate('salesOrder', 'orderNumber totalAmount')
      .populate('dealer', 'name phone');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Verify executive owns this
    const executiveId = req.user.userId || req.user._id;
    if (assignment.deliveryExecutive.toString() !== executiveId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Check OTP expiry (10 minutes)
    const otpAge = Date.now() - new Date(assignment.otpGeneratedAt).getTime();
    if (otpAge > 10 * 60 * 1000) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    // Check attempts (max 5)
    if ((assignment.otpAttempts || 0) >= 5) {
      return res.status(429).json({ success: false, message: 'Too many attempts. Request a new OTP.' });
    }

    // Verify OTP
    if (assignment.deliveryOTP !== otp) {
      assignment.otpAttempts = (assignment.otpAttempts || 0) + 1;
      await assignment.save();
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${5 - assignment.otpAttempts} attempts remaining.`,
      });
    }

    // OTP verified
    assignment.otpVerified = true;
    await assignment.save();

    res.json({
      success: true,
      message: 'OTP verified successfully. You can now complete the delivery.',
      data: { otpVerified: true },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify OTP', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// COMPLETE DELIVERY (OTP must be verified + mandatory images)
// Does NOT update SalesOrder — admin confirms later
// ─────────────────────────────────────────────────────────────
export const completeDelivery = async (req, res) => {
  try {
    const { DeliveryAssignment } = de(req);
    const { assignmentId } = req.params;
    const { notes, location } = req.body;

    const assignment = await DeliveryAssignment.findById(assignmentId)
      .populate('salesOrder', 'orderNumber')
      .populate('dealer', 'name');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Verify executive owns this
    const executiveId = req.user.userId || req.user._id;
    if (assignment.deliveryExecutive.toString() !== executiveId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // OTP must be verified first
    if (!assignment.otpVerified) {
      return res.status(400).json({ success: false, message: 'OTP not verified. Please verify OTP first.' });
    }

    // Images are mandatory (at least 1)
    const podImages = req.files ? req.files.map((file) => `/uploads/pod/${file.filename}`) : [];
    if (podImages.length === 0) {
      return res.status(400).json({ success: false, message: 'At least 1 proof of delivery image is required.' });
    }

    // Update assignment — status = "delivered" (pending admin confirmation)
    // SalesOrder is NOT touched here
    assignment.status = 'delivered';
    assignment.deliveryTime = new Date();
    assignment.podImages = podImages;
    if (notes) assignment.notes = notes;
    if (location) {
      assignment.deliveryLocation = {
        latitude: parseFloat(location.latitude),
        longitude: parseFloat(location.longitude),
        address: location.address || '',
      };
    }

    await assignment.save();

    // Notify admin via Firebase RTDB
    const company = req.company || req.deModels?.company || 'jain-impex';
    notifyDeliveryCompleted(company, {
      executiveName: req.user.name || 'Executive',
      orderNumber: assignment.salesOrder?.orderNumber || '',
      dealerName: assignment.dealer?.name || '',
    });

    console.log(`✅ Delivery completed by executive for order #${assignment.salesOrder?.orderNumber} — awaiting admin confirmation`);

    res.json({
      success: true,
      message: 'Delivery marked as completed. Awaiting admin confirmation.',
      data: assignment,
    });
  } catch (error) {
    console.error('Complete delivery error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete delivery', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// RESCHEDULE DELIVERY (Executive requests, admin reviews)
// Does NOT update SalesOrder
// ─────────────────────────────────────────────────────────────
export const rescheduleDelivery = async (req, res) => {
  try {
    const { DeliveryAssignment } = de(req);
    const { assignmentId } = req.params;
    const { newDate, reason, note } = req.body;

    if (!newDate || !reason) {
      return res.status(400).json({ success: false, message: 'New date and reason are required' });
    }

    const assignment = await DeliveryAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Verify executive owns this
    const executiveId = req.user.userId || req.user._id;
    if (assignment.deliveryExecutive.toString() !== executiveId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Max 2 reschedules
    const rescheduleCount = assignment.rescheduleHistory?.length || 0;
    if (rescheduleCount >= 2) {
      return res.status(400).json({ success: false, message: 'Maximum reschedule limit (2) reached. Contact admin.' });
    }

    // Validate future date
    const requestedDate = new Date(newDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (requestedDate < today) {
      return res.status(400).json({ success: false, message: 'Cannot reschedule to a past date' });
    }

    // Add to reschedule history
    if (!assignment.rescheduleHistory) assignment.rescheduleHistory = [];
    assignment.rescheduleHistory.push({
      rescheduledBy: executiveId,
      rescheduledAt: new Date(),
      originalDate: assignment.scheduledDate,
      newDate: requestedDate,
      reason,
      note: note || '',
    });

    assignment.status = 'rescheduled';
    assignment.scheduledDate = requestedDate;
    // SalesOrder NOT touched

    await assignment.save();

    // Notify admin
    const company = req.company || req.deModels?.company || 'jain-impex';
    notifyDeliveryRescheduled(company, {
      executiveName: req.user.name || 'Executive',
      orderNumber: assignment.salesOrder?.orderNumber || '',
      dealerName: assignment.dealer?.name || '',
      newDate: requestedDate.toLocaleDateString('en-IN'),
      reason,
    });

    console.log(`🔄 Delivery rescheduled to ${requestedDate.toDateString()} — reason: ${reason}`);

    res.json({
      success: true,
      message: `Delivery rescheduled to ${requestedDate.toLocaleDateString('en-IN')}. Admin will review.`,
      data: assignment,
    });
  } catch (error) {
    console.error('Reschedule error:', error);
    res.status(500).json({ success: false, message: 'Failed to reschedule', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// FAIL DELIVERY (Mandatory reason + photo)
// Does NOT update SalesOrder — admin decides next step
// ─────────────────────────────────────────────────────────────
export const failDelivery = async (req, res) => {
  try {
    const { DeliveryAssignment } = de(req);
    const { assignmentId } = req.params;
    const { reason, note, location } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Failure reason is required' });
    }

    const assignment = await DeliveryAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Verify executive owns this
    const executiveId = req.user.userId || req.user._id;
    if (assignment.deliveryExecutive.toString() !== executiveId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Images mandatory for failed delivery
    const failureImages = req.files ? req.files.map((file) => `/uploads/pod/${file.filename}`) : [];
    if (failureImages.length === 0) {
      return res.status(400).json({ success: false, message: 'At least 1 photo is required for failed delivery (proof).' });
    }

    assignment.status = 'failed';
    assignment.failureDetails = {
      reason,
      note: note || '',
      images: failureImages,
      failedAt: new Date(),
      failedBy: executiveId,
      location: location ? { latitude: parseFloat(location.latitude), longitude: parseFloat(location.longitude) } : null,
    };
    // SalesOrder NOT touched — admin decides

    await assignment.save();

    // Notify admin
    const company = req.company || req.deModels?.company || 'jain-impex';
    notifyDeliveryFailed(company, {
      executiveName: req.user.name || 'Executive',
      orderNumber: assignment.salesOrder?.orderNumber || '',
      dealerName: assignment.dealer?.name || '',
      reason,
    });

    console.log(`❌ Delivery failed — reason: ${reason}`);

    res.json({
      success: true,
      message: 'Delivery marked as failed. Admin will review and decide next steps.',
      data: assignment,
    });
  } catch (error) {
    console.error('Fail delivery error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark delivery as failed', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// ADMIN: CONFIRM DELIVERY (Updates SalesOrder to "Delivered")
// ─────────────────────────────────────────────────────────────
export const adminConfirmDelivery = async (req, res) => {
  try {
    const { DeliveryAssignment, SalesOrder } = de(req);
    const { assignmentId } = req.params;

    const assignment = await DeliveryAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Assignment is not in delivered status' });
    }

    // Update assignment
    assignment.adminConfirmed = true;
    assignment.adminConfirmedAt = new Date();
    assignment.adminConfirmedBy = req.user.userId || req.user._id;
    await assignment.save();

    // NOW update SalesOrder status
    await SalesOrder.findByIdAndUpdate(assignment.salesOrder, { status: 'Delivered' });

    console.log(`✅ Admin confirmed delivery for assignment ${assignmentId}`);

    res.json({
      success: true,
      message: 'Delivery confirmed. Sales order marked as Delivered.',
    });
  } catch (error) {
    console.error('Admin confirm error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm delivery', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// ADMIN: REJECT DELIVERY (Sends back to executive)
// ─────────────────────────────────────────────────────────────
export const adminRejectDelivery = async (req, res) => {
  try {
    const { DeliveryAssignment } = de(req);
    const { assignmentId } = req.params;
    const { reason } = req.body;

    const assignment = await DeliveryAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Revert to assigned so executive must redo
    assignment.status = 'assigned';
    assignment.adminRejection = {
      reason: reason || 'Delivery not confirmed by admin',
      rejectedAt: new Date(),
      rejectedBy: req.user.userId || req.user._id,
    };
    assignment.otpVerified = false;
    assignment.podImages = [];
    await assignment.save();

    res.json({
      success: true,
      message: 'Delivery rejected. Assignment sent back to executive.',
    });
  } catch (error) {
    console.error('Admin reject error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject delivery', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// ADMIN: HANDLE FAILED — Reassign or Cancel
// ─────────────────────────────────────────────────────────────
export const adminHandleFailed = async (req, res) => {
  try {
    const { DeliveryAssignment, SalesOrder } = de(req);
    const { assignmentId } = req.params;
    const { action } = req.body; // "reassign" or "cancel"

    const assignment = await DeliveryAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.status !== 'failed') {
      return res.status(400).json({ success: false, message: 'Assignment is not in failed status' });
    }

    if (action === 'cancel') {
      assignment.status = 'cancelled';
      await assignment.save();
      // Revert SalesOrder to Confirmed so it can be reassigned or cancelled from sales dashboard
      await SalesOrder.findByIdAndUpdate(assignment.salesOrder, { status: 'Confirmed' });
      return res.json({ success: true, message: 'Assignment cancelled. Order reverted to Confirmed.' });
    }

    // Default: mark as ready for reassignment (revert to Confirmed in SalesOrder)
    assignment.status = 'cancelled';
    await assignment.save();
    await SalesOrder.findByIdAndUpdate(assignment.salesOrder, { status: 'Confirmed' });

    res.json({
      success: true,
      message: 'Failed assignment cancelled. Order is back in the assignment pool.',
    });
  } catch (error) {
    console.error('Admin handle failed error:', error);
    res.status(500).json({ success: false, message: 'Failed to handle', error: error.message });
  }
};
