import Route from "../models/Route.js";
import Dealer from "../models/Dealer.js";

// Get all routes
export const getRoutes = async (req, res) => {
  try {
    const routes = await Route.find()
      .populate("salesExecutive", "name email")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      routes,
    });
  } catch (error) {
    console.error("Error fetching routes:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch routes",
      error: error.message,
    });
  }
};

// Get single route by ID
export const getRouteById = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id)
      .populate("salesExecutive", "name email")
      .populate("createdBy", "name")
      .populate("updatedBy", "name");

    if (!route) {
      return res.status(404).json({
        success: false,
        message: "Route not found",
      });
    }

    // Get dealers assigned to this route
    const dealers = await Dealer.find({ route: req.params.id })
      .select("code name contactPerson phone address")
      .limit(100);

    res.status(200).json({
      success: true,
      route,
      dealers,
    });
  } catch (error) {
    console.error("Error fetching route:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch route",
      error: error.message,
    });
  }
};

// Create new route
export const createRoute = async (req, res) => {
  try {
    const {
      name,
      description,
      areas,
      pinCodes,
      salesExecutive,
      visitDays,
      estimatedDuration,
      priority,
    } = req.body;

    // Generate route code
    const code = await Route.generateRouteCode();

    const route = new Route({
      code,
      name,
      description,
      areas: areas || [],
      pinCodes: pinCodes || [],
      salesExecutive,
      visitDays: visitDays || [],
      estimatedDuration: estimatedDuration || 0,
      priority: priority || "Medium",
      createdBy: req.user._id,
    });

    await route.save();

    const populatedRoute = await Route.findById(route._id)
      .populate("salesExecutive", "name email")
      .populate("createdBy", "name");

    res.status(201).json({
      success: true,
      message: "Route created successfully",
      route: populatedRoute,
    });
  } catch (error) {
    console.error("Error creating route:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create route",
      error: error.message,
    });
  }
};

// Update route
export const updateRoute = async (req, res) => {
  try {
    const {
      name,
      description,
      areas,
      pinCodes,
      salesExecutive,
      visitDays,
      estimatedDuration,
      priority,
      isActive,
    } = req.body;

    const route = await Route.findById(req.params.id);

    if (!route) {
      return res.status(404).json({
        success: false,
        message: "Route not found",
      });
    }

    // Update fields
    if (name) route.name = name;
    if (description !== undefined) route.description = description;
    if (areas !== undefined) route.areas = areas;
    if (pinCodes !== undefined) route.pinCodes = pinCodes;
    if (salesExecutive !== undefined) route.salesExecutive = salesExecutive;
    if (visitDays !== undefined) route.visitDays = visitDays;
    if (estimatedDuration !== undefined) route.estimatedDuration = estimatedDuration;
    if (priority) route.priority = priority;
    if (isActive !== undefined) route.isActive = isActive;
    route.updatedBy = req.user._id;

    await route.save();

    const populatedRoute = await Route.findById(route._id)
      .populate("salesExecutive", "name email")
      .populate("createdBy", "name")
      .populate("updatedBy", "name");

    res.status(200).json({
      success: true,
      message: "Route updated successfully",
      route: populatedRoute,
    });
  } catch (error) {
    console.error("Error updating route:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update route",
      error: error.message,
    });
  }
};

// Delete route
export const deleteRoute = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);

    if (!route) {
      return res.status(404).json({
        success: false,
        message: "Route not found",
      });
    }

    // Check if any dealers are assigned to this route
    const dealerCount = await Dealer.countDocuments({ route: req.params.id });

    if (dealerCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete route. ${dealerCount} dealer(s) are assigned to this route. Please reassign them first.`,
      });
    }

    await Route.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Route deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting route:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete route",
      error: error.message,
    });
  }
};

// Update dealer count for a route
export const updateRouteDealerCount = async (routeId) => {
  try {
    const dealerCount = await Dealer.countDocuments({ route: routeId });
    await Route.findByIdAndUpdate(routeId, { totalDealers: dealerCount });
  } catch (error) {
    console.error("Error updating route dealer count:", error);
  }
};
