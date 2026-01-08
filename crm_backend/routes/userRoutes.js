// routes/userRoutes.js
import express from 'express';
import { 
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserPermissions,
  getPermissionsConfig,
  updateUserStatus,
  exportUsersToPDF
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// Middleware to check if user is super admin or sub admin
const requireSuperAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'sub_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super admin privileges required.'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Apply protect middleware to all routes
router.use(protect);
// Apply super admin middleware to all routes
router.use(requireSuperAdmin);

// Routes with activity logging
router.get('/', logActivity("User Management", "Viewed users list", "READ"), getUsers);
router.get('/export/pdf', logActivity("User Management", "Exported users to PDF", "EXPORT"), exportUsersToPDF);
router.get('/config/permissions', logActivity("User Management", "Viewed permissions config", "READ"), getPermissionsConfig);
router.get('/:id', logActivity("User Management", "Viewed user details", "READ"), getUserById);
router.post('/', logActivity("User Management", "Created new user", "CREATE"), createUser);
router.put('/:id', logActivity("User Management", "Updated user", "UPDATE"), updateUser);
router.put('/:id/permissions', logActivity("User Management", "Updated user permissions", "UPDATE"), updateUserPermissions);
router.delete('/:id', logActivity("User Management", "Deleted user", "DELETE"), deleteUser);
router.patch('/:id/status', logActivity("User Management", "Updated user status", "UPDATE"), updateUserStatus);

export default router;