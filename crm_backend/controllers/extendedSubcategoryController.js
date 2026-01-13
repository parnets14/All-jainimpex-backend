import ExtendedSubcategory from '../models/ExtendedSubcategory.js';
import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';
import { getPaginationParams, createPaginationResponse } from '../utils/pagination.js';

// @desc    Get extended subcategories by level and parent
// @route   GET /api/extended-subcategories
// @access  Private
export const getExtendedSubcategories = async (req, res) => {
  try {
    const { level, parent, category, subcategory, search } = req.query;
    const { page, limit, skip } = getPaginationParams(req);
    
    const query = {
      status: 'active'
    };

    // Filter by category and subcategory (required)
    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;
    
    // Filter by level
    if (level) query.level = parseInt(level);
    
    // Filter by parent
    if (parent) {
      query.parentExtendedSubcategory = parent;
    } else if (level === '1') {
      query.parentExtendedSubcategory = null;
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const items = await ExtendedSubcategory.find(query)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level')
      .populate('createdBy', 'name email')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit);

    const total = await ExtendedSubcategory.countDocuments(query);

    // Add children count for each item
    const itemsWithCounts = await Promise.all(
      items.map(async (item) => {
        const childrenCount = await ExtendedSubcategory.countDocuments({
          parentExtendedSubcategory: item._id,
          status: 'active'
        });

        return {
          ...item.toObject(),
          childrenCount,
          canHaveChildren: item.level < 5, // Max 5 levels
          fullPath: await item.getFullPath()
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
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Error fetching extended subcategories:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single extended subcategory
// @route   GET /api/extended-subcategories/:id
// @access  Private
export const getExtendedSubcategory = async (req, res) => {
  try {
    const item = await ExtendedSubcategory.findById(req.params.id)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level')
      .populate('createdBy', 'name email');

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Extended subcategory not found'
      });
    }

    const fullPath = await item.getFullPath();

    res.json({
      success: true,
      item: {
        ...item.toObject(),
        fullPath
      }
    });
  } catch (error) {
    console.error('Error fetching extended subcategory:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create extended subcategory
// @route   POST /api/extended-subcategories
// @access  Private
export const createExtendedSubcategory = async (req, res) => {
  try {
    const { name, description, category, subcategory, parentExtendedSubcategory } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }

    if (!category || !subcategory) {
      return res.status(400).json({
        success: false,
        message: 'Category and subcategory are required'
      });
    }

    // Validate category and subcategory exist
    const categoryExists = await Category.findById(category);
    const subcategoryExists = await Subcategory.findById(subcategory);

    if (!categoryExists || !subcategoryExists) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category or subcategory'
      });
    }

    // Determine level and validate parent
    let level = 1;
    if (parentExtendedSubcategory) {
      const parentDoc = await ExtendedSubcategory.findById(parentExtendedSubcategory);
      if (!parentDoc) {
        return res.status(400).json({
          success: false,
          message: 'Parent extended subcategory not found'
        });
      }

      if (parentDoc.level >= 5) {
        return res.status(400).json({
          success: false,
          message: 'Maximum hierarchy depth reached (5 levels)'
        });
      }

      level = parentDoc.level + 1;

      // Verify parent belongs to same category and subcategory
      if (parentDoc.category.toString() !== category || parentDoc.subcategory.toString() !== subcategory) {
        return res.status(400).json({
          success: false,
          message: 'Parent must belong to the same category and subcategory'
        });
      }
    }

    // Check for duplicate names at the same level
    const existingItem = await ExtendedSubcategory.findOne({
      name: name.trim(),
      category,
      subcategory,
      parentExtendedSubcategory: parentExtendedSubcategory || null
    });

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'An extended subcategory with this name already exists at this level'
      });
    }

    const extendedSubcategory = new ExtendedSubcategory({
      name: name.trim(),
      description: description?.trim() || '',
      category,
      subcategory,
      parentExtendedSubcategory: parentExtendedSubcategory || null,
      level,
      createdBy: req.user.id
    });

    await extendedSubcategory.save();

    // Populate for response
    await extendedSubcategory.populate('category', 'name');
    await extendedSubcategory.populate('subcategory', 'name');
    await extendedSubcategory.populate('parentExtendedSubcategory', 'name level');

    const fullPath = await extendedSubcategory.getFullPath();

    res.status(201).json({
      success: true,
      message: 'Extended subcategory created successfully',
      item: {
        ...extendedSubcategory.toObject(),
        fullPath,
        canHaveChildren: extendedSubcategory.level < 5
      }
    });
  } catch (error) {
    console.error('Error creating extended subcategory:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update extended subcategory
// @route   PUT /api/extended-subcategories/:id
// @access  Private
export const updateExtendedSubcategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    const extendedSubcategory = await ExtendedSubcategory.findById(req.params.id);
    if (!extendedSubcategory) {
      return res.status(404).json({
        success: false,
        message: 'Extended subcategory not found'
      });
    }

    // Check for duplicate names if name is being changed
    if (name && name !== extendedSubcategory.name) {
      const existingItem = await ExtendedSubcategory.findOne({
        name: name.trim(),
        category: extendedSubcategory.category,
        subcategory: extendedSubcategory.subcategory,
        parentExtendedSubcategory: extendedSubcategory.parentExtendedSubcategory
      });

      if (existingItem) {
        return res.status(400).json({
          success: false,
          message: 'An extended subcategory with this name already exists at this level'
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
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .populate('parentExtendedSubcategory', 'name level');

    const fullPath = await updatedItem.getFullPath();

    res.json({
      success: true,
      message: 'Extended subcategory updated successfully',
      item: {
        ...updatedItem.toObject(),
        fullPath
      }
    });
  } catch (error) {
    console.error('Error updating extended subcategory:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete extended subcategory
// @route   DELETE /api/extended-subcategories/:id
// @access  Private
export const deleteExtendedSubcategory = async (req, res) => {
  try {
    const extendedSubcategory = await ExtendedSubcategory.findById(req.params.id);
    if (!extendedSubcategory) {
      return res.status(404).json({
        success: false,
        message: 'Extended subcategory not found'
      });
    }

    // Check if it has children
    const childrenCount = await ExtendedSubcategory.countDocuments({
      parentExtendedSubcategory: req.params.id
    });

    if (childrenCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete extended subcategory that has children'
      });
    }

    await ExtendedSubcategory.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Extended subcategory deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting extended subcategory:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get extended subcategory tree
// @route   GET /api/extended-subcategories/tree
// @access  Private
export const getExtendedSubcategoryTree = async (req, res) => {
  try {
    const { category, subcategory, maxLevel = 5 } = req.query;

    if (!category || !subcategory) {
      return res.status(400).json({
        success: false,
        message: 'Category and subcategory are required'
      });
    }

    // Get all extended subcategories for this category and subcategory
    const allItems = await ExtendedSubcategory.find({
      category,
      subcategory,
      status: 'active',
      level: { $lte: parseInt(maxLevel) }
    })
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .sort({ level: 1, name: 1 });

    // Build tree structure
    const buildTree = (parentId = null, level = 1) => {
      return allItems
        .filter(item => 
          (parentId === null && item.parentExtendedSubcategory === null) ||
          (item.parentExtendedSubcategory && item.parentExtendedSubcategory.toString() === parentId)
        )
        .map(item => ({
          ...item.toObject(),
          children: buildTree(item._id.toString(), level + 1)
        }));
    };

    const tree = buildTree();

    res.json({
      success: true,
      tree,
      totalItems: allItems.length
    });
  } catch (error) {
    console.error('Error fetching extended subcategory tree:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get extended subcategories by subcategory
// @route   GET /api/extended-subcategories/by-subcategory/:subcategoryId
// @access  Private
export const getExtendedSubcategoriesBySubcategory = async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const items = await ExtendedSubcategory.find({
      subcategory: subcategoryId,
      status: 'active'
    })
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .populate('parentExtendedSubcategory', 'name level')
    .populate('createdBy', 'name email')
    .sort({ level: 1, name: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await ExtendedSubcategory.countDocuments({
      subcategory: subcategoryId,
      status: 'active'
    });

    res.json({
      success: true,
      items,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching extended subcategories by subcategory:', error);
    res.status(500).json({
      success: false,
      message: error.message
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
      status: 'active'
    })
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .populate('parentExtendedSubcategory', 'name level')
    .populate('createdBy', 'name email')
    .sort({ name: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await ExtendedSubcategory.countDocuments({
      parentExtendedSubcategory: parentId,
      status: 'active'
    });

    // Add full parent chain for each item
    const itemsWithParentChain = await Promise.all(
      items.map(async (item) => {
        const parentChain = await getParentChain(item._id);
        return {
          ...item.toObject(),
          parentChain,
          fullPath: await item.getFullPath()
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
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching extended subcategories by parent:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper function to get complete parent chain
const getParentChain = async (extendedSubcategoryId) => {
  const parentChain = [];
  let current = await ExtendedSubcategory.findById(extendedSubcategoryId);
  
  while (current && current.parentExtendedSubcategory) {
    current = await ExtendedSubcategory.findById(current.parentExtendedSubcategory);
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
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level')
      .populate('createdBy', 'name email');

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Extended subcategory not found'
      });
    }

    const parentChain = await getParentChain(item._id);
    const fullPath = await item.getFullPath();

    res.json({
      success: true,
      item: {
        ...item.toObject(),
        parentChain,
        fullPath
      }
    });
  } catch (error) {
    console.error('Error fetching extended subcategory with parent chain:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};