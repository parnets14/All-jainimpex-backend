import Subcategory from '../models/Subcategory.js';
import Brand from '../models/Brand.js';

// Helper function for pagination
const getPaginationOptions = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

// Get subcategories by category with pagination
export const getSubcategoriesByCategory = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationOptions(req.query);
    const { search, status } = req.query;
    const { categoryId } = req.params;

    // Build filter
    const filter = { category: categoryId };
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (search) {
      filter.$text = { $search: search };
    }

    // Get subcategories with pagination
    const subcategories = await Subcategory.find(filter)
      .populate('createdBy', 'name email')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await Subcategory.countDocuments(filter);

    // Get brand counts for each subcategory
    const subcategoriesWithCounts = await Promise.all(
      subcategories.map(async (subcategory) => {
        const brandCount = await Brand.countDocuments({ 
          subcategory: subcategory._id,
          status: 'active'
        });

        return {
          ...subcategory,
          brandCount
        };
      })
    );

    res.json({
      success: true,
      subcategories: subcategoriesWithCounts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Get subcategories error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all subcategories with pagination
export const getSubcategories = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationOptions(req.query);
    const { search, status, category } = req.query;

    // Build filter
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (category) {
      filter.category = category;
    }
    if (search) {
      filter.$text = { $search: search };
    }

    const subcategories = await Subcategory.find(filter)
      .populate('createdBy', 'name email')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Subcategory.countDocuments(filter);

    res.json({
      success: true,
      subcategories,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Get all subcategories error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create new subcategory
export const createSubcategory = async (req, res) => {
  try {
    const { name, description, category } = req.body;

    // Check if subcategory already exists in this category
    const existingSubcategory = await Subcategory.findOne({ 
      name, 
      category 
    });
    if (existingSubcategory) {
      return res.status(400).json({
        success: false,
        message: 'Subcategory with this name already exists in this category'
      });
    }

    const subcategory = await Subcategory.create({
      name,
      description,
      category,
      createdBy: req.user._id
    });

    await subcategory.populate('createdBy', 'name email');
    await subcategory.populate('category', 'name');

    res.status(201).json({
      success: true,
      message: 'Subcategory created successfully',
      subcategory
    });
  } catch (error) {
    console.error('Create subcategory error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Subcategory name already exists in this category'
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

// Update subcategory
export const updateSubcategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'Subcategory not found'
      });
    }

    // Check if name is being changed and if it already exists in the same category
    if (name && name !== subcategory.name) {
      const existingSubcategory = await Subcategory.findOne({ 
        name, 
        category: subcategory.category 
      });
      if (existingSubcategory) {
        return res.status(400).json({
          success: false,
          message: 'Subcategory with this name already exists in this category'
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;

    const updatedSubcategory = await Subcategory.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('createdBy', 'name email')
    .populate('category', 'name');

    res.json({
      success: true,
      message: 'Subcategory updated successfully',
      subcategory: updatedSubcategory
    });
  } catch (error) {
    console.error('Update subcategory error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Subcategory name already exists in this category'
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

// Delete subcategory
export const deleteSubcategory = async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'Subcategory not found'
      });
    }

    // Check if subcategory has brands
    const brandCount = await Brand.countDocuments({ 
      subcategory: req.params.id 
    });
    
    if (brandCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete subcategory with existing brands'
      });
    }

    await Subcategory.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Subcategory deleted successfully'
    });
  } catch (error) {
    console.error('Delete subcategory error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};