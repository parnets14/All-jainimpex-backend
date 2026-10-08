import { pointsSchema } from "../models/Points.js";
import { categorySchema } from "../models/Category.js";
import { subcategorySchema } from "../models/Subcategory.js";
import { brandSchema } from "../models/Brand.js";
import {
  slugSchemeCode,
  validateAndNormalizeSlabs
} from "../utils/pointsSlabPolicy.js";

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    Points: dbConnection.models.Points || 
            dbConnection.model('Points', pointsSchema),
    Category: dbConnection.models.Category || 
              dbConnection.model('Category', categorySchema),
    Subcategory: dbConnection.models.Subcategory || 
                 dbConnection.model('Subcategory', subcategorySchema),
    Brand: dbConnection.models.Brand || 
           dbConnection.model('Brand', brandSchema)
  };
};

/**
 * Legacy `benefitType` enum only holds one value, but a slab reward can carry
 * several at once. Mirror the most significant one so old readers stay sane.
 * Order matters: points first because that is the historical default.
 */
const topSlabBenefitType = (slabs = []) => {
  const top = slabs[slabs.length - 1];
  if (!top) return "points";
  const r = top.reward || {};
  if (Number(r.points || 0) > 0) return "points";
  if (Number(r.extraQuantity || 0) > 0) return "extraQuantity";
  if (Number(r.discountPercentage || 0) > 0) return "discount";
  if (Number(r.cashbackAmount || 0) > 0) return "cashback";
  return "points";
};

