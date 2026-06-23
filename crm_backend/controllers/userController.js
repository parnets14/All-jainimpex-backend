// controllers/userController.js
import { userSchema } from '../models/User.js';
import { AVAILABLE_PERMISSIONS, AVAILABLE_REGIONS, ROLE_PERMISSIONS } from '../config/permissions.js';
import { generatePDF } from '../utils/pdfGenerator.js';

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    User: dbConnection.models.User || dbConnection.model('User', userSchema),
  };
};

// Get all users (Super admin only)
export const getUsers = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { User } = getModels(req.dbConnection);
    
    const { page = 1, limit = 10, search = '', status, role, excludeRole, startDate, endDate } = req.query;
    
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

    // Exclude specific role (used to hide dealer-app users by default)
    if (excludeRole && !role) {
      filter.role = { $ne: excludeRole };
    }

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean(); // Convert to plain objects

    // Ensure all users have consistent ID field
    const usersWithId = users.map(user => ({
      ...user,
      id: user._id.toString() // Add id field for frontend consistency
    }));

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      users: usersWithId,
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
};

// Get single user
export const getUserById = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { User } = getModels(req.dbConnection);
    
    const user = await User.findById(req.params.id).select('-password').lean();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add id field for consistency
    const userWithId = {
      ...user,
      id: user._id.toString()
    };

    res.json({
      success: true,
      user: userWithId
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create new user (Super admin only)
export const createUser = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { User } = getModels(req.dbConnection);
    
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
      allowedDiscountLevels,
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
      allowedDiscountLevels: allowedDiscountLevels || [],
      location: location || 'Default Location',
      createdBy: req.user._id
    });

    // Remove password from response
    const userResponse = await User.findById(user._id).select('-password').lean();

    // Add id field for consistency
    const userWithId = {
      ...userResponse,
      id: userResponse._id.toString()
    };

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userWithId
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { User } = getModels(req.dbConnection);
    
    const {
      name,
      username,
      email,
      phone,
      role,
      status,
      permissions,
      assignedRegions,
      allowedDiscountLevels,
      location,
      password
    } = req.body;

    // VALIDATE FIRST - before any database operations
    // Password validation if provided
    if (password && password.trim()) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
      }
    }

    // Check if user exists
    const user = await User.findById(req.params.id).select('+password');
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

    // Update user fields
    user.name = name;
    user.username = username;
    user.email = email;
    user.phone = phone;
    user.role = role;
    user.status = status;
    user.permissions = permissions;
    user.assignedRegions = assignedRegions;
    user.allowedDiscountLevels = allowedDiscountLevels || [];
    user.location = location;
    
    // Update password only if provided
    if (password && password.trim()) {
      user.password = password; // This will trigger the pre('save') middleware to hash it
      console.log(`Password updated for user: ${email}`);
    }
    
    await user.save();

    // Get the updated user without password
    const updatedUser = await User.findById(req.params.id).select('-password').lean();

    // Add id field for consistency
    const userWithId = {
      ...updatedUser,
      id: updatedUser._id.toString()
    };

    res.json({
      success: true,
      message: 'User updated successfully',
      user: userWithId
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update user permissions
export const updateUserPermissions = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { User } = getModels(req.dbConnection);
    
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
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { User } = getModels(req.dbConnection);
    
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
};

// Get available permissions and regions
export const getPermissionsConfig = (req, res) => {
  res.json({
    success: true,
    permissions: AVAILABLE_PERMISSIONS,
    regions: AVAILABLE_REGIONS,
    rolePermissions: ROLE_PERMISSIONS
  });
};

// Change user status
export const updateUserStatus = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { User } = getModels(req.dbConnection);
    
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
};

