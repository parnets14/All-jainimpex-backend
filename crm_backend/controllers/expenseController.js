import Expense from "../models/Expense.js";
import asyncHandler from "express-async-handler";

// @desc    Create new expense
// @route   POST /api/expenses
// @access  Private
export const createExpense = asyncHandler(async (req, res) => {
  const { date, type, amount, person, description } = req.body;

  const expense = await Expense.create({
    date,
    type,
    amount,
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

  const populatedExpense = await Expense.findById(expense._id)
    .populate("type", "name")
    .populate("createdBy", "name email");

  res.status(201).json({
    success: true,
    data: populatedExpense,
  });
});

// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
export const getExpenses = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    type = "",
    startDate = "",
    endDate = "",
    minAmount = "",
    maxAmount = "",
  } = req.query;

  const query = {};

  if (search) {
    query.person = { $regex: search, $options: "i" };
  }

  if (type) {
    query.type = type;
  }

  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  if (minAmount || maxAmount) {
    query.amount = {};
    if (minAmount) query.amount.$gte = Number(minAmount);
    if (maxAmount) query.amount.$lte = Number(maxAmount);
  }

  const expenses = await Expense.find(query)
    .populate("type", "name")
    .populate("createdBy", "name email")
    .sort({ date: -1, createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Expense.countDocuments(query);

  const totalAmount = await Expense.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  res.json({
    success: true,
    data: expenses,
    summary: {
      totalAmount: totalAmount[0]?.total || 0,
      totalCount: total,
    },
    pagination: {
      current: Number(page),
      pages: Math.ceil(total / limit),
      total,
    },
  });
});

// @desc    Get expense by ID
// @route   GET /api/expenses/:id
// @access  Private
export const getExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id)
    .populate("type", "name description")
    .populate("createdBy", "name email");

  if (!expense) {
    res.status(404);
    throw new Error("Expense not found");
  }

  res.json({
    success: true,
    data: expense,
  });
});

// @desc    Update expense
// @route   PUT /api/expenses/:id
// @access  Private
export const updateExpense = asyncHandler(async (req, res) => {
  const { date, type, amount, person, description } = req.body;

  let expense = await Expense.findById(req.params.id);
  if (!expense) {
    res.status(404);
    throw new Error("Expense not found");
  }

  const updateData = {
    date,
    type,
    amount,
    person,
    description,
  };

  if (req.file) {
    updateData.document = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
    };
  }

  expense = await Expense.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  })
    .populate("type", "name")
    .populate("createdBy", "name email");

  res.json({
    success: true,
    data: expense,
  });
});

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private
export const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) {
    res.status(404);
    throw new Error("Expense not found");
  }

  await Expense.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: "Expense deleted successfully",
  });
});

// @desc    Get expense statistics
// @route   GET /api/expenses/stats/summary
// @access  Private
export const getExpenseStats = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const matchStage = {};
  if (startDate || endDate) {
    matchStage.date = {};
    if (startDate) matchStage.date.$gte = new Date(startDate);
    if (endDate) matchStage.date.$lte = new Date(endDate);
  }

  const stats = await Expense.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "expensetypes",
        localField: "type",
        foreignField: "_id",
        as: "typeInfo",
      },
    },
    { $unwind: "$typeInfo" },
    {
      $group: {
        _id: "$typeInfo.name",
        totalAmount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { totalAmount: -1 } },
  ]);

  const totalStats = await Expense.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
        totalCount: { $sum: 1 },
        averageAmount: { $avg: "$amount" },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      byType: stats,
      overall: totalStats[0] || {
        totalAmount: 0,
        totalCount: 0,
        averageAmount: 0,
      },
    },
  });
});