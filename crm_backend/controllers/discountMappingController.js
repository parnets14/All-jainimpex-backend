import DiscountMapping from "../models/DiscountMapping.js";
import Brand from "../models/Brand.js";
import Category from "../models/Category.js";
import Subcategory from "../models/Subcategory.js";

// @desc    Get all discount mappings with pagination and filtering
// @route   GET /api/discount-mappings
// @access  Private
export const getDiscountMappings = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      mappingType,
      status,
      brand,
      category,
      subcategory,
      search,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    // Build filter object
    const filter = {};

    if (mappingType) {
      filter.mappingType = mappingType;
    }

    if (status) {
      filter.status = status;
    }

    if (brand) {
      filter.brand = brand;
    }

    if (category) {
      filter.category = category;
    }

    if (subcategory) {
      filter.subcategory = subcategory;
    }

    if (search) {
      filter.$or = [
        { remarks: { $regex: search, $options: "i" } }
      ];
    }

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Execute query with pagination
    const discountMappings = await DiscountMapping.find(filter)
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get total count for pagination
    const total = await DiscountMapping.countDocuments(filter);

    res.json({
      success: true,
      discountMappings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get discount mappings error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching discount mappings"
    });
  }
};

// @desc    Get single discount mapping
// @route   GET /api/discount-mappings/:id
// @access  Private
export const getDiscountMapping = async (req, res) => {
  try {
    const discountMapping = await DiscountMapping.findById(req.params.id)
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    if (!discountMapping) {
      return res.status(404).json({
        success: false,
        message: "Discount mapping not found"
      });
    }

    res.json({
      success: true,
      discountMapping
    });
  } catch (error) {
    console.error("Get discount mapping error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching discount mapping"
    });
  }
};

// @desc    Create new discount mapping
// @route   POST /api/discount-mappings
// @access  Private
export const createDiscountMapping = async (req, res) => {
  try {
    const {
      mappingType,
      brand,
      category,
      subcategory,
      levels,
      validFrom,
      validTo,
      remarks
    } = req.body;

    // Check if brand, category, and subcategory exist
    const [brandExists, categoryExists, subcategoryExists] = await Promise.all([
      Brand.findById(brand),
      Category.findById(category),
      Subcategory.findById(subcategory)
    ]);

    if (!brandExists || !categoryExists || !subcategoryExists) {
      return res.status(400).json({
        success: false,
        message: "Invalid brand, category, or subcategory"
      });
    }

    // Check for duplicate active mapping
    const existingMapping = await DiscountMapping.findOne({
      mappingType,
      brand,
      category,
      subcategory,
      status: { $in: ["Pending Approval", "Approved"] }
    });

    if (existingMapping) {
      return res.status(400).json({
        success: false,
        message: "An active discount mapping already exists for this combination"
      });
    }

    const discountMapping = new DiscountMapping({
      mappingType,
      brand,
      category,
      subcategory,
      levels,
      validFrom: validFrom || new Date(),
      validTo,
      remarks,
      createdBy: req.user._id
    });

    await discountMapping.save();

    // Populate the saved document
    await discountMapping.populate("brand", "name");
    await discountMapping.populate("category", "name");
    await discountMapping.populate("subcategory", "name");
    await discountMapping.populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Discount mapping created successfully",
      discountMapping
    });
  } catch (error) {
    console.error("Create discount mapping error:", error);
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", ")
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while creating discount mapping"
    });
  }
};

