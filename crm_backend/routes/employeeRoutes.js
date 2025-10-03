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
import { requirePermission } from '../middleware/authMiddleware.js';
import { uploadSingle, handleUploadErrors } from '../middleware/upload.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Get employee statistics
router.get('/stats', requirePermission('employees.view'), getEmployeeStats);

// Get all employees with pagination
router.get('/', requirePermission('employees.view'), getEmployees);

// Get single employee
router.get('/:id', requirePermission('employees.view'), getEmployee);

// Get employee face image
router.get('/:id/face-image', requirePermission('employees.view'), getEmployeeFaceImage);

// Create new employee with face image upload
router.post('/', 
  requirePermission('employees.create'), 
  uploadSingle('faceImage'),
  handleUploadErrors,
  createEmployee
);

// Update employee with optional face image upload
router.put('/:id', 
  requirePermission('employees.update'), 
  uploadSingle('faceImage'),
  handleUploadErrors,
  updateEmployee
);

// Update face embedding for existing employee
router.patch('/:id/face-embedding', requirePermission('employees.update'), updateFaceEmbedding);

// Delete employee
router.delete('/:id', requirePermission('employees.delete'), deleteEmployee);

export default router;