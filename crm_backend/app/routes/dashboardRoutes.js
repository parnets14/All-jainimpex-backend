import express from 'express';
import {
  getDashboardStats,
  getRecentOrders,
  getRecentInvoices,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../controllers/dashboardController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { generalLimiter } from '../../middleware/rateLimit.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// All routes are protected
router.use(protect);

// Get dashboard overview stats
router.get('/stats', getDashboardStats);

// Get recent orders
router.get('/recent-orders', getRecentOrders);

// Get recent invoices
router.get('/recent-invoices', getRecentInvoices);

// Get notifications
router.get('/notifications', getNotifications);

// Mark notification as read
router.patch('/notifications/:id/read', markNotificationAsRead);

// Mark all notifications as read
router.patch('/notifications/read-all', markAllNotificationsAsRead);

export default router;



