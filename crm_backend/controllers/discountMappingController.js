import DiscountMapping from '../models/DiscountMapping.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';
import Brand from '../models/Brand.js';

// @desc    Get all discount mappings
// @route   GET /api/discount-mappings
// @access  Private
export const getDiscountMappings = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      mappingType,
      targetType,
      discountType
    } = req.query;

    // Build query object
    const query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { discountName: { $regex: search, $options: 'i' } },
        { remarks: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }

    // Filter by mapping type
    if (mappingType && mappingType !== 'all') {
      query.mappingType = mappingType;
    }

    // Filter by target type
    if (targetType && targetType !== 'all') {
      query.targetType = targetType;
    }

    // Filter by discount type
    if (discountType && discountType !== 'all') {
      query.discountType = discountType;
    }

    // Execute query with pagination
    const discountMappings = await DiscountMapping.find(query)
      .populate('product', 'itemName productCode')
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Get total count for pagination
    const total = await DiscountMapping.countDocuments(query);

    res.json({
      success: true,
      discountMappings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get discount mappings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching discount mappings'
    });
  }
};

// @desc    Get single discount mapping
// @route   GET /api/discount-mappings/:id
// @access  Private
export const getDiscountMapping = async (req, res) => {
  try {
    const discountMapping = await DiscountMapping.findById(req.params.id)
      .populate('product', 'itemName productCode HSNCode')
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    if (!discountMapping) {
      return res.status(404).json({
        success: false,
        message: 'Discount mapping not found'
      });
    }

    res.json({
      success: true,
      discountMapping
    });
  } catch (error) {
    console.error('Get discount mapping error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching discount mapping'
    });
  }
};

// @desc    Create new discount mapping
// @route   POST /api/discount-mappings
// @access  Private
export const createDiscountMapping = async (req, res) => {
  try {
    const {
      discountName,
      discountType,
      mappingType,
      targetType,
      product,
      brand,
      category,
      subcategory,
      directDiscountPercentage,
      levels,
      validFrom,
      validTo,
      includeExtendedSubcategories,
      applicableDealerTypes,
      minOrderAmount,
      minOrderQuantity,
      maxUsageCount,
      priority,
      remarks,
      internalNotes
    } = req.body;

    // Validate required fields
    if (!discountName || !discountType || !mappingType || !targetType) {
      return res.status(400).json({
        success: false,
        message: 'Discount name, type, mapping type, and target type are required'
      });
    }

    // Validate target reference based on target type
    const targetValidation = {
      product: product,
      brand: brand,
      category: category,
      subcategory: subcategory
    };

    if (!targetValidation[targetType]) {
      return res.status(400).json({
        success: false,
        message: `${targetType} ID is required for ${targetType}-based discount`
      });
    }

    // Validate discount configuration
    if (discountType === 'direct' && (directDiscountPercentage === undefined || directDiscountPercentage === null || directDiscountPercentage < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Direct discount percentage is required and must be 0 or greater'
      });
    }

    if (discountType === 'level_based' && (!levels || !Array.isArray(levels) || levels.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'At least one level is required for level-based discounts'
      });
    }

    if (discountType === 'both') {
      if (directDiscountPercentage === undefined || directDiscountPercentage === null || directDiscountPercentage < 0) {
        return res.status(400).json({
          success: false,
          message: 'Direct discount percentage is required for "both" type and must be 0 or greater'
        });
      }
      if (!levels || !Array.isArray(levels) || levels.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one level is required for "both" type discounts'
        });
      }
    }

    // Validate target exists
    let targetModel, targetDoc;
    switch (targetType) {
      case 'product':
        targetModel = Product;
        targetDoc = await Product.findById(product);
        break;
      case 'brand':
        targetModel = Brand;
        targetDoc = await Brand.findById(brand);
        break;
      case 'category':
        targetModel = Category;
        targetDoc = await Category.findById(category);
        break;
      case 'subcategory':
        targetModel = Subcategory;
        targetDoc = await Subcategory.findById(subcategory);
        break;
    }

    if (!targetDoc) {
      return res.status(404).json({
        success: false,
        message: `${targetType} not found`
      });
    }

    // Check for duplicate active discounts on same target
    const existingDiscount = await DiscountMapping.findOne({
      targetType,
      [targetType]: targetValidation[targetType],
      mappingType,
      status: { $in: ['Approved', 'Pending Approval'] },
      isActive: true,
      validFrom: { $lte: new Date(validTo) },
      validTo: { $gte: new Date(validFrom) }
    });

    if (existingDiscount) {
      return res.status(400).json({
        success: false,
        message: `An active discount mapping already exists for this ${targetType} in the specified date range`
      });
    }

    // Create discount mapping
    const discountMappingData = {
      discountName,
      discountType,
      mappingType,
      targetType,
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
      includeExtendedSubcategories: includeExtendedSubcategories !== false,
      applicableDealerTypes: applicableDealerTypes || [],
      minOrderAmount: minOrderAmount || 0,
      minOrderQuantity: minOrderQuantity || 0,
      maxUsageCount,
      priority: priority || 0,
      remarks,
      internalNotes,
      createdBy: req.user.id
    };

    // Set target reference
    discountMappingData[targetType] = targetValidation[targetType];

    // Set discount values based on type
    if (discountType === 'direct') {
      discountMappingData.directDiscountPercentage = directDiscountPercentage;
    } else if (discountType === 'level_based') {
      discountMappingData.levels = levels;
    } else if (discountType === 'both') {
      discountMappingData.directDiscountPercentage = directDiscountPercentage;
      discountMappingData.levels = levels;
    }

    console.log('Creating discount mapping with data:', {
      discountType,
      directDiscountPercentage: discountMappingData.directDiscountPercentage,
      levelsCount: discountMappingData.levels?.length,
      targetType,
      targetId: discountMappingData[targetType]
    });

    const discountMapping = new DiscountMapping(discountMappingData);
    await discountMapping.save();

    // Populate the created discount mapping
    const populatedDiscountMapping = await DiscountMapping.findById(discountMapping._id)
      .populate('product', 'itemName productCode')
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Discount mapping created successfully',
      discountMapping: populatedDiscountMapping
    });
  } catch (error) {
    console.error('Create discount mapping error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating discount mapping'
    });
  }
};

