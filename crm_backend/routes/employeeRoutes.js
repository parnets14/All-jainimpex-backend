import express from 'express';
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats
} from '../controllers/employeeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Get employee statistics
router.get('/stats', requirePermission('employees.view'), getEmployeeStats);

// Get all employees with pagination
router.get('/', requirePermission('employees.view'), getEmployees);

// Get single employee
router.get('/:id', requirePermission('employees.view'), getEmployee);

// Create new employee
router.post('/', requirePermission('employees.create'), createEmployee);

// Update employee
router.put('/:id', requirePermission('employees.update'), updateEmployee);

// Delete employee
router.delete('/:id', requirePermission('employees.delete'), deleteEmployee);

export default router;