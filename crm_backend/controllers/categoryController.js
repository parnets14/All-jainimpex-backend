import { categorySchema } from "../models/Category.js";
import { productSchema } from "../models/Product.js";
import { subcategorySchema } from "../models/Subcategory.js";
import { extendedSubcategorySchema } from "../models/ExtendedSubcategory.js";
import { brandSchema } from "../models/Brand.js";

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    Category: dbConnection.models.Category || dbConnection.model('Category', categorySchema),
    Subcategory: dbConnection.models.Subcategory || dbConnection.model('Subcategory', subcategorySchema),
    ExtendedSubcategory: dbConnection.models.ExtendedSubcategory || dbConnection.model('ExtendedSubcategory', extendedSubcategorySchema),
    Brand: dbConnection.models.Brand || dbConnection.model('Brand', brandSchema),
    Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
  };
};

// Helper function for pagination
const getPaginationOptions = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

// Get all categories with pagination (optionally filtered by brand)
export const getCategories = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category, Brand, Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const { page, limit, skip } = getPaginationOptions(req.query);
    const { search, status, brand } = req.query;

    // Build filter
    const filter = {};
    if (brand) {
      filter.brand = brand;
    }
    if (status && status !== "all") {
      filter.status = status;
    }
    if (search) {
      filter.$text = { $search: search };
    }

    // Get categories with pagination
    const categories = await Category.find(filter)
      .populate("createdBy", "name email")
      .populate("brand", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await Category.countDocuments(filter);

    // Get subcategory counts for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const subcategoryCount = await Subcategory.countDocuments({
          category: category._id,
          status: "active",
        });
        const extendedCount = await ExtendedSubcategory.countDocuments({
          category: category._id,
          status: "active",
        });

        return {
          ...category,
          subcategoryCount,
          extendedCount,
        };
      })
    );

    res.json({
      success: true,
      categories: categoriesWithCounts,
      data: categoriesWithCounts, // Keep both for compatibility
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get categories by brand
export const getCategoriesByBrand = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category, Brand, Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const { page, limit, skip } = getPaginationOptions(req.query);
    const { search, status } = req.query;
    const { brandId } = req.params;

    // Build filter
    const filter = { brand: brandId };
    if (status && status !== "all") {
      filter.status = status;
    }
    if (search) {
      filter.$text = { $search: search };
    }

    const categories = await Category.find(filter)
      .populate("createdBy", "name email")
      .populate("brand", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Category.countDocuments(filter);

    // Get subcategory counts for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const subcategoryCount = await Subcategory.countDocuments({
          category: category._id,
          status: "active",
        });
        const extendedCount = await ExtendedSubcategory.countDocuments({
          category: category._id,
          status: "active",
        });

        return {
          ...category,
          subcategoryCount,
          extendedCount,
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
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Get categories by brand error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get single category
export const getCategory = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category } = getModels(req.dbConnection);
    
    const category = await Category.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("brand", "name");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.json({
      success: true,
      category,
    });
  } catch (error) {
    console.error("Get category error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create new category
export const createCategory = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category, Brand } = getModels(req.dbConnection);
    
    const { name, description, brand } = req.body;

    if (!brand) {
      return res.status(400).json({
        success: false,
        message: "Brand is required",
      });
    }

    // Check if category already exists under this brand
    const existingCategory = await Category.findOne({ name, brand });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists under this brand",
      });
    }

    const category = await Category.create({
      name,
      description,
      brand,
      createdBy: req.user._id,
    });

    await category.populate("createdBy", "name email");
    await category.populate("brand", "name");

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    console.error("Create category error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Category name already exists under this brand",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create category under brand (nested route)
export const createCategoryUnderBrand = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category, Brand } = getModels(req.dbConnection);
    
    const { name, description } = req.body;
    const { brandId } = req.params;

    // Check if category already exists under this brand
    const existingCategory = await Category.findOne({ name, brand: brandId });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists under this brand",
      });
    }

    const category = await Category.create({
      name,
      description,
      brand: brandId,
      createdBy: req.user._id,
    });

    await category.populate("createdBy", "name email");
    await category.populate("brand", "name");

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    console.error("Create category under brand error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Category name already exists under this brand",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update category
export const updateCategory = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category } = getModels(req.dbConnection);
    
    const { name, description, status } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if name is being changed and if it already exists under the same brand
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({
        name,
        brand: category.brand,
      });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Category with this name already exists under this brand",
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
    )
      .populate("createdBy", "name email")
      .populate("brand", "name");

    res.json({
      success: true,
      message: "Category updated successfully",
      category: updatedCategory,
    });
  } catch (error) {
    console.error("Update category error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Category name already exists under this brand",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get child counts for a category (to show in delete confirmation)
export const getCategoryChildCounts = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category, Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const categoryId = req.params.id;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Count subcategories
    const subcategoryCount = await Subcategory.countDocuments({
      category: categoryId,
    });

    // Count extended subcategories
    const extendedCount = await ExtendedSubcategory.countDocuments({
      category: categoryId,
    });

    res.json({
      success: true,
      counts: {
        subcategories: subcategoryCount,
        extendedSubcategories: extendedCount,
        total: subcategoryCount + extendedCount,
      },
    });
  } catch (error) {
    console.error("Get category child counts error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete category with cascade option
export const deleteCategoryWithCascade = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category, Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const categoryId = req.params.id;
    const { cascade } = req.query; // ?cascade=true for cascade deletion

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    if (cascade === "true") {
      // Cascade deletion: delete category and all its children
      console.log(`🗑️ Cascade deleting category: ${category.name}`);

      // Delete all extended subcategories under this category
      const extendedDeleted = await ExtendedSubcategory.deleteMany({
        category: categoryId,
      });
      console.log(
        `   Deleted ${extendedDeleted.deletedCount} extended subcategories`
      );

      // Delete all subcategories under this category
      const subcategoriesDeleted = await Subcategory.deleteMany({
        category: categoryId,
      });
      console.log(
        `   Deleted ${subcategoriesDeleted.deletedCount} subcategories`
      );

      // Finally, delete the category itself
      await Category.findByIdAndDelete(categoryId);
      console.log(`   Deleted category: ${category.name}`);

      res.json({
        success: true,
        message: "Category and all its children deleted successfully",
        deleted: {
          category: 1,
          subcategories: subcategoriesDeleted.deletedCount,
          extendedSubcategories: extendedDeleted.deletedCount,
          total:
            1 +
            subcategoriesDeleted.deletedCount +
            extendedDeleted.deletedCount,
        },
      });
    } else {
      // Non-cascade deletion: check if category has children
      const subcategoryCount = await Subcategory.countDocuments({
        category: categoryId,
      });

      if (subcategoryCount > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot delete category with existing subcategories. Use cascade deletion to delete all children.",
          hasChildren: true,
          childCount: subcategoryCount,
        });
      }

      // No children, safe to delete
      await Category.findByIdAndDelete(categoryId);

      res.json({
        success: true,
        message: "Category deleted successfully",
      });
    }
  } catch (error) {
    console.error("Delete category error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete category (keep old function for backward compatibility)
export const deleteCategory = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category, Subcategory } = getModels(req.dbConnection);
    
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if category has subcategories
    const subcategoryCount = await Subcategory.countDocuments({
      category: req.params.id,
    });

    if (subcategoryCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete category with existing subcategories",
        hasChildren: true,
        childCount: subcategoryCount,
      });
    }

    await Category.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Delete category error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get category statistics
