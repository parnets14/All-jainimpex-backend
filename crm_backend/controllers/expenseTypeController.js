import { expenseTypeSchema } from "../models/ExpenseType.js";
import { expenseSchema } from "../models/Expense.js";
import asyncHandler from "express-async-handler";

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    ExpenseType: dbConnection.models.ExpenseType || dbConnection.model('ExpenseType', expenseTypeSchema),
    Expense: dbConnection.models.Expense || dbConnection.model('Expense', expenseSchema)
  };
};

// @desc    Create new expense type
// @route   POST /api/expense-types
// @access  Private
export const createExpenseType = asyncHandler(async (req, res) => {
  const { ExpenseType } = getModels(req.dbConnection);
  const { name, description } = req.body;

  const expenseTypeExists = await ExpenseType.findOne({ name });
  if (expenseTypeExists) {
    res.status(400);
    throw new Error("Expense type already exists");
  }

  const expenseType = await ExpenseType.create({
    name,
    description,
    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    data: expenseType,
  });
});

// @desc    Get all expense types
// @route   GET /api/expense-types
// @access  Private
export const getExpenseTypes = asyncHandler(async (req, res) => {
  const { ExpenseType } = getModels(req.dbConnection);
  const { page = 1, limit = 10, search = "" } = req.query;

  const query = {
    isActive: true,
    ...(search && {
      name: { $regex: search, $options: "i" },
    }),
  };

  const expenseTypes = await ExpenseType.find(query)
    .populate("createdBy", "name email")
    .sort({ name: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await ExpenseType.countDocuments(query);

  res.json({
    success: true,
    data: expenseTypes,
    pagination: {
      current: Number(page),
      pages: Math.ceil(total / limit),
      total,
    },
  });
});

// @desc    Update expense type
// @route   PUT /api/expense-types/:id
// @access  Private
export const updateExpenseType = asyncHandler(async (req, res) => {
  const { ExpenseType } = getModels(req.dbConnection);
  const { name, description, isActive } = req.body;

  let expenseType = await ExpenseType.findById(req.params.id);
  if (!expenseType) {
    res.status(404);
    throw new Error("Expense type not found");
  }

  if (name && name !== expenseType.name) {
    const expenseTypeExists = await ExpenseType.findOne({ name });
    if (expenseTypeExists) {
      res.status(400);
      throw new Error("Expense type already exists");
    }
  }

  expenseType = await ExpenseType.findByIdAndUpdate(
    req.params.id,
    {
      name,
      description,
      isActive,
    },
    { new: true, runValidators: true }
  ).populate("createdBy", "name email");

  res.json({
    success: true,
    data: expenseType,
  });
});

// @desc    Delete expense type
// @route   DELETE /api/expense-types/:id
// @access  Private
export const deleteExpenseType = asyncHandler(async (req, res) => {
  const { ExpenseType, Expense } = getModels(req.dbConnection);
  const expenseType = await ExpenseType.findById(req.params.id);
  if (!expenseType) {
    res.status(404);
    throw new Error("Expense type not found");
  }

  // Check if expense type is being used in any expense
  const expenseCount = await Expense.countDocuments({ type: req.params.id });
  if (expenseCount > 0) {
    res.status(400);
    throw new Error("Cannot delete expense type that is in use");
  }

  await ExpenseType.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: "Expense type deleted successfully",
  });
});
