import PurchaseDiscountMapping from '../models/PurchaseDiscountMapping.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';
import ExtendedSubcategory from '../models/ExtendedSubcategory.js';

// @desc    Get all purchase discount mappings
// @route   GET /api/purchase-discounts
// @access  Private
export const getPurchaseDiscounts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status,
      isActive,
      brand,
      category,
      subcategory,
      supplier
    } = req.query;

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { discountName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (status) {
      query.status = status;
    }
    
    if (brand) query.brand = brand;
    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;
    if (supplier) query.suppliers = supplier;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const discounts = await PurchaseDiscountMapping.find(query)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('extendedSubcategory', 'name')
      .populate('suppliers', 'name code')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PurchaseDiscountMapping.countDocuments(query);

    res.json({
      success: true,
      data: discounts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalRecords: total,
        hasNext: skip + discounts.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get purchase discounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchase discounts',
      error: error.message
    });
  }
};

// @desc    Get single purchase discount mapping
// @route   GET /api/purchase-discounts/:id
// @access  Private
export const getPurchaseDiscount = async (req, res) => {
  try {
    const discount = await PurchaseDiscountMapping.findById(req.params.id)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('extendedSubcategory', 'name')
      .populate('suppliers', 'name code')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    if (!discount) {
      return res.status(404).json({
        success: false,
        message: 'Purchase discount mapping not found'
      });
    }

    res.json({
      success: true,
      data: discount
    });
  } catch (error) {
    console.error('Get purchase discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchase discount',
      error: error.message
    });
  }
};

// @desc    Create purchase discount mapping
// @route   POST /api/purchase-discounts
// @access  Private
export const createPurchaseDiscount = async (req, res) => {
  try {
    const {
      discountName,
      description,
      brand,
      category,
      subcategory,
      extendedSubcategory,
      suppliers,
      directDiscountPercentage,
      floatingDiscountEnabled,
      floatingDiscountMin,
      floatingDiscountMax,
      validFrom,
      validTo
    } = req.body;

    // Validation
    if (!discountName) {
      return res.status(400).json({
        success: false,
        message: 'Discount name is required'
      });
    }

    // Validate floating discount range
    if (floatingDiscountEnabled) {
      if (floatingDiscountMin > floatingDiscountMax) {
        return res.status(400).json({
          success: false,
          message: 'Floating discount minimum cannot be greater than maximum'
        });
      }
    }

    const discount = new PurchaseDiscountMapping({
      discountName,
      description,
      brand: brand || undefined,
      category: category || undefined,
      subcategory: subcategory || undefined,
      extendedSubcategory: extendedSubcategory || undefined,
      suppliers: suppliers || [],
      directDiscountPercentage: directDiscountPercentage || 0,
      floatingDiscountEnabled: floatingDiscountEnabled || false,
      floatingDiscountMin: floatingDiscountMin || 0,
      floatingDiscountMax: floatingDiscountMax || 100,
      validFrom: validFrom || new Date(),
      validTo: validTo || undefined,
      createdBy: req.user._id
    });

    await discount.save();

    const populatedDiscount = await PurchaseDiscountMapping.findById(discount._id)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('extendedSubcategory', 'name')
      .populate('suppliers', 'name code')
      .populate('createdBy', 'name');

    res.status(201).json({
      success: true,
      message: 'Purchase discount mapping created successfully',
      data: populatedDiscount
    });
  } catch (error) {
    console.error('Create purchase discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating purchase discount mapping',
      error: error.message
    });
  }
};

// @desc    Update purchase discount mapping
// @route   PUT /api/purchase-discounts/:id
// @access  Private
export const updatePurchaseDiscount = async (req, res) => {
  try {
    const {
      discountName,
      description,
      brand,
      category,
      subcategory,
      extendedSubcategory,
      suppliers,
      directDiscountPercentage,
      floatingDiscountEnabled,
      floatingDiscountMin,
      floatingDiscountMax,
      validFrom,
      validTo,
      isActive
    } = req.body;

    const discount = await PurchaseDiscountMapping.findById(req.params.id);

    if (!discount) {
      return res.status(404).json({
        success: false,
        message: 'Purchase discount mapping not found'
      });
    }

    // Validate floating discount range
    if (floatingDiscountEnabled) {
      if (floatingDiscountMin > floatingDiscountMax) {
        return res.status(400).json({
          success: false,
          message: 'Floating discount minimum cannot be greater than maximum'
        });
      }
    }

    // Update fields
    if (discountName !== undefined) discount.discountName = discountName;
    if (description !== undefined) discount.description = description;
    if (brand !== undefined) discount.brand = brand || undefined;
    if (category !== undefined) discount.category = category || undefined;
    if (subcategory !== undefined) discount.subcategory = subcategory || undefined;
    if (extendedSubcategory !== undefined) discount.extendedSubcategory = extendedSubcategory || undefined;
    if (suppliers !== undefined) discount.suppliers = suppliers;
    if (directDiscountPercentage !== undefined) discount.directDiscountPercentage = directDiscountPercentage;
    if (floatingDiscountEnabled !== undefined) discount.floatingDiscountEnabled = floatingDiscountEnabled;
    if (floatingDiscountMin !== undefined) discount.floatingDiscountMin = floatingDiscountMin;
    if (floatingDiscountMax !== undefined) discount.floatingDiscountMax = floatingDiscountMax;
    if (validFrom !== undefined) discount.validFrom = validFrom;
    if (validTo !== undefined) discount.validTo = validTo;
    if (isActive !== undefined) discount.isActive = isActive;
    
    discount.updatedBy = req.user._id;

    await discount.save();

    const populatedDiscount = await PurchaseDiscountMapping.findById(discount._id)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('extendedSubcategory', 'name')
      .populate('suppliers', 'name code')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    res.json({
      success: true,
      message: 'Purchase discount mapping updated successfully',
      data: populatedDiscount
    });
  } catch (error) {
    console.error('Update purchase discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating purchase discount mapping',
      error: error.message
    });
  }
};

