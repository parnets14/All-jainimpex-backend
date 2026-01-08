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
    const { search, status, category, subcategory, extendedSubcategory, level, subcategory1, subcategory2, subcategory3, subcategory4, subcategory5 } = req.query;

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
    
    // Check if any extended subcategory parameters are provided
    const hasExtendedParams = subcategory1 || subcategory2 || subcategory3 || subcategory4 || subcategory5;
    
    if (hasExtendedParams) {
      // Handle extended subcategory filtering - Method 1: Direct subcategory level parameters
      if (subcategory1) filter.subcategory1 = subcategory1;
      if (subcategory2) filter.subcategory2 = subcategory2;
      if (subcategory3) filter.subcategory3 = subcategory3;
      if (subcategory4) filter.subcategory4 = subcategory4;
      if (subcategory5) filter.subcategory5 = subcategory5;
    } else if (extendedSubcategory && level) {
      // Handle extended subcategory filtering - Method 2: Single extendedSubcategory with level
      const levelNum = parseInt(level);
      if (levelNum >= 1 && levelNum <= 5) {
        // For proper filtering, we need to ensure all parent levels are also set
        // This requires getting the extended subcategory details first
        const ExtendedSubcategory = (await import('../models/ExtendedSubcategory.js')).default;
        const extendedItem = await ExtendedSubcategory.findById(extendedSubcategory)
          .populate('parentExtendedSubcategory');
        
        if (extendedItem) {
          // Build the complete hierarchy path for filtering
          const hierarchyPath = [];
          let current = extendedItem;
          
          // Traverse up to build the complete path
          while (current) {
            hierarchyPath.unshift({
              id: current._id,
              level: current.level
            });
            
            if (current.parentExtendedSubcategory) {
              current = await ExtendedSubcategory.findById(current.parentExtendedSubcategory);
            } else {
              current = null;
            }
          }
          
          // Apply all levels in the hierarchy for proper filtering
          hierarchyPath.forEach(item => {
            filter[`subcategory${item.level}`] = item.id;
          });
        }
      }
    } else if (category && subcategory) {
      // No extended subcategories selected - only show brands directly under subcategory
      // This means all subcategory1-5 fields should be null/undefined
      filter.subcategory1 = null;
      filter.subcategory2 = null;
      filter.subcategory3 = null;
      filter.subcategory4 = null;
      filter.subcategory5 = null;
    }
    
    if (search) {
      filter.$text = { $search: search };
    }

    console.log('🔍 Brand filter query:', filter);

    const brands = await Brand.find(filter)
      .populate('createdBy', 'name email')
      .populate('subcategory', 'name')
      .populate('category', 'name')
      .populate('subcategory1', 'name')
      .populate('subcategory2', 'name')
      .populate('subcategory3', 'name')
      .populate('subcategory4', 'name')
      .populate('subcategory5', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Brand.countDocuments(filter);

    console.log(`✅ Found ${brands.length} brands matching filter`);

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
    const { name, description, category, subcategory, extendedSubcategory, level } = req.body;

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

    const brandData = {
      name,
      description,
      category,
      subcategory,
      createdBy: req.user._id
    };

    // Handle extended subcategory assignment based on level
    if (extendedSubcategory && level) {
      const ExtendedSubcategory = (await import('../models/ExtendedSubcategory.js')).default;
      const extendedItem = await ExtendedSubcategory.findById(extendedSubcategory);
      
      if (extendedItem) {
        // Build the complete hierarchy path
        const hierarchyPath = [];
        let current = extendedItem;
        
        // Traverse up to build the complete path
        while (current) {
          hierarchyPath.unshift({
            id: current._id,
            level: current.level
          });
          
          if (current.parentExtendedSubcategory) {
            current = await ExtendedSubcategory.findById(current.parentExtendedSubcategory)
              .populate('parentExtendedSubcategory');
          } else {
            current = null;
          }
        }
        
        // Apply all levels in the hierarchy
        hierarchyPath.forEach(item => {
          if (item.level >= 1 && item.level <= 5) {
            brandData[`subcategory${item.level}`] = item.id;
          }
        });
        
        console.log('🏗️ Brand hierarchy path:', hierarchyPath);
        console.log('🏗️ Brand data with hierarchy:', brandData);
      }
    }

    const brand = await Brand.create(brandData);

    await brand.populate('createdBy', 'name email');
    await brand.populate('subcategory', 'name');
    await brand.populate('category', 'name');
    await brand.populate('subcategory1', 'name');
    await brand.populate('subcategory2', 'name');
    await brand.populate('subcategory3', 'name');
    await brand.populate('subcategory4', 'name');
    await brand.populate('subcategory5', 'name');

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