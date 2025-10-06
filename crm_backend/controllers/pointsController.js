import Points from "../models/Points.js";
import Category from "../models/Category.js";
import Subcategory from "../models/Subcategory.js";
import Brand from "../models/Brand.js";

// @desc    Add purchase/sale points
// @route   POST /api/points
// @access  Private
const addPoints = async (req, res) => {
  try {
    const {
      type,
      brand,
      category,
      subcategory,
      calculationType,
      inputValue,
      points
    } = req.body;

    // Validate relationships
    const brandExists = await Brand.findById(brand)
      .populate("category")
      .populate("subcategory");

    if (!brandExists) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    // Verify category and subcategory relationships
    if (brandExists.category._id.toString() !== category) {
      return res.status(400).json({ 
        success: false, 
        message: "Brand does not belong to the selected category" 
      });
    }

    if (brandExists.subcategory._id.toString() !== subcategory) {
      return res.status(400).json({ 
        success: false, 
        message: "Brand does not belong to the selected subcategory" 
      });
    }

    const pointsEntry = new Points({
      type,
      brand,
      category,
      subcategory,
      calculationType,
      inputValue,
      points,
      createdBy: req.user._id
    });

    const savedPoints = await pointsEntry.save();
    
    // Populate the saved points with related data
    await savedPoints.populate([
      { path: "brand", select: "name" },
      { path: "category", select: "name" },
      { path: "subcategory", select: "name" },
      { path: "createdBy", select: "name email" }
    ]);

    res.status(201).json({
      success: true,
      message: "Points added successfully",
      points: savedPoints
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get points with filters and pagination
// @route   GET /api/points
// @access  Private
const getPoints = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query
    let query = {};

    // Type filter (purchase/sale)
    if (req.query.type) {
      query.type = req.query.type;
    }

    // Brand filter
    if (req.query.brand) {
      query.brand = req.query.brand;
    }

    // Category filter
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Subcategory filter
    if (req.query.subcategory) {
      query.subcategory = req.query.subcategory;
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      query.date = {};
      if (req.query.startDate) {
        query.date.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.date.$lte = new Date(req.query.endDate);
      }
    }

    const points = await Points.find(query)
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("createdBy", "name email")
      .skip(skip)
      .limit(limit)
      .sort({ date: -1, createdAt: -1 });

    const totalItems = await Points.countDocuments(query);

    res.json({
      success: true,
      points,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get points statistics
// @route   GET /api/points/stats
// @access  Private
const getPointsStats = async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;

    let matchStage = {};
    
    if (type) {
      matchStage.type = type;
    }

    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    const stats = await Points.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$type",
          totalPoints: { $sum: "$points" },
          totalAmount: {
            $sum: {
              $cond: [
                { $eq: ["$calculationType", "amount"] },
                "$inputValue",
                0
              ]
            }
          },
          totalUnits: {
            $sum: {
              $cond: [
                { $eq: ["$calculationType", "units"] },
                "$inputValue",
                0
              ]
            }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Format the response
    const purchaseStats = stats.find(stat => stat._id === "purchase") || {
      totalPoints: 0,
      totalAmount: 0,
      totalUnits: 0,
      count: 0
    };

    const saleStats = stats.find(stat => stat._id === "sale") || {
      totalPoints: 0,
      totalAmount: 0,
      totalUnits: 0,
      count: 0
    };

    res.json({
      success: true,
      stats: {
        purchase: purchaseStats,
        sale: saleStats,
        overall: {
          totalPoints: purchaseStats.totalPoints + saleStats.totalPoints,
          totalAmount: purchaseStats.totalAmount + saleStats.totalAmount,
          totalUnits: purchaseStats.totalUnits + saleStats.totalUnits,
          totalEntries: purchaseStats.count + saleStats.count
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get points by brand
// @route   GET /api/points/brand/:brandId
// @access  Private
const getPointsByBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const brand = await Brand.findById(brandId);
    if (!brand) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    const points = await Points.find({ brand: brandId })
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("createdBy", "name email")
      .skip(skip)
      .limit(limit)
      .sort({ date: -1 });

    const totalItems = await Points.countDocuments({ brand: brandId });

    // Calculate brand-specific stats
    const brandStats = await Points.aggregate([
      { $match: { brand: brandId } },
      {
        $group: {
          _id: "$type",
          totalPoints: { $sum: "$points" },
          totalAmount: {
            $sum: {
              $cond: [
                { $eq: ["$calculationType", "amount"] },
                "$inputValue",
                0
              ]
            }
          },
          totalUnits: {
            $sum: {
              $cond: [
                { $eq: ["$calculationType", "units"] },
                "$inputValue",
                0
              ]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      points,
      brand: {
        _id: brand._id,
        name: brand.name
      },
      stats: brandStats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete points entry
// @route   DELETE /api/points/:id
// @access  Private
const deletePoints = async (req, res) => {
  try {
    const points = await Points.findById(req.params.id);

    if (!points) {
      return res.status(404).json({ success: false, message: "Points entry not found" });
    }

    await Points.deleteOne({ _id: points._id });
    res.json({ success: true, message: "Points entry removed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
  addPoints,
  getPoints,
  getPointsStats,
  getPointsByBrand,
  deletePoints
};