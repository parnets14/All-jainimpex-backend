import { brandSchema } from "../models/Brand.js";
import { categorySchema } from "../models/Category.js";
import { subcategorySchema } from "../models/Subcategory.js";
import { extendedSubcategorySchema } from "../models/ExtendedSubcategory.js";

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    Brand: dbConnection.models.Brand || dbConnection.model('Brand', brandSchema),
    Category: dbConnection.models.Category || dbConnection.model('Category', categorySchema),
    Subcategory: dbConnection.models.Subcategory || dbConnection.model('Subcategory', subcategorySchema),
    ExtendedSubcategory: dbConnection.models.ExtendedSubcategory || dbConnection.model('ExtendedSubcategory', extendedSubcategorySchema),
  };
};

// Helper function for pagination
const getPaginationOptions = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

// Get all brands with pagination
export const getBrands = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Brand, Category, Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const { page, limit, skip } = getPaginationOptions(req.query);
    const { search, status } = req.query;

    // Build filter
    const filter = {};
    if (status && status !== "all") {
      filter.status = status;
    }
    if (search) {
      filter.$text = { $search: search };
    }

    const brands = await Brand.find(filter)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Brand.countDocuments(filter);

    // Get category and subcategory counts for each brand
    const brandsWithCounts = await Promise.all(
      brands.map(async (brand) => {
        const categoryCount = await Category.countDocuments({
          brand: brand._id,
          status: "active",
        });
        const subcategoryCount = await Subcategory.countDocuments({
          brand: brand._id,
          status: "active",
        });
        const extendedCount = await ExtendedSubcategory.countDocuments({
          brand: brand._id,
          status: "active",
        });

        return {
          ...brand.toObject(),
          categoryCount,
          subcategoryCount,
          extendedCount,
        };
      })
    );

    res.json({
      success: true,
      brands: brandsWithCounts,
      data: brandsWithCounts, // Keep both for compatibility
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Get brands error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get single brand
export const getBrand = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Brand, Category, Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const brand = await Brand.findById(req.params.id).populate(
      "createdBy",
      "name email"
    );

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    // Get counts
    const categoryCount = await Category.countDocuments({ brand: brand._id });
    const subcategoryCount = await Subcategory.countDocuments({
      brand: brand._id,
    });
    const extendedCount = await ExtendedSubcategory.countDocuments({
      brand: brand._id,
    });

    res.json({
      success: true,
      brand: {
        ...brand.toObject(),
        categoryCount,
        subcategoryCount,
        extendedCount,
      },
    });
  } catch (error) {
    console.error("Get brand error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create new brand
export const createBrand = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Brand } = getModels(req.dbConnection);
    
    const { name, description } = req.body;

    // Check if brand already exists
    const existingBrand = await Brand.findOne({ name });
    if (existingBrand) {
      return res.status(400).json({
        success: false,
        message: "Brand with this name already exists",
      });
    }

    const brand = await Brand.create({
      name,
      description,
      createdBy: req.user._id,
    });

    await brand.populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Brand created successfully",
      brand,
    });
  } catch (error) {
    console.error("Create brand error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Brand name already exists",
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

// Update brand
export const updateBrand = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Brand } = getModels(req.dbConnection);
    
    const { name, description, status } = req.body;

    const brand = await Brand.findById(req.params.id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    // Check if name is being changed and if it already exists
    if (name && name !== brand.name) {
      const existingBrand = await Brand.findOne({ name });
      if (existingBrand) {
        return res.status(400).json({
          success: false,
          message: "Brand with this name already exists",
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
    ).populate("createdBy", "name email");

    res.json({
      success: true,
      message: "Brand updated successfully",
      brand: updatedBrand,
    });
  } catch (error) {
    console.error("Update brand error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Brand name already exists",
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

// Delete brand (with cascade option)
export const deleteBrand = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Brand, Category, Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const { cascade } = req.query;
    const brand = await Brand.findById(req.params.id);

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    if (cascade === "true") {
      // Cascade delete: delete brand and all its children
      console.log(`🗑️ Cascade deleting brand: ${brand.name}`);

      // Delete all extended subcategories under this brand
      const extendedDeleted = await ExtendedSubcategory.deleteMany({
        brand: brand._id,
      });
      console.log(
        `   Deleted ${extendedDeleted.deletedCount} extended subcategories`
      );

      // Delete all subcategories under this brand
      const subcategoriesDeleted = await Subcategory.deleteMany({
        brand: brand._id,
      });
      console.log(
        `   Deleted ${subcategoriesDeleted.deletedCount} subcategories`
      );

      // Delete all categories under this brand
      const categoriesDeleted = await Category.deleteMany({ brand: brand._id });
      console.log(`   Deleted ${categoriesDeleted.deletedCount} categories`);

      // Finally, delete the brand itself
      await Brand.findByIdAndDelete(brand._id);
      console.log(`   Deleted brand: ${brand.name}`);

      res.json({
        success: true,
        message: "Brand and all its children deleted successfully",
        deleted: {
          brand: 1,
          categories: categoriesDeleted.deletedCount,
          subcategories: subcategoriesDeleted.deletedCount,
          extendedSubcategories: extendedDeleted.deletedCount,
          total:
            1 +
            categoriesDeleted.deletedCount +
            subcategoriesDeleted.deletedCount +
            extendedDeleted.deletedCount,
        },
      });
    } else {
      // Non-cascade deletion: check if brand has children
      const categoryCount = await Category.countDocuments({ brand: brand._id });

      if (categoryCount > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot delete brand with existing categories. Use cascade deletion to delete all children.",
          hasChildren: true,
          childCount: categoryCount,
        });
      }

      // No children, safe to delete
      await Brand.findByIdAndDelete(brand._id);

      res.json({
        success: true,
        message: "Brand deleted successfully",
      });
    }
  } catch (error) {
    console.error("Delete brand error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get brand statistics
export const getBrandStats = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Brand, Category, Subcategory } = getModels(req.dbConnection);
    
    const totalBrands = await Brand.countDocuments();
    const activeBrands = await Brand.countDocuments({ status: "active" });

    const totalCategories = await Category.countDocuments();
    const activeCategories = await Category.countDocuments({
      status: "active",
    });

    const totalSubcategories = await Subcategory.countDocuments();
    const activeSubcategories = await Subcategory.countDocuments({
      status: "active",
    });

    // Brands with most categories
    const topBrands = await Brand.aggregate([
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "brand",
          as: "categories",
        },
      },
      {
        $project: {
          name: 1,
          categoryCount: { $size: "$categories" },
        },
      },
      { $sort: { categoryCount: -1 } },
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
        topBrands,
      },
    });
  } catch (error) {
    console.error("Get brand stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get child counts for a brand (for delete confirmation)
export const getBrandChildCounts = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Brand, Category, Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const brandId = req.params.id;

    const brand = await Brand.findById(brandId);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    const categoryCount = await Category.countDocuments({ brand: brandId });
    const subcategoryCount = await Subcategory.countDocuments({
      brand: brandId,
    });
    const extendedCount = await ExtendedSubcategory.countDocuments({
      brand: brandId,
    });

    res.json({
      success: true,
      counts: {
        categories: categoryCount,
        subcategories: subcategoryCount,
        extendedSubcategories: extendedCount,
        total: categoryCount + subcategoryCount + extendedCount,
      },
    });
  } catch (error) {
    console.error("Get brand child counts error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
