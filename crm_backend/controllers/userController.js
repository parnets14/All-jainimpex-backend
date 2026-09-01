// controllers/userController.js
import { userSchema } from '../models/User.js';
import { discountMappingSchema } from '../models/DiscountMapping.js';
import { AVAILABLE_PERMISSIONS, AVAILABLE_REGIONS, ROLE_PERMISSIONS } from '../config/permissions.js';
import { generatePDF } from '../utils/pdfGenerator.js';

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    User: dbConnection.models.User || dbConnection.model('User', userSchema),
    DiscountMapping: dbConnection.models.DiscountMapping
      || dbConnection.model('DiscountMapping', discountMappingSchema),
  };
};

const isSuperAdminActor = (req) => req.user?.role === 'super_admin';

const rejectUnauthorizedSuperAdminMutation = (req, res, { targetRole, requestedRole } = {}) => {
  const touchesSuperAdmin = targetRole === 'super_admin' || requestedRole === 'super_admin';

  if (touchesSuperAdmin && !isSuperAdminActor(req)) {
    res.status(403).json({
      success: false,
      message: 'Only a Super Admin can create or manage Super Admin accounts.'
    });
    return true;
  }

  return false;
};

const getSuperAdminSafeMutationFilter = (req, userId) => (
  isSuperAdminActor(req)
    ? { _id: userId }
    : { _id: userId, role: { $ne: 'super_admin' } }
);

const handleProtectedMutationConflict = async (req, res, User, userId) => {
  const currentTarget = await User.findById(userId).select('role');

  if (!currentTarget) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (rejectUnauthorizedSuperAdminMutation(req, res, { targetRole: currentTarget.role })) {
    return;
  }

  return res.status(409).json({
    success: false,
    message: 'The user changed while this request was being processed. Please try again.'
  });
};

// Validate a username: required, no "@" (so it can never be an email), and only
// letters/numbers/dot/underscore/hyphen. Returns an error string or null if OK.
const validateUsername = (username) => {
  if (!username || !username.trim()) return 'Username is required';
  const u = username.trim();
  if (u.includes('@')) return 'Username cannot be an email address (no "@" allowed). Use a plain username like "nilesh".';
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) return 'Username can only contain letters, numbers, dot, underscore and hyphen';
  if (u.length < 3) return 'Username must be at least 3 characters long';
  return null;
};

// Validate email format if provided (email is optional). Returns error or null.
const validateEmailFormat = (email) => {
  if (!email || !email.trim()) return null; // optional
  const e = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Please enter a valid email address';
  return null;
};

const normalizeAllowedDiscountLevels = (value) => {
  if (value === undefined) return { value: undefined };
  if (!Array.isArray(value)) {
    return { error: 'Allowed Discount Levels must be an array.' };
  }
  if (value.some((levelName) => typeof levelName !== 'string')) {
    return { error: 'Every Allowed Discount Level must be a text value.' };
  }

  return {
    value: [...new Set(value.map((levelName) => levelName.trim()).filter(Boolean))]
  };
};

