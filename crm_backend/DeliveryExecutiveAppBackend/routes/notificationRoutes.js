import express from 'express';
const router = express.Router();
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification
} from '../controllers/notificationController.js';
import { protect } from '../middleware/protect.js';

// All routes require authentication
router.get('/', protect, getNotifications);
router.get('/unread-count', protect, getUnreadCount);
router.put('/:notificationId/read', protect, markAsRead);
router.put('/mark-all-read', protect, markAllAsRead);
router.delete('/:notificationId', protect, deleteNotification);

// Admin route for creating notifications
router.post('/create', createNotification);

export default router;
