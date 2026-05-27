import express from 'express';
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats,
  updateFaceEmbedding,
  getEmployeeFaceImage,
} from '../controllers/employeeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { requirePermission } from '../middleware/authMiddleware.js';
import { uploadSingle, handleUploadErrors } from '../middleware/upload.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);
router.use(protect);

// Get employee statistics
router.get('/stats', requirePermission('employees.view'), logActivity("Employee Management", "Viewed employee statistics", "READ"), getEmployeeStats);

// Get all employees with pagination
router.get('/', requirePermission('employees.view'), logActivity("Employee Management", "Viewed employees list", "READ"), getEmployees);

// Get single employee
router.get('/:id', requirePermission('employees.view'), logActivity("Employee Management", "Viewed employee details", "READ"), getEmployee);

// Get employee face image
router.get('/:id/face-image', requirePermission('employees.view'), logActivity("Employee Management", "Viewed employee face image", "READ"), getEmployeeFaceImage);

// Create new employee with face image upload
router.post('/', 
  requirePermission('employees.create'), 
  uploadSingle('faceImage'),
  handleUploadErrors,
  logActivity("Employee Management", "Created new employee", "CREATE"),
  createEmployee
);

// Update employee with optional face image upload
router.put('/:id', 
  requirePermission('employees.update'), 
  uploadSingle('faceImage'),
  handleUploadErrors,
  logActivity("Employee Management", "Updated employee", "UPDATE"),
  updateEmployee
);

// Update face embedding for existing employee
router.patch('/:id/face-embedding', requirePermission('employees.update'), logActivity("Employee Management", "Updated employee face embedding", "UPDATE"), updateFaceEmbedding);

// Delete employee
router.delete('/:id', requirePermission('employees.delete'), logActivity("Employee Management", "Deleted employee", "DELETE"), deleteEmployee);

export default router;