// Get all users (Super admin only)
export const getUsers = async (req, res) => {
  try {
    const { User } = getModels(req.dbConnection);
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      role,
      excludeRole,
      startDate,
      endDate,
      includeStats = 'false'
    } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }
    if (status && status !== 'All') filter.status = status;
    if (role && role !== 'All') filter.role = role;
    if (excludeRole && !role) filter.role = { $ne: excludeRole };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const pageNum = Math.max(Number.parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 1000);
    const [users, total, summaryRows] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip((pageNum - 1) * limitNum)
        .lean(),
      User.countDocuments(filter),
      includeStats === 'true'
        ? User.aggregate([
          { $match: filter },
          {
            $group: {
              _id: { role: '$role', status: '$status' },
              count: { $sum: 1 }
            }
          }
        ])
        : Promise.resolve([])
    ]);

    const usersWithId = users.map((user) => ({
      ...user,
      id: user._id.toString()
    }));
    const stats = includeStats === 'true'
      ? summaryRows.reduce((summary, row) => {
        const count = Number(row.count || 0);
        const roleName = row._id?.role || 'unknown';
        summary.total += count;
        if (row._id?.status === 'Active') summary.active += count;
        if (row._id?.status === 'Inactive') summary.inactive += count;
        summary.roles[roleName] = (summary.roles[roleName] || 0) + count;
        return summary;
      }, { total: 0, active: 0, inactive: 0, roles: {} })
      : undefined;

    res.json({
      success: true,
      users: usersWithId,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total,
      ...(stats ? { stats } : {})
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

    if (rejectUnauthorizedSuperAdminMutation(req, res, { requestedRole: role })) {
      return;
    }

    // Validate username + email format (clear messages returned to the screen)
    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({ success: false, message: usernameError });
    }
    const emailError = validateEmailFormat(email);
    if (emailError) {
      return res.status(400).json({ success: false, message: emailError });
    }
    const normalizedDiscountLevels = normalizeAllowedDiscountLevels(allowedDiscountLevels);
    if (normalizedDiscountLevels.error) {
      return res.status(400).json({ success: false, message: normalizedDiscountLevels.error });
    }

    // Check if user already exists (case-insensitive, skip empty values)
    const esc = (v) => v.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const dupConds = [];
    if (email && email.trim()) dupConds.push({ email: new RegExp(`^${esc(email)}$`, 'i') });
    if (username && username.trim()) dupConds.push({ username: new RegExp(`^${esc(username)}$`, 'i') });

    const existingUser = dupConds.length ? await User.findOne({ $or: dupConds }) : null;

    if (existingUser) {
      const sameEmail = email && existingUser.email && existingUser.email.toLowerCase() === email.trim().toLowerCase();
      return res.status(400).json({
        success: false,
        message: sameEmail
          ? 'A user already exists with this email. Each user must have a unique email.'
          : 'User already exists with this email or username'
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
      allowedDiscountLevels: normalizedDiscountLevels.value || [],
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

    if (rejectUnauthorizedSuperAdminMutation(req, res, {
      targetRole: user.role,
      requestedRole: role
    })) {
      return;
    }

    // Validate username + email format (clear messages returned to the screen)
    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({ success: false, message: usernameError });
    }
    const emailFmtError = validateEmailFormat(email);
    if (emailFmtError) {
      return res.status(400).json({ success: false, message: emailFmtError });
    }
    const normalizedDiscountLevels = normalizeAllowedDiscountLevels(allowedDiscountLevels);
    if (normalizedDiscountLevels.error) {
      return res.status(400).json({ success: false, message: normalizedDiscountLevels.error });
    }

    // Check for duplicate email or username (case-insensitive, excluding current user)
    const esc = (v) => v.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const dupConds = [];
    if (email && email.trim()) dupConds.push({ email: new RegExp(`^${esc(email)}$`, 'i') });
    if (username && username.trim()) dupConds.push({ username: new RegExp(`^${esc(username)}$`, 'i') });

    const existingUser = dupConds.length
      ? await User.findOne({ $and: [{ _id: { $ne: req.params.id } }, { $or: dupConds }] })
      : null;

    if (existingUser) {
      const sameEmail = email && existingUser.email && existingUser.email.toLowerCase() === email.trim().toLowerCase();
      return res.status(400).json({
        success: false,
        message: sameEmail
          ? 'Another user already exists with this email. Each user must have a unique email.'
          : 'Another user already exists with this email or username'
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
    if (normalizedDiscountLevels.value !== undefined) {
      user.allowedDiscountLevels = normalizedDiscountLevels.value;
    }
    user.location = location;
    
    // Update password only if provided
    if (password && password.trim()) {
      user.password = password; // This will trigger the pre('save') middleware to hash it
      console.log(`Password updated for user: ${email}`);
    }
    
    // Make the persisted role part of the save condition so a concurrent
    // promotion cannot expose a Super Admin to this non-Super Admin update.
    if (!isSuperAdminActor(req)) {
      user.$where = { role: { $ne: 'super_admin' } };
    }

    try {
      await user.save();
    } catch (error) {
      if (!isSuperAdminActor(req) && error.name === 'DocumentNotFoundError') {
        return handleProtectedMutationConflict(req, res, User, req.params.id);
      }
      throw error;
    }

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
    const targetUser = await User.findById(req.params.id).select('role');

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (rejectUnauthorizedSuperAdminMutation(req, res, { targetRole: targetUser.role })) {
      return;
    }

    const updatedUser = await User.findOneAndUpdate(
      getSuperAdminSafeMutationFilter(req, req.params.id),
      {
        permissions,
        assignedRegions
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return handleProtectedMutationConflict(req, res, User, req.params.id);
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

    if (rejectUnauthorizedSuperAdminMutation(req, res, { targetRole: user.role })) {
      return;
    }

    // Prevent users from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    const deletion = await User.deleteOne(
      getSuperAdminSafeMutationFilter(req, req.params.id)
    );

    if (deletion.deletedCount !== 1) {
      return handleProtectedMutationConflict(req, res, User, req.params.id);
    }

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

// Get available permissions, regions, and configured discount-level names.
export const getPermissionsConfig = async (req, res) => {
  try {
    const { DiscountMapping } = getModels(req.dbConnection);
    const configuredLevelNames = await DiscountMapping.distinct(
      'levels.levelName',
      { mappingType: 'sales' }
    );
    const discountLevelNames = [...new Set(
      configuredLevelNames
        .filter((levelName) => typeof levelName === 'string')
        .map((levelName) => levelName.trim())
        .filter(Boolean)
    )].sort((left, right) => left.localeCompare(right));

    res.json({
      success: true,
      permissions: AVAILABLE_PERMISSIONS,
      regions: AVAILABLE_REGIONS,
      rolePermissions: ROLE_PERMISSIONS,
      discountLevelNames
    });
  } catch (error) {
    console.error('Get permissions config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load permissions configuration'
    });
  }
};

// Change user status
export const updateUserStatus = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { User } = getModels(req.dbConnection);
    
    const { status } = req.body;
    const targetUser = await User.findById(req.params.id).select('role');

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (rejectUnauthorizedSuperAdminMutation(req, res, { targetRole: targetUser.role })) {
      return;
    }

    const updatedUser = await User.findOneAndUpdate(
      getSuperAdminSafeMutationFilter(req, req.params.id),
      { status },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return handleProtectedMutationConflict(req, res, User, req.params.id);
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