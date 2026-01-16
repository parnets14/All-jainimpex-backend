import ExtendedSubcategory from "../models/ExtendedSubcategory.js";
import Brand from "../models/Brand.js";
import Category from "../models/Category.js";
import Subcategory from "../models/Subcategory.js";
import {
  getPaginationParams,
  createPaginationResponse,
} from "../utils/pagination.js";

// @desc    Get extended subcategories by level and parent
// @route   GET /api/extended-subcategories
// @access  Private
export const getExtendedSubcategories = async (req, res) => {
  try {
    const { level, parent, brand, category, subcategory, search } = req.query;
    const { page, limit, skip } = getPaginationParams(req);

    const query = {
      status: "active",
    };

    // Filter by brand, category and subcategory (required for proper hierarchy)
    if (brand) query.brand = brand;
    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;

    // Filter by level
    if (level) query.level = parseInt(level);

    // Filter by parent
    if (parent) {
      query.parentExtendedSubcategory = parent;
    } else if (level === "1") {
      query.parentExtendedSubcategory = null;
    }

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const items = await ExtendedSubcategory.find(query)
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("parentExtendedSubcategory", "name level")
      .populate("createdBy", "name email")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit);

    const total = await ExtendedSubcategory.countDocuments(query);

    // Add children count for each item
    const itemsWithCounts = await Promise.all(
      items.map(async (item) => {
        const childrenCount = await ExtendedSubcategory.countDocuments({
          parentExtendedSubcategory: item._id,
          status: "active",
        });

        return {
          ...item.toObject(),
          childrenCount,
          canHaveChildren: item.level < 5, // Max 5 levels
          fullPath: await item.getFullPath(),
        };
      })
    );

    res.json({
      success: true,
      items: itemsWithCounts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching extended subcategories:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get extended subcategories by brand, category, and subcategory (nested route)
// @route   GET /api/brands/:brandId/categories/:categoryId/subcategories/:subcategoryId/extended
// @access  Private
export const getExtendedByBrandCategorySubcategory = async (req, res) => {
  try {
    const { brandId, categoryId, subcategoryId } = req.params;
    const { page = 1, limit = 100, search } = req.query;

    const query = {
      brand: brandId,
      category: categoryId,
      subcategory: subcategoryId,
      parentExtendedSubcategory: null, // Only Level 1 items
      status: "active",
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const items = await ExtendedSubcategory.find(query)
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("parentExtendedSubcategory", "name level")
      .populate("createdBy", "name email")
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ExtendedSubcategory.countDocuments(query);

    res.json({
      success: true,
      items,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error(
      "Error fetching extended subcategories by brand, category, and subcategory:",
      error
    );
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single extended subcategory
// @route   GET /api/extended-subcategories/:id
// @access  Private
export const getExtendedSubcategory = async (req, res) => {
  try {
    const item = await ExtendedSubcategory.findById(req.params.id)
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("parentExtendedSubcategory", "name level")
      .populate("createdBy", "name email");

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Extended subcategory not found",
      });
    }

    const fullPath = await item.getFullPath();

    res.json({
      success: true,
      item: {
        ...item.toObject(),
        fullPath,
      },
    });
  } catch (error) {
    console.error("Error fetching extended subcategory:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Create extended subcategory
// @route   POST /api/extended-subcategories
// @access  Private
export const createExtendedSubcategory = async (req, res) => {
  try {
    const {
      name,
      description,
      brand,
      category,
      subcategory,
      parentExtendedSubcategory,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    if (!brand || !category || !subcategory) {
      return res.status(400).json({
        success: false,
        message: "Brand, category, and subcategory are required",
      });
    }

    // Validate brand, category, and subcategory exist
    const brandExists = await Brand.findById(brand);
    const categoryExists = await Category.findById(category);
    const subcategoryExists = await Subcategory.findById(subcategory);

    if (!brandExists || !categoryExists || !subcategoryExists) {
      return res.status(400).json({
        success: false,
        message: "Invalid brand, category, or subcategory",
      });
    }

    // Verify category belongs to brand
    if (categoryExists.brand.toString() !== brand) {
      return res.status(400).json({
        success: false,
        message: "Category does not belong to the specified brand",
      });
    }

    // Verify subcategory belongs to category and brand
    if (
      subcategoryExists.category.toString() !== category ||
      subcategoryExists.brand.toString() !== brand
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Subcategory does not belong to the specified category and brand",
      });
    }

    // Determine level and validate parent
    let level = 1;
    if (parentExtendedSubcategory) {
      const parentDoc = await ExtendedSubcategory.findById(
        parentExtendedSubcategory
      );
      if (!parentDoc) {
        return res.status(400).json({
          success: false,
          message: "Parent extended subcategory not found",
        });
      }

      if (parentDoc.level >= 5) {
        return res.status(400).json({
          success: false,
          message: "Maximum hierarchy depth reached (5 levels)",
        });
      }

      level = parentDoc.level + 1;

      // Verify parent belongs to same brand, category, and subcategory
      if (
        parentDoc.brand.toString() !== brand ||
        parentDoc.category.toString() !== category ||
        parentDoc.subcategory.toString() !== subcategory
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Parent must belong to the same brand, category, and subcategory",
        });
      }
    }

    // Check for duplicate names at the same level
    const existingItem = await ExtendedSubcategory.findOne({
      name: name.trim(),
      brand,
      category,
      subcategory,
      parentExtendedSubcategory: parentExtendedSubcategory || null,
    });

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message:
          "An extended subcategory with this name already exists at this level",
      });
    }

    const extendedSubcategory = new ExtendedSubcategory({
      name: name.trim(),
      description: description?.trim() || "",
      brand,
      category,
      subcategory,
      parentExtendedSubcategory: parentExtendedSubcategory || null,
      level,
      createdBy: req.user.id,
    });

    await extendedSubcategory.save();

    // Populate for response
    await extendedSubcategory.populate("brand", "name");
    await extendedSubcategory.populate("category", "name");
    await extendedSubcategory.populate("subcategory", "name");
    await extendedSubcategory.populate(
      "parentExtendedSubcategory",
      "name level"
    );

    const fullPath = await extendedSubcategory.getFullPath();

    res.status(201).json({
      success: true,
      message: "Extended subcategory created successfully",
      item: {
        ...extendedSubcategory.toObject(),
        fullPath,
        canHaveChildren: extendedSubcategory.level < 5,
      },
    });
  } catch (error) {
    console.error("Error creating extended subcategory:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Create extended subcategory under brand's category's subcategory (nested route)
// @route   POST /api/brands/:brandId/categories/:categoryId/subcategories/:subcategoryId/extended
// @access  Private
export const createExtendedUnderBrandCategorySubcategory = async (req, res) => {
  try {
    const { name, description, parentExtendedSubcategory } = req.body;
    const { brandId, categoryId, subcategoryId } = req.params;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    // Determine level and validate parent
    let level = 1;
    if (parentExtendedSubcategory) {
      const parentDoc = await ExtendedSubcategory.findById(
        parentExtendedSubcategory
      );
      if (!parentDoc) {
        return res.status(400).json({
          success: false,
          message: "Parent extended subcategory not found",
        });
      }

      if (parentDoc.level >= 5) {
        return res.status(400).json({
          success: false,
          message: "Maximum hierarchy depth reached (5 levels)",
        });
      }

      level = parentDoc.level + 1;

      // Verify parent belongs to same brand, category, and subcategory
      if (
        parentDoc.brand.toString() !== brandId ||
        parentDoc.category.toString() !== categoryId ||
        parentDoc.subcategory.toString() !== subcategoryId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Parent must belong to the same brand, category, and subcategory",
        });
      }
    }

    // Check for duplicate names at the same level
    const existingItem = await ExtendedSubcategory.findOne({
      name: name.trim(),
      brand: brandId,
      category: categoryId,
      subcategory: subcategoryId,
      parentExtendedSubcategory: parentExtendedSubcategory || null,
    });

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message:
          "An extended subcategory with this name already exists at this level",
      });
    }

    const extendedSubcategory = new ExtendedSubcategory({
      name: name.trim(),
      description: description?.trim() || "",
      brand: brandId,
      category: categoryId,
      subcategory: subcategoryId,
      parentExtendedSubcategory: parentExtendedSubcategory || null,
      level,
      createdBy: req.user.id,
    });

    await extendedSubcategory.save();

    // Populate for response
    await extendedSubcategory.populate("brand", "name");
    await extendedSubcategory.populate("category", "name");
    await extendedSubcategory.populate("subcategory", "name");
    await extendedSubcategory.populate(
      "parentExtendedSubcategory",
      "name level"
    );

    const fullPath = await extendedSubcategory.getFullPath();

    res.status(201).json({
      success: true,
      message: "Extended subcategory created successfully",
      item: {
        ...extendedSubcategory.toObject(),
        fullPath,
        canHaveChildren: extendedSubcategory.level < 5,
      },
    });
  } catch (error) {
    console.error(
      "Error creating extended subcategory under brand category subcategory:",
      error
    );
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update extended subcategory
// @route   PUT /api/extended-subcategories/:id
// @access  Private
export const updateExtendedSubcategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    const extendedSubcategory = await ExtendedSubcategory.findById(
      req.params.id
    );
    if (!extendedSubcategory) {
      return res.status(404).json({
        success: false,
        message: "Extended subcategory not found",
      });
    }

    // Check for duplicate names if name is being changed
    if (name && name !== extendedSubcategory.name) {
      const existingItem = await ExtendedSubcategory.findOne({
        name: name.trim(),
        brand: extendedSubcategory.brand,
        category: extendedSubcategory.category,
        subcategory: extendedSubcategory.subcategory,
        parentExtendedSubcategory:
          extendedSubcategory.parentExtendedSubcategory,
      });

      if (existingItem) {
        return res.status(400).json({
          success: false,
          message:
            "An extended subcategory with this name already exists at this level",
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (status !== undefined) updateData.status = status;

    const updatedItem = await ExtendedSubcategory.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("parentExtendedSubcategory", "name level");

    const fullPath = await updatedItem.getFullPath();

    res.json({
      success: true,
      message: "Extended subcategory updated successfully",
      item: {
        ...updatedItem.toObject(),
        fullPath,
      },
    });
  } catch (error) {
    console.error("Error updating extended subcategory:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete extended subcategory
// @route   DELETE /api/extended-subcategories/:id
// @access  Private
export const deleteExtendedSubcategory = async (req, res) => {
  try {
    const extendedSubcategory = await ExtendedSubcategory.findById(
      req.params.id
    );
    if (!extendedSubcategory) {
      return res.status(404).json({
        success: false,
        message: "Extended subcategory not found",
      });
    }

    // Check if it has children
    const childrenCount = await ExtendedSubcategory.countDocuments({
      parentExtendedSubcategory: req.params.id,
    });

    if (childrenCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete extended subcategory that has children",
      });
    }

    await ExtendedSubcategory.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Extended subcategory deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting extended subcategory:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get extended subcategory tree
// @route   GET /api/extended-subcategories/tree
// @access  Private
export const getExtendedSubcategoryTree = async (req, res) => {
  try {
    const { brand, category, subcategory, maxLevel = 5 } = req.query;

    if (!brand || !category || !subcategory) {
      return res.status(400).json({
        success: false,
        message: "Brand, category, and subcategory are required",
      });
    }

    // Get all extended subcategories for this brand, category, and subcategory
    const allItems = await ExtendedSubcategory.find({
      brand,
      category,
      subcategory,
      status: "active",
      level: { $lte: parseInt(maxLevel) },
    })
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .sort({ level: 1, name: 1 });

    // Build tree structure
    const buildTree = (parentId = null, level = 1) => {
      return allItems
        .filter(
          (item) =>
            (parentId === null && item.parentExtendedSubcategory === null) ||
            (item.parentExtendedSubcategory &&
              item.parentExtendedSubcategory.toString() === parentId)
        )
        .map((item) => ({
          ...item.toObject(),
          children: buildTree(item._id.toString(), level + 1),
        }));
    };

    const tree = buildTree();

    res.json({
      success: true,
      tree,
      totalItems: allItems.length,
    });
  } catch (error) {
    console.error("Error fetching extended subcategory tree:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get extended subcategories by subcategory
// @route   GET /api/extended-subcategories/by-subcategory/:subcategoryId
// @access  Private
export const getExtendedSubcategoriesBySubcategory = async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    const { page = 1, limit = 100 } = req.query;

    // Only return Level 1 items (items with no parent) for this subcategory
    const items = await ExtendedSubcategory.find({
      subcategory: subcategoryId,
      parentExtendedSubcategory: null, // Only Level 1 items
      status: "active",
    })
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("parentExtendedSubcategory", "name level")
      .populate("createdBy", "name email")
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ExtendedSubcategory.countDocuments({
      subcategory: subcategoryId,
      parentExtendedSubcategory: null, // Only Level 1 items
      status: "active",
    });

    res.json({
      success: true,
      items,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error(
      "Error fetching extended subcategories by subcategory:",
      error
    );
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get extended subcategories by parent
// @route   GET /api/extended-subcategories/by-parent/:parentId
// @access  Private
export const getExtendedSubcategoriesByParent = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { page = 1, limit = 100 } = req.query;

    const items = await ExtendedSubcategory.find({
      parentExtendedSubcategory: parentId,
      status: "active",
    })
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("parentExtendedSubcategory", "name level")
      .populate("createdBy", "name email")
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ExtendedSubcategory.countDocuments({
      parentExtendedSubcategory: parentId,
      status: "active",
    });

    // Add full parent chain for each item
    const itemsWithParentChain = await Promise.all(
      items.map(async (item) => {
        const parentChain = await getParentChain(item._id);
        return {
          ...item.toObject(),
          parentChain,
          fullPath: await item.getFullPath(),
        };
      })
    );

    res.json({
      success: true,
      items: itemsWithParentChain,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching extended subcategories by parent:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper function to get complete parent chain
const getParentChain = async (extendedSubcategoryId) => {
  const parentChain = [];
  let current = await ExtendedSubcategory.findById(extendedSubcategoryId);

  while (current && current.parentExtendedSubcategory) {
    current = await ExtendedSubcategory.findById(
      current.parentExtendedSubcategory
    );
    if (current) {
      parentChain.unshift(current._id.toString());
    }
  }

  return parentChain;
};

// @desc    Get extended subcategory with full parent chain
// @route   GET /api/extended-subcategories/:id/parent-chain
// @access  Private
export const getExtendedSubcategoryWithParentChain = async (req, res) => {
  try {
    const item = await ExtendedSubcategory.findById(req.params.id)
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("parentExtendedSubcategory", "name level")
      .populate("createdBy", "name email");

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Extended subcategory not found",
      });
    }

    const parentChain = await getParentChain(item._id);
    const fullPath = await item.getFullPath();

    res.json({
      success: true,
      item: {
        ...item.toObject(),
        parentChain,
        fullPath,
      },
    });
  } catch (error) {
    console.error(
      "Error fetching extended subcategory with parent chain:",
      error
    );
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Change extended subcategory's parent
// @route   PUT /api/extended-subcategories/:id/change-parent
// @access  Private
export const changeExtendedSubcategoryParent = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      newParentId, // Can be subcategoryId (for Level 1) or extendedSubcategoryId (for Level 2+)
      newBrandId,
      newCategoryId,
      newSubcategoryId,
      parentType, // 'subcategory' or 'extended'
    } = req.body;

    // Validate inputs
    if (!newBrandId || !newCategoryId || !newSubcategoryId || !parentType) {
      return res.status(400).json({
        success: false,
        message:
          "New brand, category, subcategory, and parent type are required",
      });
    }

    // Find the extended subcategory
    const extendedItem = await ExtendedSubcategory.findById(id);
    if (!extendedItem) {
      return res.status(404).json({
        success: false,
        message: "Extended subcategory not found",
      });
    }

    // Verify new brand, category, and subcategory exist
    const newBrand = await Brand.findById(newBrandId);
    if (!newBrand) {
      return res.status(404).json({
        success: false,
        message: "New brand not found",
      });
    }

    const newCategory = await Category.findById(newCategoryId);
    if (!newCategory) {
      return res.status(404).json({
        success: false,
        message: "New category not found",
      });
    }

    const newSubcategory = await Subcategory.findById(newSubcategoryId);
    if (!newSubcategory) {
      return res.status(404).json({
        success: false,
        message: "New subcategory not found",
      });
    }

    // Verify hierarchy integrity (brand-first)
    if (newCategory.brand.toString() !== newBrandId) {
      return res.status(400).json({
        success: false,
        message: "Selected category does not belong to the selected brand",
      });
    }

    if (
      newSubcategory.brand.toString() !== newBrandId ||
      newSubcategory.category.toString() !== newCategoryId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Selected subcategory does not belong to the selected brand and category",
      });
    }

    // Determine new parent and level
    let newParentExtendedId = null;
    let newLevel = 1;

    if (parentType === "extended") {
      // Moving under another extended subcategory
      if (!newParentId) {
        return res.status(400).json({
          success: false,
          message: "Parent extended subcategory ID is required",
        });
      }

      const newParentExtended = await ExtendedSubcategory.findById(newParentId);
      if (!

newParentExtended) {
        return res.status(404).json({
          success: false,
          message: "Parent extended subcategory not found",
        });
      }

      // Prevent circular reference
      if (newParentId === id) {
        return res.status(400).json({
          success: false,
          message: "Cannot set item as its own parent",
        });
      }

      // Check if new parent is a descendant of this item (would create circular reference)
      const isDescendant = await checkIfDescendant(id, newParentId);
      if (isDescendant) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot move item under its own descendant (circular reference)",
        });
      }

      // Verify parent belongs to same brand, category, subcategory
      if (
        newParentExtended.brand.toString() !== newBrandId ||
        newParentExtended.category.toString() !== newCategoryId ||
        newParentExtended.subcategory.toString() !== newSubcategoryId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Parent extended subcategory must belong to the same brand, category, and subcategory",
        });
      }

      // Check max depth (Level 5 is max)
      if (newParentExtended.level >= 5) {
        return res.status(400).json({
          success: false,
          message: "Cannot add children beyond Level 5 (maximum depth reached)",
        });
      }

      newParentExtendedId = newParentId;
      newLevel = newParentExtended.level + 1;
    } else {
      // Moving under subcategory (becomes Level 1)
      newParentExtendedId = null;
      newLevel = 1;
    }

    // Check for name conflict at new location
    const conflictQuery = {
      name: extendedItem.name,
      brand: newBrandId,
      category: newCategoryId,
      subcategory: newSubcategoryId,
      parentExtendedSubcategory: newParentExtendedId,
      _id: { $ne: id },
    };

    const existingItem = await ExtendedSubcategory.findOne(conflictQuery);
    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: `An extended subcategory with name "${extendedItem.name}" already exists at this location`,
      });
    }

    // Count affected items (all descendants)
    const descendantCount = await countAllDescendants(id);

    // Start transaction
    const session = await ExtendedSubcategory.startSession();
    session.startTransaction();

    try {
      console.log(`🔄 Changing extended subcategory parent: ${extendedItem.name}`);
      console.log(`   From: Level ${extendedItem.level} → To: Level ${newLevel}`);
      console.log(`   Affected descendants: ${descendantCount}`);

      // Update the extended subcategory
      await ExtendedSubcategory.findByIdAndUpdate(
        id,
        {
          brand: newBrandId,
          category: newCategoryId,
          subcategory: newSubcategoryId,
          parentExtendedSubcategory: newParentExtendedId,
          level: newLevel,
        },
        { session }
      );

      // Recursively update all descendants
      await updateExtendedDescendantsRecursively(
        id,
        newBrandId,
        newCategoryId,
        newSubcategoryId,
        newLevel,
        session
      );

      // Update all products using this extended subcategory
      const Product = (await import("../models/Product.js")).default;
      
      // Update products at each level
      const levelFieldMap = {
        1: "subcategory1",
        2: "subcategory2",
        3: "subcategory3",
        4: "subcategory4",
        5: "subcategory5",
      };

      const levelField = levelFieldMap[extendedItem.level];
      if (levelField) {
        await Product.updateMany(
          { [levelField]: id },
          {
            brand: newBrandId,
            category: newCategoryId,
            subcategory: newSubcategoryId,
          },
          { session }
        );
      }

      // Commit transaction
      await session.commitTransaction();

      console.log(`✅ Extended subcategory parent changed successfully`);

      // Fetch updated item with populated fields
      const updatedItem = await ExtendedSubcategory.findById(id)
        .populate("brand", "name")
        .populate("category", "name")
        .populate("subcategory", "name")
        .populate("parentExtendedSubcategory", "name level")
        .populate("createdBy", "name email");

      res.json({
        success: true,
        message: "Extended subcategory parent changed successfully",
        item: updatedItem,
        affectedItems: {
          descendants: descendantCount,
          total: descendantCount,
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
    console.error("Change extended subcategory parent error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to change extended subcategory parent",
    });
  }
};

// Helper function to check if targetId is a descendant of sourceId
async function checkIfDescendant(sourceId, targetId) {
  let current = await ExtendedSubcategory.findById(targetId);

  while (current && current.parentExtendedSubcategory) {
    if (current.parentExtendedSubcategory.toString() === sourceId) {
      return true; // targetId is a descendant of sourceId
    }
    current = await ExtendedSubcategory.findById(
      current.parentExtendedSubcategory
    );
  }

  return false;
}

// Helper function to count all descendants
async function countAllDescendants(parentId) {
  const directChildren = await ExtendedSubcategory.find({
    parentExtendedSubcategory: parentId,
  });

  let count = directChildren.length;

  for (const child of directChildren) {
    count += await countAllDescendants(child._id);
  }

  return count;
}

// Helper function to recursively update descendants
async function updateExtendedDescendantsRecursively(
  parentId,
  newBrandId,
  newCategoryId,
  newSubcategoryId,
  parentLevel,
  session
) {
  // Find all direct children
  const children = await ExtendedSubcategory.find({
    parentExtendedSubcategory: parentId,
  }).session(session);

  for (const child of children) {
    const newChildLevel = parentLevel + 1;

    // Update this child
    await ExtendedSubcategory.findByIdAndUpdate(
      child._id,
      {
        brand: newBrandId,
        category: newCategoryId,
        subcategory: newSubcategoryId,
        level: newChildLevel,
      },
      { session }
    );

    // Recursively update its children
    await updateExtendedDescendantsRecursively(
      child._id,
      newBrandId,
      newCategoryId,
      newSubcategoryId,
      newChildLevel,
      session
    );
  }
}

// @desc    Get preview of parent change impact
// @route   GET /api/extended-subcategories/:id/change-parent-preview
// @access  Private
export const getExtendedSubcategoryParentChangePreview = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      newParentId,
      newBrandId,
      newCategoryId,
      newSubcategoryId,
      parentType,
    } = req.query;

    if (!newBrandId || !newCategoryId || !newSubcategoryId || !parentType) {
      return res.status(400).json({
        success: false,
        message:
          "New brand, category, subcategory, and parent type are required",
      });
    }

    // Find the extended subcategory
    const extendedItem = await ExtendedSubcategory.findById(id)
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("parentExtendedSubcategory", "name level");

    if (!extendedItem) {
      return res.status(404).json({
        success: false,
        message: "Extended subcategory not found",
      });
    }

    // Verify new hierarchy exists
    const newBrand = await Brand.findById(newBrandId);
    const newCategory = await Category.findById(newCategoryId);
    const newSubcategory = await Subcategory.findById(newSubcategoryId);

    if (!newBrand || !newCategory || !newSubcategory) {
      return res.status(404).json({
        success: false,
        message: "New brand, category, or subcategory not found",
      });
    }

    // Check hierarchy integrity
    let hasConflict = false;
    let conflictMessage = null;

    if (newCategory.brand.toString() !== newBrandId) {
      hasConflict = true;
      conflictMessage = "Selected category does not belong to the selected brand";
    } else if (
      newSubcategory.brand.toString() !== newBrandId ||
      newSubcategory.category.toString() !== newCategoryId
    ) {
      hasConflict = true;
      conflictMessage =
        "Selected subcategory does not belong to the selected brand and category";
    }

    // Determine new parent and level
    let newParentExtended = null;
    let newLevel = 1;

    if (parentType === "extended" && newParentId) {
      newParentExtended = await ExtendedSubcategory.findById(newParentId)
        .populate("brand", "name")
        .populate("category", "name")
        .populate("subcategory", "name");

      if (!newParentExtended) {
        hasConflict = true;
        conflictMessage = "Parent extended subcategory not found";
      } else {
        newLevel = newParentExtended.level + 1;

        // Check circular reference
        if (newParentId === id) {
          hasConflict = true;
          conflictMessage = "Cannot set item as its own parent";
        } else {
          const isDescendant = await checkIfDescendant(id, newParentId);
          if (isDescendant) {
            hasConflict = true;
            conflictMessage =
              "Cannot move item under its own descendant (circular reference)";
          }
        }

        // Check max depth
        if (newParentExtended.level >= 5) {
          hasConflict = true;
          conflictMessage =
            "Cannot add children beyond Level 5 (maximum depth reached)";
        }
      }
    }

    // Check name conflict
    if (!hasConflict) {
      const conflictQuery = {
        name: extendedItem.name,
        brand: newBrandId,
        category: newCategoryId,
        subcategory: newSubcategoryId,
        parentExtendedSubcategory: newParentExtended ? newParentExtended._id : null,
        _id: { $ne: id },
      };

      const existingItem = await ExtendedSubcategory.findOne(conflictQuery);
      if (existingItem) {
        hasConflict = true;
        conflictMessage = `An extended subcategory with name "${extendedItem.name}" already exists at this location`;
      }
    }

    // Count affected items
    const descendantCount = await countAllDescendants(id);

    const Product = (await import("../models/Product.js")).default;
    const levelFieldMap = {
      1: "subcategory1",
      2: "subcategory2",
      3: "subcategory3",
      4: "subcategory4",
      5: "subcategory5",
    };
    const levelField = levelFieldMap[extendedItem.level];
    const productCount = levelField
      ? await Product.countDocuments({ [levelField]: id })
      : 0;

    res.json({
      success: true,
      preview: {
        currentParent: {
          brand: {
            id: extendedItem.brand._id,
            name: extendedItem.brand.name,
          },
          category: {
            id: extendedItem.category._id,
            name: extendedItem.category.name,
          },
          subcategory: {
            id: extendedItem.subcategory._id,
            name: extendedItem.subcategory.name,
          },
          parentExtended: extendedItem.parentExtendedSubcategory
            ? {
                id: extendedItem.parentExtendedSubcategory._id,
                name: extendedItem.parentExtendedSubcategory.name,
                level: extendedItem.parentExtendedSubcategory.level,
              }
            : null,
          level: extendedItem.level,
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
          subcategory: {
            id: newSubcategory._id,
            name: newSubcategory.name,
          },
          parentExtended: newParentExtended
            ? {
                id: newParentExtended._id,
                name: newParentExtended.name,
                level: newParentExtended.level,
              }
            : null,
          level: newLevel,
        },
        hasConflict,
        conflictMessage,
        affectedItems: {
          descendants: descendantCount,
          products: productCount,
          total: descendantCount + productCount,
        },
      },
    });
  } catch (error) {
    console.error("Get extended subcategory parent change preview error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get preview",
    });
  }
};