// @desc    Add purchase/sale points
// @route   POST /api/points
// @access  Private
const addPoints = async (req, res) => {
  try {
    const { Points, Brand } = getModels(req.dbConnection);
    const {
      type,
      schemeCode,
      schemeName,
      brand,
      category,
      subcategory,
      calculationType,
      inputValue,
      benefitType,
      points,
      extraQuantity,
      discountPercentage,
      cashbackAmount,
      validFrom,
      validTo,
      autoApplyGRN,
      autoApplySupplierInvoice,
      description,
      slabs
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

    // Slab-based payload is now the primary shape. A payload with `slabs` is
    // validated as a ladder; one without falls back to the legacy single
    // threshold so existing callers keep working unchanged.
    const hasSlabs = Array.isArray(slabs) && slabs.length > 0;
    let normalizedSlabs = [];

    if (hasSlabs) {
      const result = validateAndNormalizeSlabs(slabs);
      if (!result.valid) {
        return res.status(400).json({ success: false, message: result.error });
      }
      normalizedSlabs = result.slabs;
    } else if (inputValue === undefined || inputValue === null || inputValue === "") {
      return res.status(400).json({
        success: false,
        message: "Provide either a slabs array or a legacy inputValue threshold"
      });
    }

    const finalSchemeCode = schemeCode ? slugSchemeCode(schemeCode) : null;
    if (schemeCode && !finalSchemeCode) {
      return res.status(400).json({
        success: false,
        message: "Scheme code must contain at least one letter or digit"
      });
    }
    if (finalSchemeCode) {
      const clash = await Points.findOne({ schemeCode: finalSchemeCode });
      if (clash) {
        return res.status(409).json({
          success: false,
          message: `Scheme code ${finalSchemeCode} is already in use`
        });
      }
    }

    const pointsEntry = new Points({
      type,
      schemeCode: finalSchemeCode,
      schemeName: schemeName || "",
      brand,
      category,
      subcategory,
      // Legacy mirrors: when a slab ladder is supplied, mirror the TOP tier
      // into the legacy fields so older readers (reports, exports, the
      // client-side schemeService) still see a sensible threshold/benefit.
      calculationType: hasSlabs ? "amount" : calculationType,
      inputValue: hasSlabs
        ? normalizedSlabs[normalizedSlabs.length - 1].from
        : inputValue,
      benefitType: hasSlabs ? topSlabBenefitType(normalizedSlabs) : (benefitType || 'points'),
      points: hasSlabs ? normalizedSlabs[normalizedSlabs.length - 1].reward.points : (points || 0),
      extraQuantity: hasSlabs
        ? normalizedSlabs[normalizedSlabs.length - 1].reward.extraQuantity
        : (extraQuantity || 0),
      discountPercentage: hasSlabs
        ? normalizedSlabs[normalizedSlabs.length - 1].reward.discountPercentage
        : (discountPercentage || 0),
      cashbackAmount: hasSlabs
        ? normalizedSlabs[normalizedSlabs.length - 1].reward.cashbackAmount
        : (cashbackAmount || 0),
      slabs: normalizedSlabs,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validTo: validTo ? new Date(validTo) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      autoApplyGRN: autoApplyGRN || false,
      autoApplySupplierInvoice: autoApplySupplierInvoice || false,
      description: description || '',
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
    const { Points } = getModels(req.dbConnection);
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

    // Scheme code / name search
    if (req.query.search) {
      const rx = new RegExp(
        String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );
      query.$or = [{ schemeCode: rx }, { schemeName: rx }, { description: rx }];
    }

    // Slab-aware vs legacy filter. A row is "slab-based" iff it has at least
    // one stored slab; everything else is a legacy single-threshold row.
    if (req.query.hasSlabs === "true") query["slabs.0"] = { $exists: true };
    if (req.query.hasSlabs === "false") query["slabs.0"] = { $exists: false };

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
      // `effectiveSlabs` normalises legacy rows into a one-entry ladder so the
      // client renders one shape for every row without any migration.
      points: points.map((doc) => ({
        ...doc.toObject(),
        effectiveSlabs: doc.effectiveSlabs()
      })),
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
    const { Points } = getModels(req.dbConnection);
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
    const { Points, Brand } = getModels(req.dbConnection);
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

// @desc    Update points entry
// @route   PUT /api/points/:id
// @access  Private
const updatePoints = async (req, res) => {
  try {
    const { Points, Brand } = getModels(req.dbConnection);
    const { id } = req.params;
    const {
      type,
      schemeCode,
      schemeName,
      brand,
      category,
      subcategory,
      calculationType,
      inputValue,
      benefitType,
      points,
      extraQuantity,
      discountPercentage,
      cashbackAmount,
      validFrom,
      validTo,
      autoApplyGRN,
      autoApplySupplierInvoice,
      description,
      slabs
    } = req.body;

    const pointsEntry = await Points.findById(id);

    if (!pointsEntry) {
      return res.status(404).json({ success: false, message: "Points entry not found" });
    }

    // Validate relationships if brand/category/subcategory are being updated
    if (brand || category || subcategory) {
      const brandExists = await Brand.findById(brand || pointsEntry.brand)
        .populate("category")
        .populate("subcategory");

      if (!brandExists) {
        return res.status(404).json({ success: false, message: "Brand not found" });
      }

      // Verify category and subcategory relationships
      const finalCategory = category || pointsEntry.category;
      const finalSubcategory = subcategory || pointsEntry.subcategory;

      if (brandExists.category._id.toString() !== finalCategory) {
        return res.status(400).json({ 
          success: false, 
          message: "Brand does not belong to the selected category" 
        });
      }

      if (brandExists.subcategory._id.toString() !== finalSubcategory) {
        return res.status(400).json({ 
          success: false, 
          message: "Brand does not belong to the selected subcategory" 
        });
      }
    }

    // Slabs are only touched when the caller actually sends them, so a legacy
    // edit that omits `slabs` leaves the stored ladder (or its absence) alone.
    let normalizedSlabs;
    if (Array.isArray(slabs)) {
      if (slabs.length === 0) {
        // Explicit empty array = "no ladder", allowed for legacy-style rows.
        normalizedSlabs = [];
      } else {
        const result = validateAndNormalizeSlabs(slabs);
        if (!result.valid) {
          return res.status(400).json({ success: false, message: result.error });
        }
        normalizedSlabs = result.slabs;
      }
    }

    // Scheme code uniqueness — only checked when a new, non-empty code is sent
    // and it differs from what is already stored.
    let finalSchemeCode;
    if (schemeCode !== undefined) {
      const slug = schemeCode ? slugSchemeCode(schemeCode) : null;
      if (schemeCode && !slug) {
        return res.status(400).json({
          success: false,
          message: "Scheme code must contain at least one letter or digit"
        });
      }
      if (slug && slug !== (pointsEntry.schemeCode || null)) {
        const clash = await Points.findOne({ schemeCode: slug, _id: { $ne: id } });
        if (clash) {
          return res.status(409).json({
            success: false,
            message: `Scheme code ${slug} is already in use`
          });
        }
      }
      finalSchemeCode = slug;
    }

    // When a ladder is supplied, keep the legacy mirror fields in step with the
    // top tier that the ladder itself drives.
    const ladder = normalizedSlabs && normalizedSlabs.length > 0 ? normalizedSlabs : null;
    const top = ladder ? ladder[ladder.length - 1] : null;

    // Update the points entry with default values for missing fields
    const updatedPoints = await Points.findByIdAndUpdate(
      id,
      {
        type: type || pointsEntry.type,
        ...(finalSchemeCode !== undefined && { schemeCode: finalSchemeCode }),
        ...(schemeName !== undefined && { schemeName }),
        brand: brand || pointsEntry.brand,
        category: category || pointsEntry.category,
        subcategory: subcategory || pointsEntry.subcategory,
        calculationType: ladder ? "amount" : (calculationType || pointsEntry.calculationType),
        inputValue: top
          ? top.from
          : (inputValue !== undefined ? inputValue : pointsEntry.inputValue),
        benefitType: ladder
          ? topSlabBenefitType(ladder)
          : (benefitType !== undefined ? benefitType : (pointsEntry.benefitType || 'points')),
        points: top ? top.reward.points : (points !== undefined ? points : (pointsEntry.points || 0)),
        extraQuantity: top
          ? top.reward.extraQuantity
          : (extraQuantity !== undefined ? extraQuantity : (pointsEntry.extraQuantity || 0)),
        discountPercentage: top
          ? top.reward.discountPercentage
          : (discountPercentage !== undefined ? discountPercentage : (pointsEntry.discountPercentage || 0)),
        cashbackAmount: top
          ? top.reward.cashbackAmount
          : (cashbackAmount !== undefined ? cashbackAmount : (pointsEntry.cashbackAmount || 0)),
        ...(normalizedSlabs !== undefined && { slabs: normalizedSlabs }),
        validFrom: validFrom !== undefined ? new Date(validFrom) : (pointsEntry.validFrom || new Date()),
        validTo: validTo !== undefined ? new Date(validTo) : (pointsEntry.validTo || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        autoApplyGRN: autoApplyGRN !== undefined ? autoApplyGRN : (pointsEntry.autoApplyGRN || false),
        autoApplySupplierInvoice: autoApplySupplierInvoice !== undefined ? autoApplySupplierInvoice : (pointsEntry.autoApplySupplierInvoice || false),
        description: description !== undefined ? description : (pointsEntry.description || ''),
        updatedBy: req.user._id,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    // Populate the updated points with related data
    await updatedPoints.populate([
      { path: "brand", select: "name" },
      { path: "category", select: "name" },
      { path: "subcategory", select: "name" },
      { path: "createdBy", select: "name email" },
      { path: "updatedBy", select: "name email" }
    ]);

    res.json({
      success: true,
      message: "Points updated successfully",
      points: updatedPoints
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete points entry
// @route   DELETE /api/points/:id
// @access  Private
const deletePoints = async (req, res) => {
  try {
    const { Points } = getModels(req.dbConnection);
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

// @desc    Check whether a scheme code is still available
// @route   GET /api/points/check-code
// @access  Private
const checkSchemeCode = async (req, res) => {
  try {
    const { Points } = getModels(req.dbConnection);
    const { code, excludeId } = req.query;

    const slug = slugSchemeCode(code);
    if (!slug) {
      return res.json({
        success: true,
        available: false,
        schemeCode: "",
        message: "Enter at least one letter or digit"
      });
    }

    const query = { schemeCode: slug };
    if (excludeId) query._id = { $ne: excludeId };

    const existing = await Points.findOne(query).select("_id schemeName").lean();

    res.json({
      success: true,
      available: !existing,
      schemeCode: slug,
      message: existing
        ? `Already used${existing.schemeName ? ` by "${existing.schemeName}"` : ""}`
        : "Available"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
  addPoints,
  getPoints,
  getPointsStats,
  getPointsByBrand,
  updatePoints,
  deletePoints,
  checkSchemeCode
};