// @desc    Delete purchase discount mapping
// @route   DELETE /api/purchase-discounts/:id
// @access  Private
export const deletePurchaseDiscount = async (req, res) => {
  try {
    const discount = await PurchaseDiscountMapping.findById(req.params.id);

    if (!discount) {
      return res.status(404).json({
        success: false,
        message: 'Purchase discount mapping not found'
      });
    }

    await PurchaseDiscountMapping.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Purchase discount mapping deleted successfully'
    });
  } catch (error) {
    console.error('Delete purchase discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting purchase discount mapping',
      error: error.message
    });
  }
};

// @desc    Get applicable discounts for a product and supplier
// @route   GET /api/purchase-discounts/applicable/:productId/:supplierId
// @access  Private
export const getApplicableDiscounts = async (req, res) => {
  try {
    const { productId, supplierId } = req.params;

    const discounts = await PurchaseDiscountMapping.findApplicableDiscounts(productId, supplierId);

    res.json({
      success: true,
      data: discounts
    });
  } catch (error) {
    console.error('Get applicable discounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching applicable discounts',
      error: error.message
    });
  }
};

// @desc    Get filter options for purchase discounts
// @route   GET /api/purchase-discounts/filter-options
// @access  Private
export const getFilterOptions = async (req, res) => {
  try {
    const [brands, categories, subcategories, suppliers] = await Promise.all([
      Brand.find({ isActive: true }).select('name').sort({ name: 1 }),
      Category.find({ isActive: true }).select('name').sort({ name: 1 }),
      Subcategory.find({ isActive: true }).select('name').sort({ name: 1 }),
      Supplier.find({ isActive: true }).select('name code').sort({ name: 1 })
    ]);

    res.json({
      success: true,
      data: {
        brands,
        categories,
        subcategories,
        suppliers
      }
    });
  } catch (error) {
    console.error('Get filter options error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching filter options',
      error: error.message
    });
  }
};

// @desc    Approve or reject purchase discount mapping
// @route   PUT /api/purchase-discounts/:id/approve
// @access  Private (Super Admin only)
export const approvePurchaseDiscount = async (req, res) => {
  try {
    const { action, approvalRemarks } = req.body;

    // Validate action
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "approve" or "reject"'
      });
    }

    // Validate remarks for rejection
    if (action === 'reject' && !approvalRemarks) {
      return res.status(400).json({
        success: false,
        message: 'Approval remarks are required for rejection'
      });
    }

    const discount = await PurchaseDiscountMapping.findById(req.params.id);

    if (!discount) {
      return res.status(404).json({
        success: false,
        message: 'Purchase discount mapping not found'
      });
    }

    // Check if already processed
    if (discount.status === 'Approved' || discount.status === 'Rejected') {
      return res.status(400).json({
        success: false,
        message: `Purchase discount mapping is already ${discount.status.toLowerCase()}`
      });
    }

    // Update status based on action
    if (action === 'approve') {
      discount.status = 'Approved';
      discount.approvedBy = req.user._id;
      discount.approvedDate = new Date();
      discount.isActive = true;
    } else {
      discount.status = 'Rejected';
      discount.rejectedBy = req.user._id;
      discount.rejectedDate = new Date();
      discount.isActive = false;
    }

    discount.approvalRemarks = approvalRemarks;
    discount.updatedBy = req.user._id;

    await discount.save();

    const populatedDiscount = await PurchaseDiscountMapping.findById(discount._id)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('extendedSubcategory', 'name')
      .populate('suppliers', 'name code')
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .populate('rejectedBy', 'name');

    res.json({
      success: true,
      message: `Purchase discount mapping ${action}d successfully`,
      data: populatedDiscount
    });
  } catch (error) {
    console.error('Approve purchase discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing purchase discount approval',
      error: error.message
    });
  }
};