// Export users to PDF
export const exportUsersToPDF = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { User } = getModels(req.dbConnection);
    
    console.log('Export users PDF request:', req.query);
    console.log('Current user:', req.user);
    
    const { search = '', status, role, startDate, endDate } = req.query;
    
    // Build filter object (same as getUsers)
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

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    console.log('Filter applied:', filter);

    // Get all users matching the filter
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 });

    console.log('Found users:', users.length);

    // Check if we have any users
    if (users.length === 0) {
      console.log('No users found, creating empty report');
      // Create a report with no data message
      const pdfData = {
        title: 'User Management Report',
        subtitle: 'No Users Found',
        generatedAt: new Date().toLocaleString(),
        filters: {
          search: search || 'All',
          status: status || 'All',
          role: role || 'All',
          dateRange: startDate && endDate ? `${startDate} to ${endDate}` : 'All'
        },
        data: [{
          'Name': 'No users found',
          'Username': 'N/A',
          'Email': 'N/A',
          'Phone': 'N/A',
          'Role': 'N/A',
          'Status': 'N/A',
          'Location': 'N/A',
          'Permissions': 0,
          'Regions': 0,
          'Created': 'N/A',
          'Last Login': 'N/A'
        }]
      };

      console.log('PDF data prepared for empty report:', {
        title: pdfData.title,
        subtitle: pdfData.subtitle,
        dataLength: pdfData.data.length,
        filters: pdfData.filters
      });

      // Generate PDF
      const pdfBuffer = await generatePDF(pdfData);
      console.log('PDF generated for empty report, buffer size:', pdfBuffer.length);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="users-report-empty-${new Date().toISOString().split('T')[0]}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      return res.send(pdfBuffer);
    }

    // Prepare data for PDF
    const pdfData = {
      title: 'User Management Report',
      subtitle: `Complete User List (${users.length} users)`,
      generatedAt: new Date().toLocaleString(),
      filters: {
        search: search || 'All',
        status: status || 'All',
        role: role || 'All',
        dateRange: startDate && endDate ? `${startDate} to ${endDate}` : 'All'
      },
      data: users.map(user => ({
        'Name': user.name || 'N/A',
        'Username': user.username || 'N/A',
        'Email': user.email || 'N/A',
        'Phone': user.phone || 'N/A',
        'Role': user.role ? user.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A',
        'Status': user.status || 'N/A',
        'Location': user.location || 'N/A',
        'Permissions': user.permissions?.length || 0,
        'Regions': user.assignedRegions?.length || 0,
        'Created': user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A',
        'Last Login': user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'
      }))
    };

    console.log('PDF data prepared:', {
      title: pdfData.title,
      subtitle: pdfData.subtitle,
      dataLength: pdfData.data.length,
      filters: pdfData.filters
    });

    // Generate PDF
    try {
      const pdfBuffer = await generatePDF(pdfData);

      console.log('PDF generated, buffer size:', pdfBuffer.length);

      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('PDF generation failed - empty buffer');
      }

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="users-report-${new Date().toISOString().split('T')[0]}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      res.send(pdfBuffer);
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
      throw new Error(`PDF generation failed: ${pdfError.message}`);
    }
  } catch (error) {
    console.error('Export users PDF error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Test PDF generation
export const testPDFGeneration = async (req, res) => {
  try {
    console.log('Testing PDF generation...');
    
    // Create test data
    const testData = {
      title: 'Test PDF Generation',
      subtitle: 'This is a test to verify PDF generation works',
      generatedAt: new Date().toLocaleString(),
      filters: {
        search: 'Test',
        status: 'Test',
        role: 'Test',
        dateRange: 'Test'
      },
      data: [
        {
          'Name': 'Test User',
          'Username': 'testuser',
          'Email': 'test@example.com',
          'Phone': '1234567890',
          'Role': 'Test Role',
          'Status': 'Active',
          'Location': 'Test Location',
          'Permissions': 5,
          'Regions': 2,
          'Created': new Date().toLocaleDateString(),
          'Last Login': new Date().toLocaleString()
        }
      ]
    };

    console.log('Test data prepared:', testData);

    // Generate PDF
    const pdfBuffer = await generatePDF(testData);
    
    console.log('Test PDF generated, buffer size:', pdfBuffer.length);

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'PDF generation failed - empty buffer'
      });
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="test-pdf-${new Date().toISOString().split('T')[0]}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error('Test PDF generation error:', error);
    res.status(500).json({
      success: false,
      message: `Test PDF generation failed: ${error.message}`
    });
  }
};