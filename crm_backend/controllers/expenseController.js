import { expenseSchema } from "../models/Expense.js";
import { isPeriodLocked } from "../services/periodLockService.js";
import { recordCreate, recordUpdate } from "../services/auditTrailService.js";
import asyncHandler from "express-async-handler";

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    Expense: dbConnection.models.Expense || dbConnection.model('Expense', expenseSchema)
  };
};

// @desc    Create new expense
// @route   POST /api/expenses
// @access  Private
export const createExpense = asyncHandler(async (req, res) => {
  const { Expense } = getModels(req.dbConnection);
  const { date, type, amount, person, description } = req.body;

  // Block expenses dated in a closed financial year
  if (await isPeriodLocked(req.dbConnection, date || Date.now())) {
    res.status(423);
    throw new Error("Financial year is closed for this date. Ask a super-admin to reopen the year before adding this expense.");
  }

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

  await recordCreate(req.dbConnection, {
    entity: "Expense",
    entityId: expense._id,
    documentNumber: expense.voucherNumber || String(expense._id),
    req,
  });

  // Auto-journalize the expense (Dr Expense / Cr Cash) for P&L + trial balance
  try {
    const { createExpenseEntry } = await import("../services/accountingService.js");
    await createExpenseEntry(expense, req.dbConnection, req.user._id, {
      expenseTypeName: populatedExpense?.type?.name,
    });
  } catch (accErr) {
    console.error("⚠️ Failed to journalize expense (non-critical):", accErr.message);
  }

  res.status(201).json({
    success: true,
    data: populatedExpense,
  });
});

// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
export const getExpenses = asyncHandler(async (req, res) => {
  const { Expense } = getModels(req.dbConnection);
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
  const { Expense } = getModels(req.dbConnection);
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
  const { Expense } = getModels(req.dbConnection);
  const { date, type, amount, person, description } = req.body;

  let expense = await Expense.findById(req.params.id);
  if (!expense) {
    res.status(404);
    throw new Error("Expense not found");
  }

  // Block edits when either the existing date or the new date is in a closed FY
  if (
    (await isPeriodLocked(req.dbConnection, expense.date)) ||
    (date && (await isPeriodLocked(req.dbConnection, date)))
  ) {
    res.status(423);
    throw new Error("Financial year is closed for this date. Ask a super-admin to reopen the year before editing this expense.");
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

  // Capture before-values for the audit diff
  const beforeSnapshot = {
    date: expense.date,
    type: expense.type,
    amount: expense.amount,
    person: expense.person,
    description: expense.description,
  };

  expense = await Expense.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  })
    .populate("type", "name")
    .populate("createdBy", "name email");

  await recordUpdate(req.dbConnection, {
    entity: "Expense",
    entityId: req.params.id,
    documentNumber: String(req.params.id),
    before: beforeSnapshot,
    after: { date: updateData.date, type: updateData.type, amount: updateData.amount, person: updateData.person, description: updateData.description },
    fields: ["date", "type", "amount", "person", "description"],
    req,
  });

  res.json({
    success: true,
    data: expense,
  });
});

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private
export const deleteExpense = asyncHandler(async (req, res) => {
  const { Expense } = getModels(req.dbConnection);
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
  const { Expense } = getModels(req.dbConnection);
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