export const getCategoryStats = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category, Subcategory, ExtendedSubcategory, Brand } = getModels(req.dbConnection);
    
    const totalCategories = await Category.countDocuments();
    const activeCategories = await Category.countDocuments({
      status: "active",
    });

    const totalSubcategories = await Subcategory.countDocuments();
    const activeSubcategories = await Subcategory.countDocuments({
      status: "active",
    });

    const totalExtended = await ExtendedSubcategory.countDocuments();
    const activeExtended = await ExtendedSubcategory.countDocuments({
      status: "active",
    });

    // Add brands stats
    const totalBrands = await Brand.countDocuments();
    const activeBrands = await Brand.countDocuments({
      status: "active",
    });

    // Categories with most subcategories
    const topCategories = await Category.aggregate([
      {
        $lookup: {
          from: "subcategories",
          localField: "_id",
          foreignField: "category",
          as: "subcategories",
        },
      },
      {
        $lookup: {
          from: "brands",
          localField: "brand",
          foreignField: "_id",
          as: "brandInfo",
        },
      },
      {
        $project: {
          name: 1,
          brandName: { $arrayElemAt: ["$brandInfo.name", 0] },
          subcategoryCount: { $size: "$subcategories" },
        },
      },
      { $sort: { subcategoryCount: -1 } },
      { $limit: 5 },
    ]);

    res.json({
      success: true,
      stats: {
        brands: {
          total: totalBrands,
          active: activeBrands,
          inactive: totalBrands - activeBrands,
        },
        categories: {
          total: totalCategories,
          active: activeCategories,
          inactive: totalCategories - activeCategories,
        },
        subcategories: {
          total: totalSubcategories,
          active: activeSubcategories,
          inactive: totalSubcategories - activeSubcategories,
        },
        extended: {
          total: totalExtended,
          active: activeExtended,
          inactive: totalExtended - activeExtended,
        },
        topCategories,
      },
    });
  } catch (error) {
    console.error("Get category stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Change category's brand (parent)
// @route   PUT /api/categories/:id/change-parent
// @access  Private
export const changeCategoryParent = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category, Brand, Subcategory, ExtendedSubcategory, Product } = getModels(req.dbConnection);
    
    const { id } = req.params;
    const { newBrandId } = req.body;

    // Validate inputs
    if (!newBrandId) {
      return res.status(400).json({
        success: false,
        message: "New brand ID is required",
      });
    }

    // Find the category
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if already under this brand
    if (category.brand.toString() === newBrandId) {
      return res.status(400).json({
        success: false,
        message: "Category is already under this brand",
      });
    }

    // Verify new brand exists
    const newBrand = await Brand.findById(newBrandId);
    if (!newBrand) {
      return res.status(404).json({
        success: false,
        message: "New brand not found",
      });
    }

    // Check for name conflict in new brand
    const existingCategory = await Category.findOne({
      name: category.name,
      brand: newBrandId,
      _id: { $ne: id },
    });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: `A category with name "${category.name}" already exists under brand "${newBrand.name}"`,
      });
    }

    // Count affected items
    const subcategoryCount = await Subcategory.countDocuments({
      category: id,
    });
    const extendedCount = await ExtendedSubcategory.countDocuments({
      category: id,
    });

    // Start transaction
    const session = await req.dbConnection.startSession();
    session.startTransaction();

    try {
      // Update the category
      await Category.findByIdAndUpdate(
        id,
        { brand: newBrandId },
        { session, new: true }
      );

      // Update all subcategories under this category
      await Subcategory.updateMany(
        { category: id },
        { brand: newBrandId },
        { session }
      );

      // Update all extended subcategories under this category
      await ExtendedSubcategory.updateMany(
        { category: id },
        { brand: newBrandId },
        { session }
      );

      // Update all products using this category

      await Product.updateMany(
        { category: id },
        { brand: newBrandId },
        { session }
      );

      // Commit transaction
      await session.commitTransaction();

      // Fetch updated category with populated fields
      const updatedCategory = await Category.findById(id)
        .populate("brand", "name")
        .populate("createdBy", "name email");

      res.json({
        success: true,
        message: "Category parent changed successfully",
        category: updatedCategory,
        affectedItems: {
          subcategories: subcategoryCount,
          extendedSubcategories: extendedCount,
          total: subcategoryCount + extendedCount,
        },
      });
    } catch (error) {
      // Rollback transaction on error
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Change category parent error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to change category parent",
    });
  }
};

