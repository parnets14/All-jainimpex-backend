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

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET /api/routes - Get all routes with pagination and filters
router.get('/', getRoutes);

// GET /api/routes/:id - Get single route by ID
router.get('/:id', getRouteById);

// POST /api/routes - Create new route (Admin/Manager only)
router.post('/', requireRole(['super_admin', 'admin', 'sales_manager']), createRoute);

// PUT /api/routes/:id - Update route (Admin/Manager only)
router.put('/:id', requireRole(['super_admin', 'admin', 'sales_manager']), updateRoute);

// DELETE /api/routes/:id - Delete route (Admin only)
router.delete('/:id', requireRole(['super_admin', 'admin']), deleteRoute);

// PATCH /api/routes/:id/dealer-count - Update dealer count (internal use)
router.patch('/:id/dealer-count', updateRouteDealerCount);

export default router;
