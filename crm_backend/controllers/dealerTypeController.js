// controllers/dealerTypeController.js
import { dealerTypeSchema } from "../models/Dealertype.js";

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    DealerType: dbConnection.models.DealerType || dbConnection.model('DealerType', dealerTypeSchema)
  };
};

// Create a new dealer type
export const createDealerType = async (req, res) => {
  const { DealerType } = getModels(req.dbConnection);
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Name is required" });
    }

    const existing = await DealerType.findOne({
      name: new RegExp(`^${name}$`, "i"),
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Dealer type with this name already exists" });
    }

    const dealerType = await DealerType.create({
      name: name.trim(),
      description,
    });
    res
      .status(201)
      .json({ message: "Dealer type created successfully", dealerType });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all dealer types with pagination
export const getAllDealerTypes = async (req, res) => {
  const { DealerType } = getModels(req.dbConnection);
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
    const total = await DealerType.countDocuments(filter);

    // Get paginated results
    const dealerTypes = await DealerType.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNumber);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;

    res.status(200).json({
      dealerTypes,
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

// Get single dealer type by ID
export const getDealerTypeById = async (req, res) => {
  const { DealerType } = getModels(req.dbConnection);
  try {
    const dealerType = await DealerType.findById(req.params.id);
    if (!dealerType)
      return res.status(404).json({ message: "Dealer type not found" });
    res.status(200).json(dealerType);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update dealer type
export const updateDealerType = async (req, res) => {
  const { DealerType } = getModels(req.dbConnection);
  try {
    const { name, description } = req.body;
    const { id } = req.params;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Name is required" });
    }

    const existing = await DealerType.findOne({
      _id: { $ne: id },
      name: new RegExp(`^${name}$`, "i"),
    });

    if (existing)
      return res
        .status(400)
        .json({ message: "Dealer type with this name already exists" });

    const updatedDealerType = await DealerType.findByIdAndUpdate(
      id,
      { name: name.trim(), description },
      { new: true }
    );

    if (!updatedDealerType)
      return res.status(404).json({ message: "Dealer type not found" });

    res
      .status(200)
      .json({ message: "Dealer type updated successfully", updatedDealerType });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete dealer type
export const deleteDealerType = async (req, res) => {
  const { DealerType } = getModels(req.dbConnection);
  try {
    const dealerType = await DealerType.findByIdAndDelete(req.params.id);
    if (!dealerType)
      return res.status(404).json({ message: "Dealer type not found" });
    res.status(200).json({ message: "Dealer type deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
