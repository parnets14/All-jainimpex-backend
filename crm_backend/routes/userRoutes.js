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
  updateUserStatus
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Middleware to check if user is super admin
const requireSuperAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
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

// Routes
router.get('/', getUsers);
router.get('/config/permissions', getPermissionsConfig);
router.get('/:id', getUserById);
router.post('/', createUser);
router.put('/:id', updateUser);
router.put('/:id/permissions', updateUserPermissions);
router.delete('/:id', deleteUser);
router.patch('/:id/status', updateUserStatus);

export default router;