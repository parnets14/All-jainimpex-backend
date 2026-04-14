import { expenseCategorySchema } from "../models/ExpenseCategory.js";

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    ExpenseCategory: dbConnection.models.ExpenseCategory || dbConnection.model('ExpenseCategory', expenseCategorySchema)
  };
};

// Get all categories with pagination (limit = 10)
export const getAllCategories = async (req, res) => {
  const { ExpenseCategory } = getModels(req.dbConnection);
  try {
    const page = parseInt(req.query.page, 10) || 1; // default page = 1
    const limit = 10; // fixed limit

    const search = req.query.search?.trim() || "";

    const query = search
      ? { name: { $regex: search, $options: "i" } } // case-insensitive search
      : {};

    const totalItems = await ExpenseCategory.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    const categories = await ExpenseCategory.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      categories,
      pagination: {
        currentPage: page,
        itemsPerPage: limit,
        totalItems,
        totalPages,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Create category
export const createCategory = async (req, res) => {
  const { ExpenseCategory } = getModels(req.dbConnection);
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "Name is required" });

  try {
    const existing = await ExpenseCategory.findOne({ name });
    if (existing) return res.status(400).json({ message: "Category already exists" });

    const category = await ExpenseCategory.create({ name, description });
    res.status(201).json(category);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Update category
export const updateCategory = async (req, res) => {
  const { ExpenseCategory } = getModels(req.dbConnection);
  const { id } = req.params;
  const { name, description } = req.body;

  try {
    const category = await ExpenseCategory.findById(id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    category.name = name ?? category.name;
    category.description = description ?? category.description;
    await category.save();

    res.json(category);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete category
export const deleteCategory = async (req, res) => {
  const { ExpenseCategory } = getModels(req.dbConnection);
  const { id } = req.params;
  try {
    const category = await ExpenseCategory.findById(id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    await category.deleteOne();
    res.json({ message: "Category deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
