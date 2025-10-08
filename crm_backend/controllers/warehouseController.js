import Warehouse from "../models/Warehouse.js";
import Region from "../models/Region.js";

// @desc    Get all warehouses
// @route   GET /api/warehouses
// @access  Private
export const getWarehouses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      region,
      city,
      state,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    // Build filter object
    const filter = { isActive: true };
    
    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { "address.city": { $regex: search, $options: "i" } },
        { "contact.managerName": { $regex: search, $options: "i" } }
      ];
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    if (region) {
      filter.region = region;
    }

    if (city) {
      filter["address.city"] = { $regex: city, $options: "i" };
    }

    if (state) {
      filter["address.state"] = { $regex: state, $options: "i" };
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Execute query with pagination
    const warehouses = await Warehouse.find(filter)
      .populate("region", "name code")
      .populate("createdBy", "name email")
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Get total count for pagination
    const total = await Warehouse.countDocuments(filter);

    res.json({
      success: true,
      data: warehouses,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        totalRecords: total
      }
    });
  } catch (error) {
    console.error("Get warehouses error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching warehouses",
      error: error.message
    });
  }
};

// @desc    Get single warehouse
// @route   GET /api/warehouses/:id
// @access  Private
export const getWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id)
      .populate("region", "name code")
      .populate("createdBy", "name email");

    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: "Warehouse not found"
      });
    }

    if (!warehouse.isActive) {
      return res.status(404).json({
        success: false,
        message: "Warehouse has been deleted"
      });
    }

    res.json({
      success: true,
      data: warehouse
    });
  } catch (error) {
    console.error("Get warehouse error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching warehouse",
      error: error.message
    });
  }
};

// @desc    Create new warehouse
// @route   POST /api/warehouses
// @access  Private
export const createWarehouse = async (req, res) => {
  try {
    const {
      code,
      name,
      region,
      status,
      managerName,
      phone,
      email,
      street,
      city,
      state,
      pincode,
      country
    } = req.body;

    console.log("Received warehouse data:", req.body);

    // Check if warehouse code already exists
    const existingWarehouse = await Warehouse.findOne({ code });
    if (existingWarehouse) {
      return res.status(400).json({
        success: false,
        message: "Warehouse code already exists"
      });
    }

    // Check if region exists
    const regionExists = await Region.findById(region);
    if (!regionExists) {
      return res.status(400).json({
        success: false,
        message: "Region not found"
      });
    }

    // Build the warehouse object with nested structures
    const warehouseData = {
      code: code.toUpperCase(),
      name,
      region,
      status: status || "active",
      contact: {
        managerName,
        phone: phone || "",
        email: email || ""
      },
      address: {
        street,
        city,
        state,
        pincode,
        country: country || "India"
      },
      capacity: {
        totalArea: 0,
        usedArea: 0,
        unit: "sq.ft"
      },
      facilities: [],
      createdBy: req.user._id
    };

    const warehouse = new Warehouse(warehouseData);
    const savedWarehouse = await warehouse.save();
    
    // Populate the saved warehouse
    await savedWarehouse.populate("region", "name code");
    await savedWarehouse.populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Warehouse created successfully",
      data: savedWarehouse
    });
  } catch (error) {
    console.error("Create warehouse error:", error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: errors.join(', ')
      });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Warehouse code already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating warehouse",
      error: error.message
    });
  }
};

// @desc    Update warehouse
// @route   PUT /api/warehouses/:id
// @access  Private
export const updateWarehouse = async (req, res) => {
  try {
    const {
      name,
      region,
      status,
      managerName,
      phone,
      email,
      street,
      city,
      state,
      pincode,
      country
    } = req.body;

    console.log("Update warehouse data:", req.body);

    const warehouse = await Warehouse.findById(req.params.id);

    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: "Warehouse not found"
      });
    }

    if (!warehouse.isActive) {
      return res.status(404).json({
        success: false,
        message: "Warehouse has been deleted"
      });
    }

    // Check if region exists (if being updated)
    if (region) {
      const regionExists = await Region.findById(region);
      if (!regionExists) {
        return res.status(400).json({
          success: false,
          message: "Region not found"
        });
      }
      warehouse.region = region;
    }

    // Update fields
    if (name) warehouse.name = name;
    if (status) warehouse.status = status;

    // Update contact fields
    if (managerName) warehouse.contact.managerName = managerName;
    if (phone !== undefined) warehouse.contact.phone = phone;
    if (email !== undefined) warehouse.contact.email = email;

    // Update address fields
    if (street) warehouse.address.street = street;
    if (city) warehouse.address.city = city;
    if (state) warehouse.address.state = state;
    if (pincode) warehouse.address.pincode = pincode;
    if (country) warehouse.address.country = country;

    const updatedWarehouse = await warehouse.save();
    await updatedWarehouse.populate("region", "name code");
    await updatedWarehouse.populate("createdBy", "name email");

    res.json({
      success: true,
      message: "Warehouse updated successfully",
      data: updatedWarehouse
    });
  } catch (error) {
    console.error("Update warehouse error:", error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: errors.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating warehouse",
      error: error.message
    });
  }
};

// @desc    Delete warehouse (soft delete)
// @route   DELETE /api/warehouses/:id
// @access  Private
export const deleteWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);

    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: "Warehouse not found"
      });
    }

    // Soft delete
    warehouse.isActive = false;
    await warehouse.save();

    res.json({
      success: true,
      message: "Warehouse deleted successfully"
    });
  } catch (error) {
    console.error("Delete warehouse error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting warehouse",
      error: error.message
    });
  }
};

// @desc    Get warehouse stats
// @route   GET /api/warehouses/stats/summary
// @access  Private
export const getWarehouseStats = async (req, res) => {
  try {
    const totalWarehouses = await Warehouse.countDocuments({ isActive: true });
    
    const statusStats = await Warehouse.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    const capacityStats = await Warehouse.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalCapacity: { $sum: "$capacity.totalArea" },
          totalUsed: { $sum: "$capacity.usedArea" },
          avgUtilization: { $avg: { $divide: ["$capacity.usedArea", "$capacity.totalArea"] } }
        }
      }
    ]);

    const regionStats = await Warehouse.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$region", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Populate region names
    const populatedRegionStats = await Region.populate(regionStats, {
      path: "_id",
      select: "name code"
    });

    res.json({
      success: true,
      data: {
        total: totalWarehouses,
        byStatus: statusStats,
        capacity: capacityStats[0] || { totalCapacity: 0, totalUsed: 0, avgUtilization: 0 },
        byRegion: populatedRegionStats
      }
    });
  } catch (error) {
    console.error("Get warehouse stats error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching warehouse statistics",
      error: error.message
    });
  }
};

// @desc    Get warehouses by region
// @route   GET /api/warehouses/region/:regionId
// @access  Private
export const getWarehousesByRegion = async (req, res) => {
  try {
    const warehouses = await Warehouse.find({
      region: req.params.regionId,
      isActive: true
    })
      .populate("region", "name code")
      .sort({ name: 1 });

    res.json({
      success: true,
      data: warehouses
    });
  } catch (error) {
    console.error("Get warehouses by region error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching warehouses by region",
      error: error.message
    });
  }
};