// @desc    Update discount mapping
// @route   PUT /api/discount-mappings/:id
// @access  Private
export const updateDiscountMapping = async (req, res) => {
  try {
    const {
      brand,
      category,
      subcategory,
      levels,
      validFrom,
      validTo,
      remarks
    } = req.body;

    let discountMapping = await DiscountMapping.findById(req.params.id);

    if (!discountMapping) {
      return res.status(404).json({
        success: false,
        message: "Discount mapping not found"
      });
    }

    // Only allow updates for pending approval mappings
    if (discountMapping.status !== "Pending Approval") {
      return res.status(400).json({
        success: false,
        message: "Only pending approval mappings can be updated"
      });
    }

    // Check if user is the creator or admin
    if (discountMapping.createdBy.toString() !== req.user._id.toString() && 
        !["super_admin", "admin"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this mapping"
      });
    }

    // Update fields
    if (brand) discountMapping.brand = brand;
    if (category) discountMapping.category = category;
    if (subcategory) discountMapping.subcategory = subcategory;
    if (levels) discountMapping.levels = levels;
    if (validFrom) discountMapping.validFrom = validFrom;
    if (validTo) discountMapping.validTo = validTo;
    if (remarks !== undefined) discountMapping.remarks = remarks;

    await discountMapping.save();

    // Populate the updated document
    await discountMapping.populate("brand", "name");
    await discountMapping.populate("category", "name");
    await discountMapping.populate("subcategory", "name");
    await discountMapping.populate("createdBy", "name email");

    res.json({
      success: true,
      message: "Discount mapping updated successfully",
      discountMapping
    });
  } catch (error) {
    console.error("Update discount mapping error:", error);
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", ")
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while updating discount mapping"
    });
  }
};

// @desc    Delete discount mapping
// @route   DELETE /api/discount-mappings/:id
// @access  Private (Admin only)
export const deleteDiscountMapping = async (req, res) => {
  try {
    const discountMapping = await DiscountMapping.findById(req.params.id);

    if (!discountMapping) {
      return res.status(404).json({
        success: false,
        message: "Discount mapping not found"
      });
    }

    await DiscountMapping.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Discount mapping deleted successfully"
    });
  } catch (error) {
    console.error("Delete discount mapping error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting discount mapping"
    });
  }
};

// @desc    Approve/Reject discount mapping
// @route   PATCH /api/discount-mappings/:id/approve
// @access  Private (Super Admin only)
export const approveDiscountMapping = async (req, res) => {
  try {
    const { action, remarks } = req.body; // action: 'approve' or 'reject'

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be either 'approve' or 'reject'"
      });
    }

    const discountMapping = await DiscountMapping.findById(req.params.id);

    if (!discountMapping) {
      return res.status(404).json({
        success: false,
        message: "Discount mapping not found"
      });
    }

    if (discountMapping.status !== "Pending Approval") {
      return res.status(400).json({
        success: false,
        message: "Only pending approval mappings can be approved/rejected"
      });
    }

    discountMapping.status = action === "approve" ? "Approved" : "Rejected";
    discountMapping.approvedBy = req.user._id;
    discountMapping.approvedDate = new Date();
    
    if (remarks) {
      discountMapping.remarks = remarks;
    }

    await discountMapping.save();

    // Populate the updated document
    await discountMapping.populate("brand", "name");
    await discountMapping.populate("category", "name");
    await discountMapping.populate("subcategory", "name");
    await discountMapping.populate("createdBy", "name email");
    await discountMapping.populate("approvedBy", "name email");

    res.json({
      success: true,
      message: `Discount mapping ${action === "approve" ? "approved" : "rejected"} successfully`,
      discountMapping
    });
  } catch (error) {
    console.error("Approve discount mapping error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while processing approval"
    });
  }
};

// @desc    Get discount mapping statistics
// @route   GET /api/discount-mappings/stats
// @access  Private
export const getDiscountStats = async (req, res) => {
  try {
    const { mappingType } = req.query;
    
    const filter = {};
    if (mappingType) {
      filter.mappingType = mappingType;
    }

    const stats = await DiscountMapping.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Format stats
    const formattedStats = {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0
    };

    stats.forEach(stat => {
      formattedStats.total += stat.count;
      if (stat._id === "Approved") formattedStats.approved = stat.count;
      if (stat._id === "Pending Approval") formattedStats.pending = stat.count;
      if (stat._id === "Rejected") formattedStats.rejected = stat.count;
    });

    res.json({
      success: true,
      stats: formattedStats
    });
  } catch (error) {
    console.error("Get discount stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching discount statistics"
    });
  }
};