// @desc    Update discount mapping
// @route   PUT /api/discount-mappings/:id
// @access  Private
export const updateDiscountMapping = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Remove fields that shouldn't be updated directly
    delete updateData.createdBy;
    delete updateData.createdAt;
    delete updateData.currentUsageCount;
    delete updateData.approvedBy;
    delete updateData.approvedAt;

    // Find existing discount mapping
    const existingMapping = await DiscountMapping.findById(id);
    if (!existingMapping) {
      return res.status(404).json({
        success: false,
        message: 'Discount mapping not found'
      });
    }

    // If editing an Approved discount, reset to Pending Approval
    if (existingMapping.status === 'Approved') {
      updateData.status = 'Pending Approval';
      updateData.approvedBy = null;
      updateData.approvedAt = null;
      console.log(`Discount ${id} was Approved, resetting to Pending Approval due to edit`);
    }

    // Validate dates if provided
    if (updateData.validFrom && updateData.validTo) {
      if (new Date(updateData.validTo) <= new Date(updateData.validFrom)) {
        return res.status(400).json({
          success: false,
          message: 'Valid To date must be after Valid From date'
        });
      }
    }

    const discountMapping = await DiscountMapping.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('product', 'itemName productCode')
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    const message = existingMapping.status === 'Approved' 
      ? 'Discount mapping updated successfully. Status reset to Pending Approval - requires Super Admin approval.'
      : 'Discount mapping updated successfully';

    res.json({
      success: true,
      message,
      discountMapping,
      requiresReapproval: existingMapping.status === 'Approved'
    });
  } catch (error) {
    console.error('Update discount mapping error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating discount mapping'
    });
  }
};

// @desc    Update discount mapping status (approve/reject)
// @route   PATCH /api/discount-mappings/:id/status
// @access  Private
export const updateDiscountMappingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['Approved', 'Rejected', 'Inactive'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be Approved, Rejected, or Inactive'
      });
    }

    const updateData = { status };

    if (status === 'Approved') {
      updateData.approvedBy = req.user.id;
      updateData.approvedAt = new Date();
    } else if (status === 'Rejected') {
      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required when rejecting a discount mapping'
        });
      }
      updateData.rejectionReason = rejectionReason;
    }

    const discountMapping = await DiscountMapping.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('product', 'itemName productCode')
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    if (!discountMapping) {
      return res.status(404).json({
        success: false,
        message: 'Discount mapping not found'
      });
    }

    res.json({
      success: true,
      message: `Discount mapping ${status.toLowerCase()} successfully`,
      discountMapping
    });
  } catch (error) {
    console.error('Update discount mapping status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating discount mapping status'
    });
  }
};

// @desc    Delete discount mapping
// @route   DELETE /api/discount-mappings/:id
// @access  Private
export const deleteDiscountMapping = async (req, res) => {
  try {
    const discountMapping = await DiscountMapping.findById(req.params.id);

    if (!discountMapping) {
      return res.status(404).json({
        success: false,
        message: 'Discount mapping not found'
      });
    }

    // Check if user is super admin (handle both formats: 'super_admin' and 'Super Admin')
    const userRole = req.user?.role?.toLowerCase().replace(/\s+/g, '_');
    const isSuperAdmin = userRole === 'super_admin';

    console.log('Delete discount - User role:', req.user?.role, 'Normalized:', userRole, 'Is Super Admin:', isSuperAdmin);
    console.log('Discount status:', discountMapping.status);

    // Only allow deletion of Draft mappings (unless user is Super Admin)
    if (discountMapping.status !== 'Draft' && !isSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Only draft discount mappings can be deleted. Super Admin can delete any discount.'
      });
    }

    await DiscountMapping.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Discount mapping deleted successfully'
    });
  } catch (error) {
    console.error('Delete discount mapping error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting discount mapping'
    });
  }
};

