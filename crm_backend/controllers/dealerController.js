import Dealer from "../models/Dealer.js";

// Helper function to safely parse numbers
const safeParseInt = (value, defaultValue = 1) => {
  const num = parseInt(value);
  return isNaN(num) || num < 1 ? defaultValue : num;
};

// Get all dealers with pagination and search
export const getDealers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      dealerType,
      regionId,
      dealerCategory,
      isActive,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Parse pagination parameters
    const pageNumber = safeParseInt(page, 1);
    const limitNumber = safeParseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Build filter object
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { contactPerson: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (dealerType && dealerType !== "All") {
      filter.dealerType = dealerType;
    }

    if (regionId && regionId !== "All") {
      filter.regionId = regionId;
    }

    if (dealerCategory && dealerCategory !== "All") {
      filter.dealerCategory = { $in: [dealerCategory] };
    }

    if (isActive !== undefined && isActive !== "All") {
      filter.isActive = isActive === "true";
    }

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get total count for pagination
    const total = await Dealer.countDocuments(filter);

    // Get dealers with pagination
    const dealers = await Dealer.find(filter)
      .sort(sort)
      .limit(limitNumber)
      .skip(skip)
      .select("-__v");

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNumber);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;

    res.json({
      success: true,
      dealers,
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
    console.error("Get dealers error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get single dealer
export const getDealer = async (req, res) => {
  try {
    const dealer = await Dealer.findById(req.params.id);

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    res.json({
      success: true,
      dealer,
    });
  } catch (error) {
    console.error("Get dealer error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create new dealer
export const createDealer = async (req, res) => {
  try {
    const {
      name,
      contactPerson,
      phone,
      email,
      address,
      altAddress,
      dealerType,
      dealerCategory,
      categoryIds,
      regionId,
      salesExecutiveId,
      creditLimit,
      creditDays,
      salesTarget,
      gst,
      pan,
      aadhar,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !contactPerson ||
      !phone ||
      !address ||
      !dealerType ||
      !dealerCategory ||
      !categoryIds ||
      !regionId ||
      !salesExecutiveId
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Generate dealer code
    const code = await Dealer.generateDealerCode();

    // Check if dealer with same name exists
    const existingDealer = await Dealer.findOne({
      name: new RegExp(`^${name}$`, "i"),
    });

    if (existingDealer) {
      return res.status(400).json({
        success: false,
        message: "Dealer with this name already exists",
      });
    }

    // Create dealer data
    const dealerData = {
      code,
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email ? email.trim().toLowerCase() : "",
      address: address.trim(),
      altAddress: altAddress ? altAddress.trim() : "",
      dealerType,
      dealerCategory: Array.isArray(dealerCategory)
        ? dealerCategory
        : [dealerCategory],
      categoryIds: Array.isArray(categoryIds) ? categoryIds : [categoryIds],
      regionId,
      salesExecutiveId,
      creditLimit: parseFloat(creditLimit) || 0,
      creditDays: parseInt(creditDays) || 0,
      salesTarget: parseFloat(salesTarget) || 0,
      gst: gst ? gst.trim().toUpperCase() : "",
      pan: pan ? pan.trim().toUpperCase() : "",
      aadhar: aadhar ? aadhar.trim() : "",
      // Documents will be handled separately via upload endpoint
      panDocument: [],
      aadharDocument: [],
      gstDocument: [],
      documents: [],
      createdBy: req.user._id,
    };

    console.log("Creating dealer with data:", {
      code: dealerData.code,
      name: dealerData.name,
      dealerType: dealerData.dealerType,
    });

    const dealer = await Dealer.create(dealerData);

    console.log("Dealer created successfully:", {
      id: dealer._id,
      code: dealer.code,
      name: dealer.name,
    });

    res.status(201).json({
      success: true,
      message: "Dealer created successfully",
      dealer,
    });
  } catch (error) {
    console.error("Create dealer error:", error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Dealer code already exists",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update dealer
export const updateDealer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      contactPerson,
      phone,
      email,
      address,
      altAddress,
      dealerType,
      dealerCategory,
      categoryIds,
      regionId,
      salesExecutiveId,
      creditLimit,
      creditDays,
      salesTarget,
      gst,
      pan,
      aadhar,
      isActive,
    } = req.body;

    // Check if dealer exists
    const existingDealer = await Dealer.findById(id);
    if (!existingDealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    // Check if another dealer with same name exists
    if (name && name !== existingDealer.name) {
      const duplicateDealer = await Dealer.findOne({
        _id: { $ne: id },
        name: new RegExp(`^${name}$`, "i"),
      });

      if (duplicateDealer) {
        return res.status(400).json({
          success: false,
          message: "Another dealer with this name already exists",
        });
      }
    }

    const updateData = {};

    // Only update provided fields
    if (name !== undefined) updateData.name = name.trim();
    if (contactPerson !== undefined)
      updateData.contactPerson = contactPerson.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (email !== undefined)
      updateData.email = email ? email.trim().toLowerCase() : "";
    if (address !== undefined) updateData.address = address.trim();
    if (altAddress !== undefined)
      updateData.altAddress = altAddress ? altAddress.trim() : "";
    if (dealerType !== undefined) updateData.dealerType = dealerType;
    if (dealerCategory !== undefined)
      updateData.dealerCategory = Array.isArray(dealerCategory)
        ? dealerCategory
        : [dealerCategory];
    if (categoryIds !== undefined)
      updateData.categoryIds = Array.isArray(categoryIds)
        ? categoryIds
        : [categoryIds];
    if (regionId !== undefined) updateData.regionId = regionId;
    if (salesExecutiveId !== undefined)
      updateData.salesExecutiveId = salesExecutiveId;
    if (creditLimit !== undefined)
      updateData.creditLimit = parseFloat(creditLimit) || 0;
    if (creditDays !== undefined)
      updateData.creditDays = parseInt(creditDays) || 0;
    if (salesTarget !== undefined)
      updateData.salesTarget = parseFloat(salesTarget) || 0;
    if (gst !== undefined) updateData.gst = gst ? gst.trim().toUpperCase() : "";
    if (pan !== undefined) updateData.pan = pan ? pan.trim().toUpperCase() : "";
    if (aadhar !== undefined) updateData.aadhar = aadhar ? aadhar.trim() : "";
    // Documents are handled separately via upload endpoint
    // Remove document fields from update data to avoid casting errors
    if (isActive !== undefined) updateData.isActive = isActive;

    console.log("Updating dealer with data:", updateData);

    const dealer = await Dealer.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    res.json({
      success: true,
      message: "Dealer updated successfully",
      dealer,
    });
  } catch (error) {
    console.error("Update dealer error:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete dealer
export const deleteDealer = async (req, res) => {
  try {
    const dealer = await Dealer.findById(req.params.id);

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    await Dealer.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Dealer deleted successfully",
    });
  } catch (error) {
    console.error("Delete dealer error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get dealer statistics
export const getDealerStats = async (req, res) => {
  try {
    const totalDealers = await Dealer.countDocuments();
    const activeDealers = await Dealer.countDocuments({ isActive: true });

    // Dealer type wise count
    const dealerTypeStats = await Dealer.aggregate([
      {
        $group: {
          _id: "$dealerType",
          count: { $sum: 1 },
        },
      },
    ]);

    // Region wise count
    const regionStats = await Dealer.aggregate([
      {
        $group: {
          _id: "$regionId",
          count: { $sum: 1 },
        },
      },
    ]);

    // Total business statistics
    const businessStats = await Dealer.aggregate([
      {
        $group: {
          _id: null,
          totalOrders: { $sum: "$totalOrders" },
          totalValue: { $sum: "$totalValue" },
          avgCreditLimit: { $avg: "$creditLimit" },
          avgCreditDays: { $avg: "$creditDays" },
        },
      },
    ]);

    res.json({
      success: true,
      stats: {
        totalDealers,
        activeDealers,
        inactiveDealers: totalDealers - activeDealers,
        dealerTypes: dealerTypeStats,
        regions: regionStats,
        business: businessStats[0] || {},
      },
    });
  } catch (error) {
    console.error("Get dealer stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Upload dealer documents
export const uploadDealerDocuments = async (req, res) => {
  console.log("=== UPLOAD CONTROLLER CALLED ===");
  console.log("Dealer ID:", req.params.id);

  try {
    const { id } = req.params;

    // Check if dealer exists
    const dealer = await Dealer.findById(id);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    const documents = {};

    console.log("=== UPLOAD REQUEST DEBUG ===");
    console.log("Uploaded files:", req.files);
    console.log("Request body:", req.body);
    console.log("Request headers:", req.headers);
    console.log("============================");

    // Process uploaded files
    if (req.files) {
      // Process PAN document
      if (req.files.panDocument) {
        documents.panDocument = req.files.panDocument.map((file) => ({
          uid: `pan_${Date.now()}_${Math.random()}`,
          name: file.originalname,
          status: "done",
          url: `/uploads/${file.filename}`,
          type: file.mimetype,
          size: file.size,
          uploadDate: new Date(),
        }));
      }

      // Process Aadhar document
      if (req.files.aadharDocument) {
        documents.aadharDocument = req.files.aadharDocument.map((file) => ({
          uid: `aadhar_${Date.now()}_${Math.random()}`,
          name: file.originalname,
          status: "done",
          url: `/uploads/${file.filename}`,
          type: file.mimetype,
          size: file.size,
          uploadDate: new Date(),
        }));
      }

      // Process GST document
      if (req.files.gstDocument) {
        documents.gstDocument = req.files.gstDocument.map((file) => ({
          uid: `gst_${Date.now()}_${Math.random()}`,
          name: file.originalname,
          status: "done",
          url: `/uploads/${file.filename}`,
          type: file.mimetype,
          size: file.size,
          uploadDate: new Date(),
        }));
      }

      // Process other documents
      if (req.files.documents) {
        documents.documents = req.files.documents.map((file) => ({
          uid: `doc_${Date.now()}_${Math.random()}`,
          name: file.originalname,
          status: "done",
          url: `/uploads/${file.filename}`,
          type: file.mimetype,
          size: file.size,
          uploadDate: new Date(),
        }));
      }
    }

    console.log("Processed documents:", documents);

    // Update dealer with new documents
    let updatedDealer;

    if (Object.keys(documents).length > 0) {
      try {
        // Get current dealer to preserve existing documents
        const currentDealer = await Dealer.findById(id);

        // Prepare update object
        const updateObj = {};

        // Handle single document types (replace existing)
        if (documents.panDocument) {
          updateObj.panDocument = documents.panDocument;
        }
        if (documents.aadharDocument) {
          updateObj.aadharDocument = documents.aadharDocument;
        }
        if (documents.gstDocument) {
          updateObj.gstDocument = documents.gstDocument;
        }

        // Handle multiple documents (append to existing)
        if (documents.documents) {
          updateObj.documents = [
            ...(currentDealer.documents || []),
            ...documents.documents,
          ];
        }

        console.log("Updating dealer with:", updateObj);

        // Perform the update
        updatedDealer = await Dealer.findByIdAndUpdate(
          id,
          { $set: updateObj },
          { new: true, runValidators: false } // Disable validators to avoid casting issues
        );

        console.log("Update successful. Document counts:", {
          panDocument: updatedDealer.panDocument?.length || 0,
          aadharDocument: updatedDealer.aadharDocument?.length || 0,
          gstDocument: updatedDealer.gstDocument?.length || 0,
          documents: updatedDealer.documents?.length || 0,
        });
      } catch (updateError) {
        console.error("Database update error:", updateError);
        throw new Error(
          `Failed to update dealer documents: ${updateError.message}`
        );
      }
    } else {
      updatedDealer = dealer;
    }

    console.log("=== SENDING RESPONSE ===");
    console.log("Success: true");
    console.log("Documents processed:", Object.keys(documents));

    const response = {
      success: true,
      message: "Documents uploaded successfully",
      dealer: updatedDealer,
      documents,
    };

    console.log("Response:", response);
    res.json(response);
  } catch (error) {
    console.error("Upload dealer documents error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
