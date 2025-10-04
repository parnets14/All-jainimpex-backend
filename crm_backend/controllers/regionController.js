import Region from '../models/Region.js';

// @desc    Get all regions with pagination
// @route   GET /api/regions
// @access  Private
export const getRegions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};

    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: sortConfig,
      populate: {
        path: 'createdBy',
        select: 'name email'
      }
    };

    const regions = await Region.find(filter)
      .populate('createdBy', 'name email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort(sortConfig);

    const total = await Region.countDocuments(filter);

    res.json({
      success: true,
      regions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Get regions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching regions'
    });
  }
};

// @desc    Get single region
// @route   GET /api/regions/:id
// @access  Private
export const getRegion = async (req, res) => {
  try {
    const region = await Region.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!region) {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }

    res.json({
      success: true,
      region
    });
  } catch (error) {
    console.error('Get region error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while fetching region'
    });
  }
};

// @desc    Create region
// @route   POST /api/regions
// @access  Private
export const createRegion = async (req, res) => {
  try {
    const { name, description, code, status } = req.body;

    // Check if region name already exists
    const existingRegion = await Region.findOne({ name });
    if (existingRegion) {
      return res.status(400).json({
        success: false,
        message: 'Region name already exists'
      });
    }

    // Check if region code already exists
    if (code) {
      const existingCode = await Region.findOne({ code });
      if (existingCode) {
        return res.status(400).json({
          success: false,
          message: 'Region code already exists'
        });
      }
    }

    const region = new Region({
      name,
      description,
      code,
      status,
      createdBy: req.user._id
    });

    await region.save();

    // Populate the saved region
    await region.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Region created successfully',
      region
    });
  } catch (error) {
    console.error('Create region error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while creating region'
    });
  }
};

// @desc    Update region
// @route   PUT /api/regions/:id
// @access  Private
export const updateRegion = async (req, res) => {
  try {
    const { name, description, code, status } = req.body;

    let region = await Region.findById(req.params.id);

    if (!region) {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }

    // Check if region name already exists (excluding current region)
    if (name && name !== region.name) {
      const existingRegion = await Region.findOne({ name });
      if (existingRegion) {
        return res.status(400).json({
          success: false,
          message: 'Region name already exists'
        });
      }
    }

    // Check if region code already exists (excluding current region)
    if (code && code !== region.code) {
      const existingCode = await Region.findOne({ code });
      if (existingCode) {
        return res.status(400).json({
          success: false,
          message: 'Region code already exists'
        });
      }
    }

    // Update region
    region = await Region.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        code,
        status
      },
      {
        new: true,
        runValidators: true
      }
    ).populate('createdBy', 'name email');

    res.json({
      success: true,
      message: 'Region updated successfully',
      region
    });
  } catch (error) {
    console.error('Update region error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while updating region'
    });
  }
};

// @desc    Delete region
// @route   DELETE /api/regions/:id
// @access  Private
export const deleteRegion = async (req, res) => {
  try {
    const region = await Region.findById(req.params.id);

    if (!region) {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }

    // Check if region is being used (you can add checks here if regions are linked to other models)
    // For example: const usersCount = await User.countDocuments({ region: req.params.id });
    // if (usersCount > 0) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Cannot delete region. It is being used by users.'
    //   });
    // }

    await Region.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Region deleted successfully'
    });
  } catch (error) {
    console.error('Delete region error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while deleting region'
    });
  }
};

// @desc    Get region statistics
// @route   GET /api/regions/stats
// @access  Private
export const getRegionStats = async (req, res) => {
  try {
    const totalRegions = await Region.countDocuments();
    const activeRegions = await Region.countDocuments({ status: 'active' });
    const inactiveRegions = await Region.countDocuments({ status: 'inactive' });

    // Regions created in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRegions = await Region.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.json({
      success: true,
      stats: {
        totalRegions,
        activeRegions,
        inactiveRegions,
        recentRegions
      }
    });
  } catch (error) {
    console.error('Get region stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching region statistics'
    });
  }
};