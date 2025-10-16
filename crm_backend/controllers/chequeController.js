import Cheque from "../models/Cheque.js";
import Dealer from "../models/Dealer.js";

// Helper function to safely parse numbers
const safeParseInt = (value, defaultValue = 1) => {
  const num = parseInt(value);
  return isNaN(num) || num < 1 ? defaultValue : num;
};

// Get all cheques with pagination and search
export const getCheques = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status,
      dealer,
      sortBy = "date",
      sortOrder = "desc",
      startDate,
      endDate,
    } = req.query;

    // Parse pagination parameters
    const pageNumber = safeParseInt(page, 1);
    const limitNumber = safeParseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Build filter object
    const filter = { isDeleted: false };

    if (search) {
      filter.$or = [
        { chequeNo: { $regex: search, $options: "i" } },
        { bankName: { $regex: search, $options: "i" } },
        { remarks: { $regex: search, $options: "i" } },
      ];
    }

    if (status && status !== "All") {
      filter.status = status;
    }

    if (dealer && dealer !== "All") {
      // Find dealer by code and get their ID
      const dealerDoc = await Dealer.findOne({ code: dealer });
      if (dealerDoc) {
        filter.dealerId = dealerDoc._id;
      }
    }

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get total count for pagination
    const total = await Cheque.countDocuments(filter);

    // Get cheques with pagination and populate dealer info
    const cheques = await Cheque.find(filter)
      .populate("dealerId", "name code phone address")
      .sort(sort)
      .limit(limitNumber)
      .skip(skip)
      .select("-__v");

    // Transform cheques to include dealer info in the main object
    const transformedCheques = cheques.map((cheque) => {
      const chequeObj = cheque.toObject();
      if (chequeObj.dealerId) {
        chequeObj.dealerName = chequeObj.dealerId.name;
        chequeObj.dealerCode = chequeObj.dealerId.code;
        chequeObj.dealerPhone = chequeObj.dealerId.phone;
        chequeObj.dealerAddress = chequeObj.dealerId.address;
      }
      return chequeObj;
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNumber);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;

    res.json({
      success: true,
      cheques: transformedCheques,
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
    console.error("Get cheques error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get single cheque
export const getCheque = async (req, res) => {
  try {
    const { id } = req.params;

    const cheque = await Cheque.findOne({ _id: id, isDeleted: false })
      .populate("dealerId", "name code phone address email")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .select("-__v");

    if (!cheque) {
      return res.status(404).json({
        success: false,
        message: "Cheque not found",
      });
    }

    // Transform cheque to include dealer info
    const chequeObj = cheque.toObject();
    if (chequeObj.dealerId) {
      chequeObj.dealerName = chequeObj.dealerId.name;
      chequeObj.dealerCode = chequeObj.dealerId.code;
      chequeObj.dealerPhone = chequeObj.dealerId.phone;
      chequeObj.dealerAddress = chequeObj.dealerId.address;
      chequeObj.dealerEmail = chequeObj.dealerId.email;
    }

    res.json({
      success: true,
      cheque: chequeObj,
    });
  } catch (error) {
    console.error("Get cheque error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create new cheque
export const createCheque = async (req, res) => {
  try {
    const {
      chequeNo,
      amount,
      date,
      status = "Not Deposited",
      bankName,
      bankBranch,
      bankAccountNo,
      dealerId,
      remarks,
    } = req.body;

    // Validate required fields
    if (!chequeNo || !amount || !date || !bankName || !dealerId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: chequeNo, amount, date, bankName, dealerId",
      });
    }

    // Check if dealer exists
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    // Check if cheque number already exists
    const existingCheque = await Cheque.findOne({ chequeNo, isDeleted: false });
    if (existingCheque) {
      return res.status(400).json({
        success: false,
        message: "Cheque number already exists",
      });
    }

    // Create cheque
    const cheque = new Cheque({
      chequeNo: chequeNo.toUpperCase(),
      amount: parseFloat(amount),
      date: new Date(date),
      status,
      bankName,
      bankBranch,
      bankAccountNo,
      dealerId,
      remarks,
      createdBy: req.user.id,
    });

    await cheque.save();

    // Populate dealer info for response
    await cheque.populate("dealerId", "name code phone address");

    const chequeObj = cheque.toObject();
    if (chequeObj.dealerId) {
      chequeObj.dealerName = chequeObj.dealerId.name;
      chequeObj.dealerCode = chequeObj.dealerId.code;
      chequeObj.dealerPhone = chequeObj.dealerId.phone;
      chequeObj.dealerAddress = chequeObj.dealerId.address;
    }

    res.status(201).json({
      success: true,
      message: "Cheque created successfully",
      cheque: chequeObj,
    });
  } catch (error) {
    console.error("Create cheque error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update cheque
export const updateCheque = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Find cheque
    const cheque = await Cheque.findOne({ _id: id, isDeleted: false });
    if (!cheque) {
      return res.status(404).json({
        success: false,
        message: "Cheque not found",
      });
    }

    // Check if dealer exists (if dealerId is being updated)
    if (updateData.dealerId) {
      const dealer = await Dealer.findById(updateData.dealerId);
      if (!dealer) {
        return res.status(404).json({
          success: false,
          message: "Dealer not found",
        });
      }
    }

    // Check if cheque number already exists (if chequeNo is being updated)
    if (updateData.chequeNo && updateData.chequeNo !== cheque.chequeNo) {
      const existingCheque = await Cheque.findOne({
        chequeNo: updateData.chequeNo,
        isDeleted: false,
        _id: { $ne: id },
      });
      if (existingCheque) {
        return res.status(400).json({
          success: false,
          message: "Cheque number already exists",
        });
      }
    }

    // Update cheque
    Object.assign(cheque, updateData);
    cheque.updatedBy = req.user.id;

    // Convert date string to Date object if provided
    if (updateData.date) {
      cheque.date = new Date(updateData.date);
    }

    // Convert amount to number if provided
    if (updateData.amount) {
      cheque.amount = parseFloat(updateData.amount);
    }

    // Convert chequeNo to uppercase if provided
    if (updateData.chequeNo) {
      cheque.chequeNo = updateData.chequeNo.toUpperCase();
    }

    await cheque.save();

    // Populate dealer info for response
    await cheque.populate("dealerId", "name code phone address");

    const chequeObj = cheque.toObject();
    if (chequeObj.dealerId) {
      chequeObj.dealerName = chequeObj.dealerId.name;
      chequeObj.dealerCode = chequeObj.dealerId.code;
      chequeObj.dealerPhone = chequeObj.dealerId.phone;
      chequeObj.dealerAddress = chequeObj.dealerId.address;
    }

    res.json({
      success: true,
      message: "Cheque updated successfully",
      cheque: chequeObj,
    });
  } catch (error) {
    console.error("Update cheque error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete cheque (soft delete)
export const deleteCheque = async (req, res) => {
  try {
    const { id } = req.params;

    const cheque = await Cheque.findOne({ _id: id, isDeleted: false });
    if (!cheque) {
      return res.status(404).json({
        success: false,
        message: "Cheque not found",
      });
    }

    // Soft delete
    cheque.isDeleted = true;
    cheque.updatedBy = req.user.id;
    await cheque.save();

    res.json({
      success: true,
      message: "Cheque deleted successfully",
    });
  } catch (error) {
    console.error("Delete cheque error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update cheque status
export const updateChequeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks, bounceReason } = req.body;

    const validStatuses = ["Not Deposited", "Deposited", "Cleared", "Bounced"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be one of: Not Deposited, Deposited, Cleared, Bounced",
      });
    }

    const cheque = await Cheque.findOne({ _id: id, isDeleted: false });
    if (!cheque) {
      return res.status(404).json({
        success: false,
        message: "Cheque not found",
      });
    }

    // Update status and related fields
    cheque.status = status;
    cheque.updatedBy = req.user.id;

    if (remarks) {
      cheque.remarks = remarks;
    }

    if (status === "Bounced" && bounceReason) {
      cheque.bounceReason = bounceReason;
    }

    await cheque.save();

    res.json({
      success: true,
      message: "Cheque status updated successfully",
      cheque,
    });
  } catch (error) {
    console.error("Update cheque status error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get cheques by dealer
export const getChequesByDealer = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { page = 1, limit = 10, status, sortBy = "date", sortOrder = "desc" } = req.query;

    const pageNumber = safeParseInt(page, 1);
    const limitNumber = safeParseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const filter = { dealerId, isDeleted: false };

    if (status && status !== "All") {
      filter.status = status;
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const total = await Cheque.countDocuments(filter);
    const cheques = await Cheque.find(filter)
      .populate("dealerId", "name code phone address")
      .sort(sort)
      .limit(limitNumber)
      .skip(skip)
      .select("-__v");

    const totalPages = Math.ceil(total / limitNumber);

    res.json({
      success: true,
      cheques,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNumber,
      },
    });
  } catch (error) {
    console.error("Get cheques by dealer error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get cheques by status
export const getChequesByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const { page = 1, limit = 10, dealer, sortBy = "date", sortOrder = "desc" } = req.query;

    const pageNumber = safeParseInt(page, 1);
    const limitNumber = safeParseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const filter = { status, isDeleted: false };

    if (dealer && dealer !== "All") {
      const dealerDoc = await Dealer.findOne({ code: dealer });
      if (dealerDoc) {
        filter.dealerId = dealerDoc._id;
      }
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const total = await Cheque.countDocuments(filter);
    const cheques = await Cheque.find(filter)
      .populate("dealerId", "name code phone address")
      .sort(sort)
      .limit(limitNumber)
      .skip(skip)
      .select("-__v");

    const totalPages = Math.ceil(total / limitNumber);

    res.json({
      success: true,
      cheques,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNumber,
      },
    });
  } catch (error) {
    console.error("Get cheques by status error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get cheque statistics
export const getChequeStats = async (req, res) => {
  try {
    const { dealerId, status, startDate, endDate } = req.query;

    const filters = {};
    if (dealerId) filters.dealerId = dealerId;
    if (status) filters.status = status;
    if (startDate && endDate) {
      filters.startDate = startDate;
      filters.endDate = endDate;
    }

    const stats = await Cheque.getStats(filters);

    // Get status counts
    const statusCounts = await Cheque.aggregate([
      { $match: { isDeleted: false, ...filters } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const statusBreakdown = {};
    statusCounts.forEach((item) => {
      statusBreakdown[item._id] = {
        count: item.count,
        totalAmount: item.totalAmount,
      };
    });

    res.json({
      success: true,
      stats: {
        ...stats,
        statusBreakdown,
      },
    });
  } catch (error) {
    console.error("Get cheque stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Generate cheque report
export const getChequeReport = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      status,
      dealerId,
      format = "json",
    } = req.query;

    const filter = { isDeleted: false };

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    if (status && status !== "All") {
      filter.status = status;
    }

    if (dealerId) {
      filter.dealerId = dealerId;
    }

    const cheques = await Cheque.find(filter)
      .populate("dealerId", "name code phone address")
      .populate("createdBy", "name email")
      .sort({ date: -1 })
      .select("-__v");

    const stats = await Cheque.getStats({
      startDate,
      endDate,
      status,
      dealerId,
    });

    if (format === "csv") {
      // Generate CSV report
      const csvData = cheques.map((cheque) => {
        const dealer = cheque.dealerId;
        return {
          "Cheque No": cheque.chequeNo,
          "Amount": cheque.amount,
          "Date": cheque.date.toISOString().split("T")[0],
          "Status": cheque.status,
          "Bank Name": cheque.bankName,
          "Dealer Name": dealer?.name || "N/A",
          "Dealer Code": dealer?.code || "N/A",
          "Dealer Phone": dealer?.phone || "N/A",
          "Remarks": cheque.remarks || "",
        };
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=cheque-report.csv");
      
      // Convert to CSV string
      const csvString = [
        Object.keys(csvData[0] || {}).join(","),
        ...csvData.map((row) => Object.values(row).join(",")),
      ].join("\n");

      return res.send(csvString);
    }

    res.json({
      success: true,
      report: {
        cheques,
        stats,
        generatedAt: new Date(),
        filters: {
          startDate,
          endDate,
          status,
          dealerId,
        },
      },
    });
  } catch (error) {
    console.error("Get cheque report error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};






