import Claim from "../models/Claim.js";
import asyncHandler from "express-async-handler";

// @desc    Create new claim
// @route   POST /api/claims
// @access  Private
export const createClaim = asyncHandler(async (req, res) => {
  const { type, amount, person, description } = req.body;

  const claim = await Claim.create({
    type,
    amount: Number(amount),
    approvedAmount: 0,
    person,
    description,
    document: req.file
      ? {
          filename: req.file.filename,
          originalName: req.file.originalname,
          path: req.file.path,
          mimetype: req.file.mimetype,
          size: req.file.size,
        }
      : undefined,
    createdBy: req.user._id,
  });

  const populatedClaim = await Claim.findById(claim._id)
    .populate("type", "name maxAmount")
    .populate("createdBy", "name email")
    .populate("approvedBy", "name email");

  res.status(201).json({
    success: true,
    data: populatedClaim,
  });
});

// @desc    Get all claims
// @route   GET /api/claims
// @access  Private
export const getClaims = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    type = "",
    status = "",
    paymentStatus = "",
    startDate = "",
    endDate = "",
  } = req.query;

  const query = {};

  if (search) {
    query.person = { $regex: search, $options: "i" };
  }

  if (type) {
    query.type = type;
  }

  if (status) {
    query.status = status;
  }

  if (paymentStatus) {
    query.paymentStatus = paymentStatus;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const claims = await Claim.find(query)
    .populate("type", "name maxAmount")
    .populate("createdBy", "name email")
    .populate("approvedBy", "name email")
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Claim.countDocuments(query);

  // Calculate statistics
  const stats = await Claim.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
        totalApprovedAmount: { $sum: "$approvedAmount" },
        pendingCount: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
        approvedCount: {
          $sum: {
            $cond: [
              { $in: ["$status", ["approved", "partially_approved"]] },
              1,
              0,
            ],
          },
        },
        paidCount: {
          $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
        },
      },
    },
  ]);

  res.json({
    success: true,
    data: claims,
    statistics: stats[0] || {
      totalAmount: 0,
      totalApprovedAmount: 0,
      pendingCount: 0,
      approvedCount: 0,
      paidCount: 0,
    },
    pagination: {
      current: Number(page),
      pages: Math.ceil(total / limit),
      total,
    },
  });
});

// @desc    Get claim by ID
// @route   GET /api/claims/:id
// @access  Private
export const getClaim = asyncHandler(async (req, res) => {
  const claim = await Claim.findById(req.params.id)
    .populate("type", "name maxAmount description")
    .populate("createdBy", "name email")
    .populate("approvedBy", "name email");

  if (!claim) {
    res.status(404);
    throw new Error("Claim not found");
  }

  res.json({
    success: true,
    data: claim,
  });
});

// @desc    Update claim status (approval)
// @route   PUT /api/claims/:id/approve
// @access  Private
export const approveClaim = asyncHandler(async (req, res) => {
  const { status, approvedAmount, remarks } = req.body;

  const claim = await Claim.findById(req.params.id);
  if (!claim) {
    res.status(404);
    throw new Error("Claim not found");
  }

  if (claim.status !== "pending") {
    res.status(400);
    throw new Error("Claim has already been processed");
  }

  const updateData = {
    status,
    approvedAmount: status === "rejected" ? 0 : Number(approvedAmount),
    remarks,
    approvedBy: req.user._id,
    approvalDate: new Date(),
  };

  const updatedClaim = await Claim.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  )
    .populate("type", "name maxAmount")
    .populate("createdBy", "name email")
    .populate("approvedBy", "name email");

  res.json({
    success: true,
    data: updatedClaim,
    message: `Claim ${status} successfully`,
  });
});

// @desc    Update claim payment status
// @route   PUT /api/claims/:id/payment
// @access  Private
export const updateClaimPayment = asyncHandler(async (req, res) => {
  const { paymentStatus, transactionNo, paymentRemarks } = req.body;

  const claim = await Claim.findById(req.params.id);
  if (!claim) {
    res.status(404);
    throw new Error("Claim not found");
  }

  if (claim.status === "pending") {
    res.status(400);
    throw new Error("Cannot pay a pending claim");
  }

  if (claim.status === "rejected") {
    res.status(400);
    throw new Error("Cannot pay a rejected claim");
  }

  const updateData = {
    paymentStatus,
    transactionNo,
    paymentRemarks,
    ...(paymentStatus === "paid" && { paymentDate: new Date() }),
  };

  const updatedClaim = await Claim.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  )
    .populate("type", "name maxAmount")
    .populate("createdBy", "name email")
    .populate("approvedBy", "name email");

  res.json({
    success: true,
    data: updatedClaim,
    message: `Payment status updated to ${paymentStatus}`,
  });
});

// @desc    Delete claim
// @route   DELETE /api/claims/:id
// @access  Private
export const deleteClaim = asyncHandler(async (req, res) => {
  const claim = await Claim.findById(req.params.id);
  if (!claim) {
    res.status(404);
    throw new Error("Claim not found");
  }

  if (claim.status !== "pending") {
    res.status(400);
    throw new Error("Cannot delete a processed claim");
  }

  await Claim.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: "Claim deleted successfully",
  });
});

// @desc    Get claims statistics
// @route   GET /api/claims/stats/summary
// @access  Private
export const getClaimStats = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const matchStage = {};
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  const stats = await Claim.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "claimtypes",
        localField: "type",
        foreignField: "_id",
        as: "typeInfo",
      },
    },
    { $unwind: "$typeInfo" },
    {
      $group: {
        _id: {
          type: "$typeInfo.name",
          status: "$status",
          paymentStatus: "$paymentStatus",
        },
        totalAmount: { $sum: "$amount" },
        totalApprovedAmount: { $sum: "$approvedAmount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.type": 1 } },
  ]);

  const summaryStats = await Claim.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalClaims: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        totalApprovedAmount: { $sum: "$approvedAmount" },
        pendingCount: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
        paidCount: {
          $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
        },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      detailed: stats,
      summary: summaryStats[0] || {
        totalClaims: 0,
        totalAmount: 0,
        totalApprovedAmount: 0,
        pendingCount: 0,
        paidCount: 0,
      },
    },
  });
});