import Brand from '../models/Brand.js';

// Helper function for pagination
const getPaginationOptions = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

// Get brands by subcategory with pagination
export const getBrandsBySubcategory = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationOptions(req.query);
    const { search, status } = req.query;
    const { subcategoryId } = req.params;

    // Build filter
    const filter = { subcategory: subcategoryId };
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (search) {
      filter.$text = { $search: search };
    }

    const brands = await Brand.find(filter)
      .populate('createdBy', 'name email')
      .populate('subcategory', 'name')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Brand.countDocuments(filter);

    res.json({
      success: true,
      brands,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Get brands error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all brands with pagination
export const getBrands = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationOptions(req.query);
    const { search, status, category, subcategory } = req.query;

    // Build filter
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (category) {
      filter.category = category;
    }
    if (subcategory) {
      filter.subcategory = subcategory;
    }
    if (search) {
      filter.$text = { $search: search };
    }

    const brands = await Brand.find(filter)
      .populate('createdBy', 'name email')
      .populate('subcategory', 'name')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Brand.countDocuments(filter);

    res.json({
      success: true,
      brands,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Get all brands error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create new brand
export const createBrand = async (req, res) => {
  try {
    const { name, description, subcategory, category } = req.body;

    // Check if brand already exists in this subcategory
    const existingBrand = await Brand.findOne({ 
      name, 
      subcategory 
    });
    if (existingBrand) {
      return res.status(400).json({
        success: false,
        message: 'Brand with this name already exists in this subcategory'
      });
    }

    const brand = await Brand.create({
      name,
      description,
      subcategory,
      category,
      createdBy: req.user._id
    });

    await brand.populate('createdBy', 'name email');
    await brand.populate('subcategory', 'name');
    await brand.populate('category', 'name');

    res.status(201).json({
      success: true,
      message: 'Brand created successfully',
      brand
    });
  } catch (error) {
    console.error('Create brand error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Brand name already exists in this subcategory'
      });
    }
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update brand
export const updateBrand = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    const brand = await Brand.findById(req.params.id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    // Check if name is being changed and if it already exists in the same subcategory
    if (name && name !== brand.name) {
      const existingBrand = await Brand.findOne({ 
        name, 
        subcategory: brand.subcategory 
      });
      if (existingBrand) {
        return res.status(400).json({
          success: false,
          message: 'Brand with this name already exists in this subcategory'
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;

    const updatedBrand = await Brand.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('createdBy', 'name email')
    .populate('subcategory', 'name')
    .populate('category', 'name');

    res.json({
      success: true,
      message: 'Brand updated successfully',
      brand: updatedBrand
    });
  } catch (error) {
    console.error('Update brand error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Brand name already exists in this subcategory'
      });
    }
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete brand
export const deleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    await Brand.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Brand deleted successfully'
    });
  } catch (error) {
    console.error('Delete brand error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};