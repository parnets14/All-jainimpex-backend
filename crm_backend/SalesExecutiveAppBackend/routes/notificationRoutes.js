import express from 'express';
import protect from '../middleware/protect.js';
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
  deleteNotification,
  registerFcmToken,
  sendTestNotification,
} from '../controllers/notificationController.js';

const router = express.Router();

router.get('/',                  protect, getMyNotifications);
router.get('/unread-count',      protect, getUnreadCount);
router.put('/mark-all-read',     protect, markAllRead);
router.post('/register-token',   protect, registerFcmToken);
router.post('/test',             protect, sendTestNotification);   // ← test endpoint
router.put('/:id/read',          protect, markAsRead);
router.delete('/:id',            protect, deleteNotification);

export default router;
