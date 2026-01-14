import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';
import Brand from '../models/Brand.js';

// Helper function for pagination
const getPaginationOptions = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

// Get all categories with pagination
export const getCategories = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationOptions(req.query);
    const { search, status } = req.query;

    // Build filter
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (search) {
      filter.$text = { $search: search };
    }

    // Get categories with pagination
    const categories = await Category.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await Category.countDocuments(filter);

    // Get subcategory and brand counts for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const subcategoryCount = await Subcategory.countDocuments({ 
          category: category._id,
          status: 'active'
        });
        const brandCount = await Brand.countDocuments({ 
          category: category._id,
          status: 'active'
        });

        return {
          ...category,
          subcategoryCount,
          brandCount
        };
      })
    );

    res.json({
      success: true,
      categories: categoriesWithCounts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get single category
export const getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.json({
      success: true,
      category
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create new category
export const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if category already exists
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists'
      });
    }

    const category = await Category.create({
      name,
      description,
      createdBy: req.user._id
    });

    await category.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    console.error('Create category error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Category name already exists'
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

// Update category
export const updateCategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if name is being changed and if it already exists
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ name });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists'
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    res.json({
      success: true,
      message: 'Category updated successfully',
      category: updatedCategory
    });
  } catch (error) {
    console.error('Update category error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Category name already exists'
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

// Get child counts for an item (to show in delete confirmation)
export const getCategoryChildCounts = async (req, res) => {
  try {
    const categoryId = req.params.id;
    
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Count subcategories
    const subcategoryCount = await Subcategory.countDocuments({ 
      category: categoryId 
    });
    
    // Count brands under this category
    const brandCount = await Brand.countDocuments({ 
      category: categoryId 
    });
    
    // Count extended subcategories (import ExtendedSubcategory if needed)
    let extendedCount = 0;
    try {
      const ExtendedSubcategory = (await import('../models/ExtendedSubcategory.js')).default;
      extendedCount = await ExtendedSubcategory.countDocuments({ 
        category: categoryId 
      });
    } catch (error) {
      console.log('ExtendedSubcategory model not found or error:', error.message);
    }

    res.json({
      success: true,
      counts: {
        subcategories: subcategoryCount,
        extendedSubcategories: extendedCount,
        brands: brandCount,
        total: subcategoryCount + extendedCount + brandCount
      }
    });
  } catch (error) {
    console.error('Get category child counts error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete category with cascade option
export const deleteCategoryWithCascade = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const { cascade } = req.query; // ?cascade=true for cascade deletion
    
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    if (cascade === 'true') {
      // Cascade deletion: delete category and all its children
      console.log(`🗑️ Cascade deleting category: ${category.name}`);
      
      // Delete all brands under this category
      const brandsDeleted = await Brand.deleteMany({ category: categoryId });
      console.log(`   Deleted ${brandsDeleted.deletedCount} brands`);
      
      // Delete all extended subcategories under this category
      let extendedDeleted = 0;
      try {
        const ExtendedSubcategory = (await import('../models/ExtendedSubcategory.js')).default;
        const extendedResult = await ExtendedSubcategory.deleteMany({ category: categoryId });
        extendedDeleted = extendedResult.deletedCount;
        console.log(`   Deleted ${extendedDeleted} extended subcategories`);
      } catch (error) {
        console.log('ExtendedSubcategory model not found or error:', error.message);
      }
      
      // Delete all subcategories under this category
      const subcategoriesDeleted = await Subcategory.deleteMany({ category: categoryId });
      console.log(`   Deleted ${subcategoriesDeleted.deletedCount} subcategories`);
      
      // Finally, delete the category itself
      await Category.findByIdAndDelete(categoryId);
      console.log(`   Deleted category: ${category.name}`);

      res.json({
        success: true,
        message: 'Category and all its children deleted successfully',
        deleted: {
          category: 1,
          subcategories: subcategoriesDeleted.deletedCount,
          extendedSubcategories: extendedDeleted,
          brands: brandsDeleted.deletedCount,
          total: 1 + subcategoriesDeleted.deletedCount + extendedDeleted + brandsDeleted.deletedCount
        }
      });
    } else {
      // Non-cascade deletion: check if category has children
      const subcategoryCount = await Subcategory.countDocuments({ 
        category: categoryId 
      });
      
      if (subcategoryCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete category with existing subcategories. Use cascade deletion to delete all children.',
          hasChildren: true,
          childCount: subcategoryCount
        });
      }

      // No children, safe to delete
      await Category.findByIdAndDelete(categoryId);

      res.json({
        success: true,
        message: 'Category deleted successfully'
      });
    }
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete category (keep old function for backward compatibility)
export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if category has subcategories
    const subcategoryCount = await Subcategory.countDocuments({ 
      category: req.params.id 
    });
    
    if (subcategoryCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with existing subcategories',
        hasChildren: true,
        childCount: subcategoryCount
      });
    }

    await Category.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get category statistics
export const getCategoryStats = async (req, res) => {
  try {
    const totalCategories = await Category.countDocuments();
    const activeCategories = await Category.countDocuments({ status: 'active' });
    
    const totalSubcategories = await Subcategory.countDocuments();
    const activeSubcategories = await Subcategory.countDocuments({ status: 'active' });
    
    const totalBrands = await Brand.countDocuments();
    const activeBrands = await Brand.countDocuments({ status: 'active' });

    // Categories with most subcategories
    const topCategories = await Category.aggregate([
      {
        $lookup: {
          from: 'subcategories',
          localField: '_id',
          foreignField: 'category',
          as: 'subcategories'
        }
      },
      {
        $project: {
          name: 1,
          subcategoryCount: { $size: '$subcategories' }
        }
      },
      { $sort: { subcategoryCount: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      success: true,
      stats: {
        categories: {
          total: totalCategories,
          active: activeCategories,
          inactive: totalCategories - activeCategories
        },
        subcategories: {
          total: totalSubcategories,
          active: activeSubcategories,
          inactive: totalSubcategories - activeSubcategories
        },
        brands: {
          total: totalBrands,
          active: activeBrands,
          inactive: totalBrands - activeBrands
        },
        topCategories
      }
    });
  } catch (error) {
    console.error('Get category stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};