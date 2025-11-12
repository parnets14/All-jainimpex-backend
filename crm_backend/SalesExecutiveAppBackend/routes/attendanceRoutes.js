import express from 'express';
import {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceHistory,
  getAllAttendance,
} from '../controllers/attendanceController.js';
import { protect } from '../middleware/protect.js';
import { protectAdmin } from '../middleware/protectAdmin.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Admin route - Get all attendance records (Admin/Web view)
router.get('/all', (req, res, next) => {
  console.log('📍 /all route hit!', {
    method: req.method,
    url: req.url,
    hasAuth: !!req.headers.authorization
  });
  next();
}, protectAdmin, getAllAttendance);

// Sales Executive routes - require SE authentication
router.use(protect);

// Check-in with selfie upload
router.post('/check-in', upload.single('selfie'), checkIn);

// Check-out with optional selfie
router.post('/check-out', upload.single('selfie'), checkOut);

// Get today's attendance
router.get('/today', getTodayAttendance);

// Get attendance history
router.get('/history', getAttendanceHistory);

export default router;
