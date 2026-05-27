import express from 'express';
import {
  getRoutes,
  getRouteById,
  createRoute,
  updateRoute,
  deleteRoute,
  updateRouteDealerCount
} from '../controllers/routeController.js';
import { protect, requireRole } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(attachCompanyDB);

// GET /api/routes - Get all routes with pagination and filters
router.get('/', logActivity("Route Management", "Viewed routes list", "READ"), getRoutes);

// GET /api/routes/:id - Get single route by ID
router.get('/:id', logActivity("Route Management", "Viewed route details", "READ"), getRouteById);

// POST /api/routes - Create new route (Admin/Manager only)
router.post('/', requireRole(['super_admin', 'admin', 'sales_manager']), logActivity("Route Management", "Created new route", "CREATE"), createRoute);

// PUT /api/routes/:id - Update route (Admin/Manager only)
router.put('/:id', requireRole(['super_admin', 'admin', 'sales_manager']), logActivity("Route Management", "Updated route", "UPDATE"), updateRoute);

// DELETE /api/routes/:id - Delete route (Admin only)
router.delete('/:id', requireRole(['super_admin', 'admin']), logActivity("Route Management", "Deleted route", "DELETE"), deleteRoute);

// PATCH /api/routes/:id/dealer-count - Update dealer count (internal use)
router.patch('/:id/dealer-count', logActivity("Route Management", "Updated route dealer count", "UPDATE"), updateRouteDealerCount);

export default router;
