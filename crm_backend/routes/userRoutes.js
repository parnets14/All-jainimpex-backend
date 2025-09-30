import express from 'express';
import User from '../models/User.js';
import { protect } from '../middleware/authMiddleware.js';
import { 
  AVAILABLE_PERMISSIONS, 
  AVAILABLE_REGIONS, 
  ROLE_PERMISSIONS 
} from '../config/permissions.js';

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

// Get all users (Super admin only)
router.get('/', protect, requireSuperAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status, role } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status && status !== 'All') {
      filter.status = status;
    }
    
    if (role && role !== 'All') {
      filter.role = role;
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get single user
router.get('/:id', protect, requireSuperAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Create new user (Super admin only)
router.post('/', protect, requireSuperAdmin, async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      password,
      phone,
      role,
      status,
      permissions,
      assignedRegions,
      location
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or username'
      });
    }

    // Set default permissions based on role if not provided
    const userPermissions = permissions || ROLE_PERMISSIONS[role] || [];

    // Create user
    const user = await User.create({
      name,
      username,
      email,
      password,
      phone,
      role,
      status: status || 'Active',
      permissions: userPermissions,
      assignedRegions: assignedRegions || [],
      location: location || 'Default Location',
      createdBy: req.user._id
    });

    // Remove password from response
    const userResponse = await User.findById(user._id).select('-password');

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update user
router.put('/:id', protect, requireSuperAdmin, async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      phone,
      role,
      status,
      permissions,
      assignedRegions,
      location
    } = req.body;

    // Check if user exists
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check for duplicate email or username (excluding current user)
    const existingUser = await User.findOne({
      $and: [
        { _id: { $ne: req.params.id } },
        { $or: [{ email }, { username }] }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Another user already exists with this email or username'
      });
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        name,
        username,
        email,
        phone,
        role,
        status,
        permissions,
        assignedRegions,
        location
      },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update user permissions
router.put('/:id/permissions', protect, requireSuperAdmin, async (req, res) => {
  try {
    const { permissions, assignedRegions } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        permissions,
        assignedRegions
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Permissions updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete user
router.delete('/:id', protect, requireSuperAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent super admin from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get available permissions and regions
router.get('/config/permissions', protect, requireSuperAdmin, (req, res) => {
  res.json({
    success: true,
    permissions: AVAILABLE_PERMISSIONS,
    regions: AVAILABLE_REGIONS,
    rolePermissions: ROLE_PERMISSIONS
  });
});

// Change user status
router.patch('/:id/status', protect, requireSuperAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: `User ${status.toLowerCase()} successfully`,
      user: updatedUser
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;