// @desc    Get applicable discounts for a product
// @route   GET /api/discount-mappings/product/:productId/applicable
// @access  Private
export const getApplicableDiscounts = async (req, res) => {
  try {
    const { productId } = req.params;
    const { mappingType = 'sales', dealerType } = req.query;

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get applicable discounts using the model's static method
    const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
      productId,
      mappingType,
      dealerType
    );

    res.json({
      success: true,
      product: {
        id: product._id,
        name: product.itemName,
        code: product.productCode
      },
      applicableDiscounts,
      discountCount: applicableDiscounts.length
    });
  } catch (error) {
    console.error('Get applicable discounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching applicable discounts'
    });
  }
};

// @desc    Calculate discount for specific product and level
// @route   POST /api/discount-mappings/calculate
// @access  Private
export const calculateDiscount = async (req, res) => {
  try {
    const {
      productId,
      quantity,
      unitPrice,
      mappingType = 'sales',
      dealerType,
      selectedLevel // For level-based discounts
    } = req.body;

    if (!productId || !quantity || !unitPrice) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, quantity, and unit price are required'
      });
    }

    // Get applicable discounts
    const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
      productId,
      mappingType,
      dealerType
    );

    if (applicableDiscounts.length === 0) {
      return res.json({
        success: true,
        discountApplied: false,
        originalAmount: quantity * unitPrice,
        discountAmount: 0,
        discountPercentage: 0,
        finalAmount: quantity * unitPrice,
        message: 'No applicable discounts found'
      });
    }

    // Use the first (highest priority) discount
    const discount = applicableDiscounts[0];
    let discountPercentage = 0;

    if (discount.discountType === 'direct') {
      discountPercentage = discount.directDiscountPercentage;
    } else if (discount.discountType === 'level_based') {
      if (!selectedLevel) {
        return res.json({
          success: true,
          discountApplied: false,
          availableLevels: discount.levels,
          requiresLevelSelection: true,
          message: 'Please select a discount level'
        });
      }
      
      const level = discount.levels.find(l => l.levelName === selectedLevel);
      if (!level) {
        return res.status(400).json({
          success: false,
          message: 'Invalid discount level selected'
        });
      }
      
      discountPercentage = level.discountPercentage;
    }

    // Calculate amounts
    const originalAmount = quantity * unitPrice;
    const discountAmount = (originalAmount * discountPercentage) / 100;
    const finalAmount = originalAmount - discountAmount;

    res.json({
      success: true,
      discountApplied: true,
      discount: {
        id: discount._id,
        name: discount.discountName,
        type: discount.discountType,
        targetType: discount.targetType,
        selectedLevel: selectedLevel || null
      },
      originalAmount,
      discountPercentage,
      discountAmount,
      finalAmount,
      savings: discountAmount
    });
  } catch (error) {
    console.error('Calculate discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while calculating discount'
    });
  }
};

// @desc    Get discount statistics
// @route   GET /api/discount-mappings/stats
// @access  Private
export const getDiscountStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build filter for date range
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const [
      totalMappings,
      activeMappings,
      pendingApproval,
      approvedMappings,
      rejectedMappings,
      expiredMappings,
      byTargetType,
      byDiscountType,
      byMappingType
    ] = await Promise.all([
      DiscountMapping.countDocuments(dateFilter),
      DiscountMapping.countDocuments({ ...dateFilter, status: 'Approved', isActive: true }),
      DiscountMapping.countDocuments({ ...dateFilter, status: 'Pending Approval' }),
      DiscountMapping.countDocuments({ ...dateFilter, status: 'Approved' }),
      DiscountMapping.countDocuments({ ...dateFilter, status: 'Rejected' }),
      DiscountMapping.countDocuments({ ...dateFilter, status: 'Expired' }),
      
      // Group by target type
      DiscountMapping.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$targetType', count: { $sum: 1 } } }
      ]),
      
      // Group by discount type
      DiscountMapping.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$discountType', count: { $sum: 1 } } }
      ]),
      
      // Group by mapping type
      DiscountMapping.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$mappingType', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalMappings,
        activeMappings,
        pendingApproval,
        approvedMappings,
        rejectedMappings,
        expiredMappings,
        byTargetType: byTargetType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byDiscountType: byDiscountType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byMappingType: byMappingType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Get discount stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching discount statistics'
    });
  }
};