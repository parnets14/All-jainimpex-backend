// backend/controllers/regionController.js
import Region from "../models/Region.js";

// Get all regions with pagination (limit = 10)
export const getRegions = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1; // default page = 1
    const limit = 10; // fixed limit
    const search = req.query.search?.trim() || "";

    // Build search query
    const query = search
      ? { name: { $regex: search, $options: "i" } } // case-insensitive search
      : {};

    // Get total count for pagination
    const totalItems = await Region.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    // Get paginated regions
    const regions = await Region.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      regions,
      pagination: {
        currentPage: page,
        itemsPerPage: limit,
        totalItems,
        totalPages,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

// Create a new region
export const createRegion = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Name is required" });

    const existing = await Region.findOne({ name: name.trim() });
    if (existing) return res.status(400).json({ message: "Region already exists" });

    const region = new Region({ name: name.trim() });
    await region.save();
    res.status(201).json(region);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

// Update a region
export const updateRegion = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: "Name is required" });

    const region = await Region.findByIdAndUpdate(
      id,
      { name: name.trim() },
      { new: true }
    );

    if (!region) return res.status(404).json({ message: "Region not found" });
    res.json(region);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

// Delete a region
export const deleteRegion = async (req, res) => {
  try {
    const { id } = req.params;
    const region = await Region.findByIdAndDelete(id);
    if (!region) return res.status(404).json({ message: "Region not found" });
    res.json({ message: "Region deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};