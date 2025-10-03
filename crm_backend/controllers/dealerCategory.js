import DealerCategory from "../models/DealerCategory.js";

// Create a new dealer category
export const createDealerCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Name is required" });
    }

    const existing = await DealerCategory.findOne({
      name: new RegExp(`^${name}$`, "i"),
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Dealer category with this name already exists" });
    }

    const dealerCategory = await DealerCategory.create({
      name: name.trim(),
      description,
    });
    res
      .status(201)
      .json({ message: "Dealer category created successfully", dealerCategory });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all dealer categories with pagination
export const getAllDealerCategories = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    // Calculate pagination values
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Build filter
    let filter = {};
    if (search) {
      filter = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      };
    }

    // Get total count for pagination info
    const total = await DealerCategory.countDocuments(filter);

    // Get paginated results
    const dealerCategories = await DealerCategory.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNumber);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;

    res.status(200).json({
      dealerCategories,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNumber,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNumber + 1 : null,
        prevPage: hasPrevPage ? pageNumber - 1 : null,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get single dealer category by ID
export const getDealerCategoryById = async (req, res) => {
  try {
    const dealerCategory = await DealerCategory.findById(req.params.id);
    if (!dealerCategory)
      return res.status(404).json({ message: "Dealer category not found" });
    res.status(200).json(dealerCategory);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update dealer category
export const updateDealerCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const { id } = req.params;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Name is required" });
    }

    const existing = await DealerCategory.findOne({
      _id: { $ne: id },
      name: new RegExp(`^${name}$`, "i"),
    });

    if (existing)
      return res
        .status(400)
        .json({ message: "Dealer category with this name already exists" });

    const updatedDealerCategory = await DealerCategory.findByIdAndUpdate(
      id,
      { name: name.trim(), description },
      { new: true }
    );

    if (!updatedDealerCategory)
      return res.status(404).json({ message: "Dealer category not found" });

    res
      .status(200)
      .json({ message: "Dealer category updated successfully", updatedDealerCategory });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete dealer category
export const deleteDealerCategory = async (req, res) => {
  try {
    const dealerCategory = await DealerCategory.findByIdAndDelete(req.params.id);
    if (!dealerCategory)
      return res.status(404).json({ message: "Dealer category not found" });
    res.status(200).json({ message: "Dealer category deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};