// @desc    Get impact preview before changing parent
// @route   GET /api/categories/:id/change-parent-preview
// @access  Private
export const getCategoryParentChangePreview = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Category, Subcategory, ExtendedSubcategory, Brand, Product } = getModels(req.dbConnection);
    
    const { id } = req.params;
    const { newBrandId } = req.query;

    if (!newBrandId) {
      return res.status(400).json({
        success: false,
        message: "New brand ID is required",
      });
    }

    // Find the category
    const category = await Category.findById(id).populate("brand", "name");
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Verify new brand exists
    const newBrand = await Brand.findById(newBrandId);
    if (!newBrand) {
      return res.status(404).json({
        success: false,
        message: "New brand not found",
      });
    }

    // Check for name conflict
    const existingCategory = await Category.findOne({
      name: category.name,
      brand: newBrandId,
      _id: { $ne: id },
    });

    // Count affected items
    const subcategoryCount = await Subcategory.countDocuments({
      category: id,
    });
    const extendedCount = await ExtendedSubcategory.countDocuments({
      category: id,
    });

    const productCount = await Product.countDocuments({ category: id });

    res.json({
      success: true,
      preview: {
        currentParent: {
          id: category.brand._id,
          name: category.brand.name,
        },
        newParent: {
          id: newBrand._id,
          name: newBrand.name,
        },
        hasConflict: !!existingCategory,
        conflictMessage: existingCategory
          ? `A category with name "${category.name}" already exists under brand "${newBrand.name}"`
          : null,
        affectedItems: {
          subcategories: subcategoryCount,
          extendedSubcategories: extendedCount,
          products: productCount,
          total: subcategoryCount + extendedCount + productCount,
        },
      },
    });
  } catch (error) {
    console.error("Get category parent change preview error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get preview",
    });
  }
};
