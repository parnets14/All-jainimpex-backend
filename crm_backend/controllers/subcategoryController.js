import { subcategorySchema } from "../models/Subcategory.js";
import { extendedSubcategorySchema } from "../models/ExtendedSubcategory.js";
import { categorySchema } from "../models/Category.js";
import { brandSchema } from "../models/Brand.js";
import { productSchema } from "../models/Product.js";

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    Subcategory: dbConnection.models.Subcategory || dbConnection.model('Subcategory', subcategorySchema),
    ExtendedSubcategory: dbConnection.models.ExtendedSubcategory || dbConnection.model('ExtendedSubcategory', extendedSubcategorySchema),
    Category: dbConnection.models.Category || dbConnection.model('Category', categorySchema),
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

// Get subcategories by category with pagination
export const getSubcategoriesByCategory = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const { page, limit, skip } = getPaginationOptions(req.query);
    const { search, status } = req.query;
    const { categoryId } = req.params;

    // Build filter
    const filter = { category: categoryId };
    if (status && status !== "all") {
      filter.status = status;
    }
    if (search) {
      filter.$text = { $search: search };
    }

    // Get subcategories with pagination
    const subcategories = await Subcategory.find(filter)
      .populate("createdBy", "name email")
      .populate("category", "name")
      .populate("brand", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await Subcategory.countDocuments(filter);

    // Get extended subcategory counts for each subcategory
    const subcategoriesWithCounts = await Promise.all(
      subcategories.map(async (subcategory) => {
        const extendedCount = await ExtendedSubcategory.countDocuments({
          subcategory: subcategory._id,
          status: "active",
        });

        return {
          ...subcategory,
          extendedCount,
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
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Get subcategories error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get subcategories by brand and category (nested route)
export const getSubcategoriesByBrandAndCategory = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const { page, limit, skip } = getPaginationOptions(req.query);
    const { search, status } = req.query;
    const { brandId, categoryId } = req.params;

    // Build filter
    const filter = {
      brand: brandId,
      category: categoryId,
    };
    if (status && status !== "all") {
      filter.status = status;
    }
    if (search) {
      filter.$text = { $search: search };
    }

    const subcategories = await Subcategory.find(filter)
      .populate("createdBy", "name email")
      .populate("category", "name")
      .populate("brand", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Subcategory.countDocuments(filter);

    // Get extended subcategory counts for each subcategory
    const subcategoriesWithCounts = await Promise.all(
      subcategories.map(async (subcategory) => {
        const extendedCount = await ExtendedSubcategory.countDocuments({
          subcategory: subcategory._id,
          status: "active",
        });

        return {
          ...subcategory,
          extendedCount,
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
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Get subcategories by brand and category error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all subcategories with pagination
export const getSubcategories = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const { page, limit, skip } = getPaginationOptions(req.query);
    const { search, status, brand, category } = req.query;

    // Build filter
    const filter = {};
    if (brand) {
      filter.brand = brand;
    }
    if (status && status !== "all") {
      filter.status = status;
    }
    if (category) {
      filter.category = category;
    }
    if (search) {
      filter.$text = { $search: search };
    }

    const subcategories = await Subcategory.find(filter)
      .populate("createdBy", "name email")
      .populate("category", "name")
      .populate("brand", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Subcategory.countDocuments(filter);

    res.json({
      success: true,
      data: subcategories,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Get all subcategories error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create new subcategory
export const createSubcategory = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Subcategory } = getModels(req.dbConnection);
    
    const { name, description, brand, category } = req.body;

    if (!brand) {
      return res.status(400).json({
        success: false,
        message: "Brand is required",
      });
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Category is required",
      });
    }

    // Check if subcategory already exists in this category
    const existingSubcategory = await Subcategory.findOne({
      name,
      category,
    });
    if (existingSubcategory) {
      return res.status(400).json({
        success: false,
        message: "Subcategory with this name already exists in this category",
      });
    }

    const subcategory = await Subcategory.create({
      name,
      description,
      brand,
      category,
      createdBy: req.user._id,
    });

    await subcategory.populate("createdBy", "name email");
    await subcategory.populate("category", "name");
    await subcategory.populate("brand", "name");

    res.status(201).json({
      success: true,
      message: "Subcategory created successfully",
      subcategory,
    });
  } catch (error) {
    console.error("Create subcategory error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Subcategory name already exists in this category",
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

// Create subcategory under brand's category (nested route)
export const createSubcategoryUnderBrandCategory = async (req, res) => {
  try {
    const { Subcategory } = getModels(req.dbConnection);
    const { name, description } = req.body;
    const { brandId, categoryId } = req.params;

    // Check if subcategory already exists in this category
    const existingSubcategory = await Subcategory.findOne({
      name,
      category: categoryId,
    });
    if (existingSubcategory) {
      return res.status(400).json({
        success: false,
        message: "Subcategory with this name already exists in this category",
      });
    }

    const subcategory = await Subcategory.create({
      name,
      description,
      brand: brandId,
      category: categoryId,
      createdBy: req.user._id,
    });

    await subcategory.populate("createdBy", "name email");
    await subcategory.populate("category", "name");
    await subcategory.populate("brand", "name");

    res.status(201).json({
      success: true,
      message: "Subcategory created successfully",
      subcategory,
    });
  } catch (error) {
    console.error("Create subcategory under brand category error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Subcategory name already exists in this category",
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

// Update subcategory
export const updateSubcategory = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Subcategory } = getModels(req.dbConnection);
    
    const { name, description, status } = req.body;

    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    // Check if name is being changed and if it already exists in the same category
    if (name && name !== subcategory.name) {
      const existingSubcategory = await Subcategory.findOne({
        name,
        category: subcategory.category,
      });
      if (existingSubcategory) {
        return res.status(400).json({
          success: false,
          message: "Subcategory with this name already exists in this category",
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
      .populate("createdBy", "name email")
      .populate("category", "name")
      .populate("brand", "name");

    res.json({
      success: true,
      message: "Subcategory updated successfully",
      subcategory: updatedSubcategory,
    });
  } catch (error) {
    console.error("Update subcategory error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Subcategory name already exists in this category",
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

// Delete subcategory
export const deleteSubcategory = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    // Check if subcategory has extended subcategories
    const extendedCount = await ExtendedSubcategory.countDocuments({
      subcategory: req.params.id,
    });

    if (extendedCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete subcategory with existing extended subcategories",
      });
    }

    await Subcategory.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Subcategory deleted successfully",
    });
  } catch (error) {
    console.error("Delete subcategory error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Change subcategory's parent (category and brand)
// @route   PUT /api/subcategories/:id/change-parent
// @access  Private
export const changeSubcategoryParent = async (req, res) => {
  try {
    const { Subcategory, Category, Brand, Product } = getModels(req.dbConnection);
    const { id } = req.params;
    const { newCategoryId, newBrandId } = req.body;

    // Validate inputs
    if (!newCategoryId || !newBrandId) {
      return res.status(400).json({
        success: false,
        message: "New category ID and brand ID are required",
      });
    }

    // Find the subcategory
    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    // Check if already under this category
    if (
      subcategory.category.toString() === newCategoryId &&
      subcategory.brand.toString() === newBrandId
    ) {
      return res.status(400).json({
        success: false,
        message: "Subcategory is already under this category and brand",
      });
    }

    // Verify new category and brand exist
    const newCategory = await Category.findById(newCategoryId);
    if (!newCategory) {
      return res.status(404).json({
        success: false,
        message: "New category not found",
      });
    }

    const newBrand = await Brand.findById(newBrandId);
    if (!newBrand) {
      return res.status(404).json({
        success: false,
        message: "New brand not found",
      });
    }

    // Verify category belongs to brand (brand-first hierarchy)
    if (newCategory.brand.toString() !== newBrandId) {
      return res.status(400).json({
        success: false,
        message: "Selected category does not belong to the selected brand",
      });
    }

    // Check for name conflict in new category
    const existingSubcategory = await Subcategory.findOne({
      name: subcategory.name,
      category: newCategoryId,
      _id: { $ne: id },
    });
    if (existingSubcategory) {
      return res.status(400).json({
        success: false,
        message: `A subcategory with name "${subcategory.name}" already exists under category "${newCategory.name}"`,
      });
    }

    // Count affected items
    const extendedCount = await ExtendedSubcategory.countDocuments({
      subcategory: id,
    });

    // Start transaction
    const session = await req.dbConnection.startSession();
    session.startTransaction();

    try {
      // Update the subcategory
      await Subcategory.findByIdAndUpdate(
        id,
        {
          category: newCategoryId,
          brand: newBrandId,
        },
        { session, new: true }
      );

      // Recursively update all extended subcategories
      await updateExtendedSubcategoriesRecursively(
        id,
        newCategoryId,
        newBrandId,
        session
      );

      // Update all products using this subcategory
      await Product.updateMany(
        { subcategory: id },
        {
          category: newCategoryId,
          brand: newBrandId,
        },
        { session }
      );

      // Commit transaction
      await session.commitTransaction();

      // Fetch updated subcategory with populated fields
      const updatedSubcategory = await Subcategory.findById(id)
        .populate("brand", "name")
        .populate("category", "name")
        .populate("createdBy", "name email");

      res.json({
        success: true,
        message: "Subcategory parent changed successfully",
        subcategory: updatedSubcategory,
        affectedItems: {
          extendedSubcategories: extendedCount,
          total: extendedCount,
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
    console.error("Change subcategory parent error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to change subcategory parent",
    });
  }
};

// Helper function to recursively update extended subcategories
async function updateExtendedSubcategoriesRecursively(
  subcategoryId,
  newCategoryId,
  newBrandId,
  session
) {
  // Find all Level 1 extended subcategories (direct children of subcategory)
  const level1Items = await ExtendedSubcategory.find({
    subcategory: subcategoryId,
    level: 1,
  }).session(session);

  for (const item of level1Items) {
    // Update this Level 1 item
    await ExtendedSubcategory.findByIdAndUpdate(
      item._id,
      {
        category: newCategoryId,
        brand: newBrandId,
      },
      { session }
    );

    // Recursively update its children (Level 2, 3, 4, 5)
    await updateExtendedChildrenRecursively(
      item._id,
      newCategoryId,
      newBrandId,
      subcategoryId,
      session
    );
  }
}

// Helper function to recursively update extended children
async function updateExtendedChildrenRecursively(
  parentId,
  newCategoryId,
  newBrandId,
  subcategoryId,
  session
) {
  // Find all children of this parent
  const children = await ExtendedSubcategory.find({
    parentExtendedSubcategory: parentId,
  }).session(session);

  for (const child of children) {
    // Update this child
    await ExtendedSubcategory.findByIdAndUpdate(
      child._id,
      {
        category: newCategoryId,
        brand: newBrandId,
        subcategory: subcategoryId, // Keep same subcategory
      },
      { session }
    );

    // Recursively update its children
    await updateExtendedChildrenRecursively(
      child._id,
      newCategoryId,
      newBrandId,
      subcategoryId,
      session
    );
  }
}

// @desc    Get impact preview before changing parent
// @route   GET /api/subcategories/:id/change-parent-preview
// @access  Private
export const getSubcategoryParentChangePreview = async (req, res) => {
  try {
    const { Subcategory, Category, Brand, Product, ExtendedSubcategory } = getModels(req.dbConnection);
    const { id } = req.params;
    const { newCategoryId, newBrandId } = req.query;

    if (!newCategoryId || !newBrandId) {
      return res.status(400).json({
        success: false,
        message: "New category ID and brand ID are required",
      });
    }

    // Find the subcategory
    const subcategory = await Subcategory.findById(id)
      .populate("brand", "name")
      .populate("category", "name");
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    // Verify new category and brand exist

    const newCategory = await Category.findById(newCategoryId);
    if (!newCategory) {
      return res.status(404).json({
        success: false,
        message: "New category not found",
      });
    }

    const newBrand = await Brand.findById(newBrandId);
    if (!newBrand) {
      return res.status(404).json({
        success: false,
        message: "New brand not found",
      });
    }

    // Verify category belongs to brand
    if (newCategory.brand.toString() !== newBrandId) {
      return res.status(400).json({
        success: false,
        message: "Selected category does not belong to the selected brand",
        hasConflict: true,
      });
    }

    // Check for name conflict
    const existingSubcategory = await Subcategory.findOne({
      name: subcategory.name,
      category: newCategoryId,
      _id: { $ne: id },
    });

    // Count affected items
    const extendedCount = await ExtendedSubcategory.countDocuments({
      subcategory: id,
    });

    const productCount = await Product.countDocuments({ subcategory: id });

    res.json({
      success: true,
      preview: {
        currentParent: {
          brand: {
            id: subcategory.brand._id,
            name: subcategory.brand.name,
          },
          category: {
            id: subcategory.category._id,
            name: subcategory.category.name,
          },
        },
        newParent: {
          brand: {
            id: newBrand._id,
            name: newBrand.name,
          },
          category: {
            id: newCategory._id,
            name: newCategory.name,
          },
        },
        hasConflict: !!existingSubcategory,
        conflictMessage: existingSubcategory
          ? `A subcategory with name "${subcategory.name}" already exists under category "${newCategory.name}"`
          : null,
        affectedItems: {
          extendedSubcategories: extendedCount,
          products: productCount,
          total: extendedCount + productCount,
        },
      },
    });
  } catch (error) {
    console.error("Get subcategory parent change preview error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get preview",
    });
  }
};
