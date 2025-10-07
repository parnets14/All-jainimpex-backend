import ClaimType from "../models/ClaimType.js";
import asyncHandler from "express-async-handler";

// @desc    Create new claim type
// @route   POST /api/claim-types
// @access  Private
export const createClaimType = asyncHandler(async (req, res) => {
  const { name, description, maxAmount } = req.body;

  const claimTypeExists = await ClaimType.findOne({ name });
  if (claimTypeExists) {
    res.status(400);
    throw new Error("Claim type already exists");
  }

  const claimType = await ClaimType.create({
    name,
    description,
    maxAmount,
    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    data: claimType,
  });
});

// @desc    Get all claim types
// @route   GET /api/claim-types
// @access  Private
export const getClaimTypes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search = "" } = req.query;

  const query = {
    isActive: true,
    ...(search && {
      name: { $regex: search, $options: "i" },
    }),
  };

  const claimTypes = await ClaimType.find(query)
    .populate("createdBy", "name email")
    .sort({ name: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await ClaimType.countDocuments(query);

  res.json({
    success: true,
    data: claimTypes,
    pagination: {
      current: Number(page),
      pages: Math.ceil(total / limit),
      total,
    },
  });
});

// @desc    Update claim type
// @route   PUT /api/claim-types/:id
// @access  Private
export const updateClaimType = asyncHandler(async (req, res) => {
  const { name, description, maxAmount, isActive } = req.body;

  let claimType = await ClaimType.findById(req.params.id);
  if (!claimType) {
    res.status(404);
    throw new Error("Claim type not found");
  }

  if (name && name !== claimType.name) {
    const claimTypeExists = await ClaimType.findOne({ name });
    if (claimTypeExists) {
      res.status(400);
      throw new Error("Claim type already exists");
    }
  }

  claimType = await ClaimType.findByIdAndUpdate(
    req.params.id,
    {
      name,
      description,
      maxAmount,
      isActive,
    },
    { new: true, runValidators: true }
  ).populate("createdBy", "name email");

  res.json({
    success: true,
    data: claimType,
  });
});

// @desc    Delete claim type
// @route   DELETE /api/claim-types/:id
// @access  Private
export const deleteClaimType = asyncHandler(async (req, res) => {
  const claimType = await ClaimType.findById(req.params.id);
  if (!claimType) {
    res.status(404);
    throw new Error("Claim type not found");
  }

  // Check if claim type is being used in any claim
  const Claim = require("../models/Claim").default;
  const claimCount = await Claim.countDocuments({ type: req.params.id });
  if (claimCount > 0) {
    res.status(400);
    throw new Error("Cannot delete claim type that is in use");
  }

  await ClaimType.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: "Claim type deleted successfully",
  });
});