import { dealerSchema } from "../models/Dealer.js";
import { brandSchema } from "../models/Brand.js";
import { categorySchema } from "../models/Category.js";
import { subcategorySchema } from "../models/Subcategory.js";
import { extendedSubcategorySchema } from "../models/ExtendedSubcategory.js";
import { dealerLedgerSchema } from "../models/DealerLedger.js";
import { paymentAllocationSchema } from "../models/PaymentAllocation.js";
import { routeSchema } from "../models/Route.js";
import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { salesOrderSchema } from "../models/SalesOrder.js";
import { regionSchema } from "../models/Region.js";
import { dealerCategorySchema } from "../models/DealerCategory.js";
import { productSchema } from "../models/Product.js";
import { getDealerCreditExposure } from '../services/dealerCreditService.js';

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema),
    Brand: dbConnection.models.Brand || dbConnection.model('Brand', brandSchema),
    Category: dbConnection.models.Category || dbConnection.model('Category', categorySchema),
    Subcategory: dbConnection.models.Subcategory || dbConnection.model('Subcategory', subcategorySchema),
    ExtendedSubcategory: dbConnection.models.ExtendedSubcategory || dbConnection.model('ExtendedSubcategory', extendedSubcategorySchema),
    DealerLedger: dbConnection.models.DealerLedger || dbConnection.model('DealerLedger', dealerLedgerSchema),
    PaymentAllocation: dbConnection.models.PaymentAllocation || dbConnection.model('PaymentAllocation', paymentAllocationSchema),
    Route: dbConnection.models.Route || dbConnection.model('Route', routeSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    SalesOrder: dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema),
    Region: dbConnection.models.Region || dbConnection.model('Region', regionSchema),
    DealerCategory: dbConnection.models.DealerCategory || dbConnection.model('DealerCategory', dealerCategorySchema),
    Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
  };
};

// Helper function to safely parse numbers
const safeParseInt = (value, defaultValue = 1) => {
  const num = parseInt(value);
  return isNaN(num) || num < 1 ? defaultValue : num;
};

// Helper function to update route dealer count
const updateRouteDealerCount = async (dbConnection, routeId) => {
  if (!routeId) return;
  try {
    const { Dealer, Route } = getModels(dbConnection);
    const dealerCount = await Dealer.countDocuments({ routeId });
    await Route.findByIdAndUpdate(routeId, { totalDealers: dealerCount });
  } catch (error) {
    console.error("Error updating route dealer count:", error);
  }
};

// Get all dealers with pagination and search
export const getDealers = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Dealer } = getModels(req.dbConnection);
    
    const {
      page = 1,
      limit = 10,
      search = "",
      dealerType,
      regionId,
      dealerCategory,
      isActive,
      compact = "false",
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

    const compactMode = compact === "true";
    let dealerQuery = Dealer.find(filter)
      .sort(sort)
      .limit(limitNumber)
      .skip(skip);

    if (compactMode) {
      // Order/invoice dealer pickers need identity, contact, credit and region
      // fields only. Avoid document arrays and seven unrelated populations.
      dealerQuery = dealerQuery
        .select("code name contactPerson phone email address gst dealerType regionId creditLimit creditDays creditDaysRegular creditDaysCD extraDiscounts isActive")
        .populate('regionId', 'name code')
        .lean();
    } else {
      dealerQuery = dealerQuery
        .populate('regionId', 'name code')
        .populate('routeId', 'name code')
        .populate('salesExecutiveId', 'name empId email')
        .populate('dealerCategory', 'name color description')
        .populate('allowedBrands', 'name description')
        .populate('allowedCategories', 'name description')
        .populate('allowedSubcategories', 'name description')
        .populate('allowedExtendedSubcategories', 'name level description')
        .select("-__v");
    }

    // Count and page reads are independent; do not serialize them.
    const [total, dealers] = await Promise.all([
      Dealer.countDocuments(filter),
      dealerQuery
    ]);

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
    // Get models from company-specific connection
    const { Dealer } = getModels(req.dbConnection);
    
    const dealer = await Dealer.findById(req.params.id)
      .populate('regionId', 'name code')
      .populate('salesExecutiveId', 'name empId email')
      .populate('dealerCategory', 'name color description')
      .populate('allowedBrands', 'name description')
      .populate('allowedCategories', 'name description')
      .populate('allowedSubcategories', 'name description')
      .populate('allowedExtendedSubcategories', 'name level description');

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
  let session;
  try {
    // Get models from company-specific connection
    const { Dealer, DealerLedger } = getModels(req.dbConnection);
    
    const {
      name,
      contactPerson,
      phone,
      email,
      address,
      location,
      altAddress,
      dealerType,
      dealerCategory,
      regionId,
      routeId,
      salesExecutiveId,
      creditLimit,
      creditDays,
      creditDaysRegular,
      creditDaysCD,
      salesTarget,
      gst,
      pan,
      aadhar,
      // Product Hierarchy Permissions
      allowedBrands,
      allowedCategories,
      allowedSubcategories,
      allowedExtendedSubcategories,
      // Dealer-Specific Extra Discounts
      extraDiscounts,
      // Opening balance at go-live
      openingBalance,
      openingBalanceType,
      openingBalanceDate,
    } = req.body;

    const normalizedCreditLimit = Number(creditLimit);
    if (
      creditLimit === null ||
      creditLimit === undefined ||
      (typeof creditLimit === "string" && creditLimit.trim() === "") ||
      !Number.isFinite(normalizedCreditLimit) ||
      normalizedCreditLimit <= 0
    ) {
      return res.status(400).json({
        success: false,
        code: "DEALER_CREDIT_LIMIT_REQUIRED",
        message: "Credit limit is required and must be a finite number greater than zero",
      });
    }

    const hasOpeningBalance = Object.prototype.hasOwnProperty.call(req.body, "openingBalance");
    const hasOpeningBalanceType = Object.prototype.hasOwnProperty.call(req.body, "openingBalanceType");
    const hasOpeningBalanceDate = Object.prototype.hasOwnProperty.call(req.body, "openingBalanceDate");
    let normalizedOpeningBalance = 0;
    if (hasOpeningBalance) {
      normalizedOpeningBalance = Number(openingBalance);
      if (
        openingBalance === null ||
        (typeof openingBalance === "string" && openingBalance.trim() === "") ||
        !Number.isFinite(normalizedOpeningBalance) ||
        normalizedOpeningBalance < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Opening balance must be a finite number greater than or equal to zero",
        });
      }
    }

    const normalizedOpeningBalanceType = hasOpeningBalanceType ? openingBalanceType : "Dr";
    if (hasOpeningBalanceType && !["Dr", "Cr"].includes(openingBalanceType)) {
      return res.status(400).json({
        success: false,
        message: "Opening balance type must be Dr or Cr",
      });
    }

    let normalizedOpeningBalanceDate = null;
    if (hasOpeningBalanceDate) {
      if (openingBalanceDate === null || openingBalanceDate === "") {
        return res.status(400).json({
          success: false,
          message: "Opening balance date must be a valid date",
        });
      }
      normalizedOpeningBalanceDate = new Date(openingBalanceDate);
      if (Number.isNaN(normalizedOpeningBalanceDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Opening balance date must be a valid date",
        });
      }
    } else if (normalizedOpeningBalance > 0) {
      normalizedOpeningBalanceDate = new Date();
    }

    // Validate required fields
    if (
      !name ||
      !contactPerson ||
      !phone ||
      (!address && !altAddress) ||
      !dealerType ||
      !dealerCategory ||
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
      address: (address || altAddress || '').trim(),
      location: location || null,
      altAddress: altAddress ? altAddress.trim() : "",
      dealerType,
      dealerCategory: Array.isArray(dealerCategory)
        ? dealerCategory
        : [dealerCategory],
      regionId,
      routeId: routeId || null,
      salesExecutiveId,
      creditLimit: normalizedCreditLimit,
      creditDays: parseInt(creditDays) || 0,
      creditDaysRegular: parseInt(creditDaysRegular) || 0,
      creditDaysCD: parseInt(creditDaysCD) || 0,
      salesTarget: parseFloat(salesTarget) || 0,
      gst: gst ? gst.trim().toUpperCase() : "",
      pan: pan ? pan.trim().toUpperCase() : "",
      aadhar: aadhar ? aadhar.trim() : "",
      // Product Hierarchy Permissions
      allowedBrands: allowedBrands || [],
      allowedCategories: allowedCategories || [],
      allowedSubcategories: allowedSubcategories || [],
      allowedExtendedSubcategories: allowedExtendedSubcategories || [],
      // Dealer-Specific Extra Discounts
      extraDiscounts: extraDiscounts || [],
      // Opening balance at go-live (migration)
      openingBalance: normalizedOpeningBalance,
      openingBalanceType: normalizedOpeningBalanceType,
      openingBalanceDate: normalizedOpeningBalanceDate,
      // Documents will be handled separately via upload endpoint
      panDocument: [],
      aadharDocument: [],
      gstDocument: [],
      documents: [],
      createdBy: req.user._id,
    };

    session = await req.dbConnection.startSession();
    let dealer;
    await session.withTransaction(async () => {
      dealer = new Dealer(dealerData);
      await dealer.save({ session });

      // Seed both accounting representations in the same transaction as the dealer.
      if (normalizedOpeningBalance > 0) {
        const ledgerEntry = new DealerLedger({
          dealer: dealer._id,
          dealerName: dealer.name,
          dealerCode: dealer.code,
          entryDate: normalizedOpeningBalanceDate,
          transactionType: 'Opening Balance',
          // Dr = dealer owes us (debit); Cr = we owe dealer / advance (credit)
          debitAmount: normalizedOpeningBalanceType === 'Dr' ? normalizedOpeningBalance : 0,
          creditAmount: normalizedOpeningBalanceType === 'Cr' ? normalizedOpeningBalance : 0,
          runningBalance: 0, // computed by pre-save hook
          description: `Opening Balance (${normalizedOpeningBalanceType}) brought forward`,
          status: 'Active',
          createdBy: req.user._id,
        });
        await ledgerEntry.save({ session });

        const { createDealerOpeningEntry } = await import('../services/accountingService.js');
        const journalVoucher = await createDealerOpeningEntry(
          {
            dealer,
            amount: normalizedOpeningBalance,
            type: normalizedOpeningBalanceType,
            date: normalizedOpeningBalanceDate,
          },
          req.dbConnection,
          req.user._id,
          { session, throwOnError: true }
        );
        if (!journalVoucher) {
          throw new Error('Dealer opening journal entry could not be created');
        }
      }
    });

    // Update route dealer count if route is assigned
    if (routeId) {
      await updateRouteDealerCount(req.dbConnection, routeId);
    }

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
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (sessionError) {
        console.error("Failed to end dealer creation session:", sessionError);
      }
    }
  }
};

// Update dealer
export const updateDealer = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Dealer } = getModels(req.dbConnection);
    
    const { id } = req.params;
    const {
      name,
      contactPerson,
      phone,
      email,
      address,
      location,
      altAddress,
      dealerType,
      dealerCategory,
      regionId,
      routeId,
      salesExecutiveId,
      creditLimit,
      creditDays,
      creditDaysRegular,
      creditDaysCD,
      salesTarget,
      gst,
      pan,
      aadhar,
      isActive,
      // Product Hierarchy Permissions
      allowedBrands,
      allowedCategories,
      allowedSubcategories,
      allowedExtendedSubcategories,
      // Dealer-Specific Extra Discounts
      extraDiscounts,
    } = req.body;

    if (["openingBalance", "openingBalanceType", "openingBalanceDate", "openingBalanceAllocated"].some(
      (field) => Object.prototype.hasOwnProperty.call(req.body, field)
    )) {
      return res.status(409).json({
        success: false,
        code: "OPENING_BALANCE_IMMUTABLE",
        message: "Opening balance cannot be changed after dealer creation",
      });
    }

    // Check if dealer exists
    const existingDealer = await Dealer.findById(id);
    if (!existingDealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    const hasCreditLimit = Object.prototype.hasOwnProperty.call(req.body, "creditLimit");
    let normalizedCreditLimit;
    if (hasCreditLimit) {
      normalizedCreditLimit = Number(creditLimit);
      if (
        creditLimit === null ||
        (typeof creditLimit === "string" && creditLimit.trim() === "") ||
        !Number.isFinite(normalizedCreditLimit) ||
        normalizedCreditLimit <= 0
      ) {
        return res.status(400).json({
          success: false,
          code: "DEALER_CREDIT_LIMIT_REQUIRED",
          message: "Credit limit is required and must be a finite number greater than zero",
        });
      }
    } else if (!Number.isFinite(existingDealer.creditLimit) || existingDealer.creditLimit <= 0) {
      return res.status(400).json({
        success: false,
        code: "DEALER_CREDIT_LIMIT_REQUIRED",
        message: "This legacy dealer must be assigned a finite credit limit greater than zero before it can be updated",
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
    if (address !== undefined || altAddress !== undefined) {
      const newAddress = address !== undefined ? address : existingDealer.address;
      const newAlt = altAddress !== undefined ? altAddress : existingDealer.altAddress;
      if (!newAddress && !newAlt) {
        return res.status(400).json({
          success: false,
          message: "At least one address (Primary or Alternate) is required",
        });
      }
      if (address !== undefined) updateData.address = (address || newAlt || '').trim();
    }
    if (location !== undefined) updateData.location = location;
    if (altAddress !== undefined)
      updateData.altAddress = altAddress ? altAddress.trim() : "";
    if (dealerType !== undefined) updateData.dealerType = dealerType;
    if (dealerCategory !== undefined)
      updateData.dealerCategory = Array.isArray(dealerCategory)
        ? dealerCategory
        : [dealerCategory];
    if (regionId !== undefined) updateData.regionId = regionId;
    if (routeId !== undefined) updateData.routeId = routeId || null;
    if (salesExecutiveId !== undefined)
      updateData.salesExecutiveId = salesExecutiveId;
    if (hasCreditLimit)
      updateData.creditLimit = normalizedCreditLimit;
    if (creditDays !== undefined)
      updateData.creditDays = parseInt(creditDays) || 0;
    if (creditDaysRegular !== undefined)
      updateData.creditDaysRegular = parseInt(creditDaysRegular) || 0;
    if (creditDaysCD !== undefined)
      updateData.creditDaysCD = parseInt(creditDaysCD) || 0;
    if (salesTarget !== undefined)
      updateData.salesTarget = parseFloat(salesTarget) || 0;
    if (gst !== undefined) updateData.gst = gst ? gst.trim().toUpperCase() : "";
    if (pan !== undefined) updateData.pan = pan ? pan.trim().toUpperCase() : "";
    if (aadhar !== undefined) updateData.aadhar = aadhar ? aadhar.trim() : "";
    
    // Product Hierarchy Permissions
    if (allowedBrands !== undefined) updateData.allowedBrands = allowedBrands;
    if (allowedCategories !== undefined) updateData.allowedCategories = allowedCategories;
    if (allowedSubcategories !== undefined) updateData.allowedSubcategories = allowedSubcategories;
    if (allowedExtendedSubcategories !== undefined) updateData.allowedExtendedSubcategories = allowedExtendedSubcategories;
    
    // Dealer-Specific Extra Discounts
    if (extraDiscounts !== undefined) updateData.extraDiscounts = extraDiscounts;

    // Opening balance fields are immutable after creation (enforced above).
    
    // Documents are handled separately via upload endpoint
    // Remove document fields from update data to avoid casting errors
    if (isActive !== undefined) updateData.isActive = isActive;

    // Track old route ID for count update
    const oldRouteId = existingDealer.routeId;
    const newRouteId = routeId !== undefined ? (routeId || null) : oldRouteId;

    const dealer = await Dealer.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate('regionId', 'name code')
      .populate('salesExecutiveId', 'name empId email')
      .populate('dealerCategory', 'name color description')
      .populate('allowedBrands', 'name description')
      .populate('allowedCategories', 'name description')
      .populate('allowedSubcategories', 'name description')
      .populate('allowedExtendedSubcategories', 'name level description');

    // Update route dealer counts if route changed
    if (String(oldRouteId) !== String(newRouteId)) {
      if (oldRouteId) await updateRouteDealerCount(req.dbConnection, oldRouteId);
      if (newRouteId) await updateRouteDealerCount(req.dbConnection, newRouteId);
    }

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
    // Get models from company-specific connection
    const { Dealer } = getModels(req.dbConnection);
    
    const dealer = await Dealer.findById(req.params.id);

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    // Store route ID before deletion
    const routeId = dealer.routeId;

    await Dealer.findByIdAndDelete(req.params.id);

    // Update route dealer count if dealer was assigned to a route
    if (routeId) {
      await updateRouteDealerCount(req.dbConnection, routeId);
    }

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
    // Get models from company-specific connection
    const { Dealer } = getModels(req.dbConnection);
    
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

// Get complete dealer information for Sales Order Dashboard
export const getDealerCompleteInfo = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Dealer, DealerLedger, DealerInvoice, SalesOrder, PaymentAllocation } = getModels(req.dbConnection);
    
    const { id } = req.params;
    
    // 1. Get only dealer fields consumed by the order form.
    const dealer = await Dealer.findById(id)
      .select('code name creditLimit creditDays creditDaysRegular creditDaysCD dealerType extraDiscounts')
      .lean();
    if (!dealer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dealer not found' 
      });
    }
    
    // Independent dealer summary reads run together. Projections avoid loading
    // full ledger, allocation and order documents into memory.
    const [
      ledgerEntries,
      paymentAllocations,
      confirmedOrders,
      invoicedOrderIds,
      lastOrder,
      lastLedgerPayment,
      lastAllocationPayment,
      orderSummaryRows
    ] = await Promise.all([
      DealerLedger.find({ dealer: id })
        .select('entryDate dueDate debitAmount creditAmount transactionType')
        .sort({ entryDate: 1 })
        .lean(),
      PaymentAllocation.find({ partyId: id })
        .select('totalAllocated allocationDate')
        .lean(),
      SalesOrder.find({
        dealer: id,
        status: { $in: ['Confirmed', 'Processing', 'In Transit'] }
      })
        .select('_id creditAmount totalAmount')
        .lean(),
      DealerInvoice.distinct('salesOrder', {
        dealer: id,
        salesOrder: { $ne: null },
        status: { $nin: ['Cancelled', 'Rejected'] }
      }),
      SalesOrder.findOne({ dealer: id })
        .select('orderDate orderNumber totalAmount products status')
        .sort({ orderDate: -1 })
        .lean(),
      DealerLedger.findOne({ dealer: id, transactionType: 'Payment' })
        .select('entryDate creditAmount')
        .sort({ entryDate: -1 })
        .lean(),
      PaymentAllocation.findOne({ partyId: id })
        .select('allocationDate totalAllocated')
        .sort({ allocationDate: -1 })
        .lean(),
      SalesOrder.aggregate([
        { $match: { dealer: dealer._id } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalPurchaseValue: { $sum: { $ifNull: ['$totalAmount', 0] } }
          }
        }
      ])
    ]);
    
    // Calculate outstanding from ledger entries
    let currentOutstanding = ledgerEntries.reduce((sum, entry) => {
      return sum + (entry.debitAmount || 0) - (entry.creditAmount || 0);
    }, 0);
    
    // Subtract payment allocations (these reduce outstanding)
    const totalAllocatedPayments = paymentAllocations.reduce((sum, allocation) => {
      return sum + (allocation.totalAllocated || 0);
    }, 0);
    
    // Adjust outstanding by subtracting allocated payments
    currentOutstanding = currentOutstanding - totalAllocatedPayments;
    
    const invoicedOrderIdStrings = new Set(invoicedOrderIds.map(orderId => orderId.toString()));
    
    // Sum confirmed orders that are not yet invoiced.
    const confirmedOrdersAmount = confirmedOrders.reduce((sum, order) => {
      const isInvoiced = invoicedOrderIdStrings.has(order._id.toString());
      // Use creditAmount (conservative: excludes level discount) if available,
      // otherwise fall back to totalAmount for older orders.
      return isInvoiced ? sum : sum + (order.creditAmount || order.totalAmount || 0);
    }, 0);
    
    // Total credit used = actual ledger outstanding + confirmed-but-not-invoiced orders
    const totalCreditUsed = currentOutstanding + confirmedOrdersAmount;
    
    const availableCredit = Math.max(0, dealer.creditLimit - totalCreditUsed);
    const utilizationPercent = dealer.creditLimit > 0 
      ? Math.round((totalCreditUsed / dealer.creditLimit) * 100) 
      : 0;
    
    let creditStatusType = 'good';
    if (utilizationPercent > 90 || totalCreditUsed > dealer.creditLimit) {
      creditStatusType = 'exceeded';
    } else if (utilizationPercent > 70) {
      creditStatusType = 'warning';
    }
    
    // 4. Calculate payment status and overdue amounts
    const today = new Date();
    let overdueAmount = 0;
    
    // Since we now have the correct outstanding (including payment allocations),
    // we should only consider overdue if there's actually outstanding balance
    if (currentOutstanding > 0) {
      // Find overdue entries (entries with dueDate passed)
      // But we need to recalculate running balance considering payment allocations
      let runningBalance = 0;
      
      for (const entry of ledgerEntries) {
        runningBalance += (entry.debitAmount || 0) - (entry.creditAmount || 0);
        
        if (entry.dueDate && runningBalance > 0) {
          const dueDate = new Date(entry.dueDate);
          if (today > dueDate) {
            // This entry is overdue - but only count if we still have outstanding
            // after considering payment allocations
            const entryOverdue = Math.min(runningBalance, currentOutstanding);
            if (entryOverdue > 0) {
              overdueAmount += entryOverdue;
            }
          }
        }
      }
      
      // If outstanding is 0 or negative (credit balance), overdue should be 0
      if (currentOutstanding <= 0) {
        overdueAmount = 0;
      }
    }
    
    // Determine which payment source is the most recent.
    let lastPayment = null;
    let lastPaymentDate = null;
    let lastPaymentAmount = 0;
    
    if (lastLedgerPayment && lastAllocationPayment) {
      // Compare dates and use the most recent
      const ledgerDate = new Date(lastLedgerPayment.entryDate);
      const allocationDate = new Date(lastAllocationPayment.allocationDate);
      
      if (allocationDate > ledgerDate) {
        lastPaymentDate = lastAllocationPayment.allocationDate;
        lastPaymentAmount = lastAllocationPayment.totalAllocated || 0;
      } else {
        lastPaymentDate = lastLedgerPayment.entryDate;
        lastPaymentAmount = lastLedgerPayment.creditAmount || 0;
      }
    } else if (lastAllocationPayment) {
      lastPaymentDate = lastAllocationPayment.allocationDate;
      lastPaymentAmount = lastAllocationPayment.totalAllocated || 0;
    } else if (lastLedgerPayment) {
      lastPaymentDate = lastLedgerPayment.entryDate;
      lastPaymentAmount = lastLedgerPayment.creditAmount || 0;
    }
    
    // Determine payment status
    let paymentStatusType = 'good';
    let canCreateOrder = true;
    let blockReason = null;
    
    // IMPORTANT: Different handling for overdue vs credit limit exceeded
    // - Overdue payment (past credit days): BLOCK completely - must collect payment
    // - Credit limit exceeded: Allow Pending order - requires admin approval
    
    if (overdueAmount > 0) {
      // STRICT BLOCK: Payment is overdue (past credit days)
      paymentStatusType = 'overdue';
      canCreateOrder = false;
      blockReason = `Payment overdue: ₹${overdueAmount.toLocaleString()}. Please collect payment before creating new orders.`;
    } else if (totalCreditUsed > dealer.creditLimit) {
      // WARNING: Credit limit exceeded but no overdue payment
      // Allow creating Pending orders that require admin approval
      paymentStatusType = 'exceeded';
      canCreateOrder = true; // Allow Pending orders
      blockReason = null; // No block, just warning
    }
    
    // Note: Credit limit warnings are shown in creditStatus, not paymentStatus
    
    // 5. Get dealer's extra discounts (instead of global available discounts)
    const extraDiscounts = dealer.extraDiscounts?.filter(discount => discount.isActive) || [];
    
    // 6. Summary comes from the database instead of materializing every order.
    const orderSummary = orderSummaryRows[0] || { totalOrders: 0, totalPurchaseValue: 0 };
    const totalOrders = orderSummary.totalOrders;
    const totalPurchaseValue = orderSummary.totalPurchaseValue;
    const averageOrderValue = totalOrders > 0 ? Math.round(totalPurchaseValue / totalOrders) : 0;
    const lastOrderDaysAgo = lastOrder 
      ? Math.floor((today - new Date(lastOrder.orderDate)) / (1000 * 60 * 60 * 24))
      : null;

    // Financial values below come from the same atomic canonical service used
    // by Sales Order create/edit/confirm and Dealer Invoice approval.
    const canonicalExposure = await getDealerCreditExposure(req.dbConnection, id);
    const canonicalPaymentStatus = canonicalExposure.overdueAmount > 0
      ? 'overdue'
      : (canonicalExposure.isOverlimit ? 'exceeded' : 'good');
    
    // 7. Prepare response
    const response = {
      success: true,
      dealer: {
        _id: dealer._id,
        code: dealer.code,
        name: dealer.name,
        creditLimit: dealer.creditLimit,
        creditDays: dealer.creditDays, // Legacy field
        creditDaysRegular: dealer.creditDaysRegular || dealer.creditDays || 0,
        creditDaysCD: dealer.creditDaysCD || dealer.creditDays || 0,
        dealerType: dealer.dealerType
      },
      creditStatus: {
        creditLimit: canonicalExposure.creditLimit,
        limitConfigured: canonicalExposure.limitConfigured,
        currentOutstanding: canonicalExposure.ledgerBalance,
        invoiceOutstanding: canonicalExposure.invoiceOutstanding,
        confirmedOrdersAmount: canonicalExposure.uninvoicedSalesOrderAmount,
        totalCreditUsed: canonicalExposure.totalExposure,
        availableCredit: canonicalExposure.availableCredit,
        utilizationPercent: canonicalExposure.utilizationPercent,
        status: canonicalExposure.status,
        asOf: canonicalExposure.asOf
      },
      lastPurchase: lastOrder ? {
        orderDate: lastOrder.orderDate,
        orderNumber: lastOrder.orderNumber,
        orderAmount: lastOrder.totalAmount,
        productCount: lastOrder.products.length,
        status: lastOrder.status,
        products: lastOrder.products.slice(0, 5).map(p => ({
          name: p.productName,
          quantity: p.quantity
        }))
      } : null,
      paymentStatus: {
        totalOutstanding: canonicalExposure.ledgerBalance,
        confirmedOrdersAmount: canonicalExposure.uninvoicedSalesOrderAmount,
        totalCreditUsed: canonicalExposure.totalExposure,
        overdueAmount: canonicalExposure.overdueAmount,
        lastPaymentDate: canonicalExposure.lastPaymentDate,
        lastPaymentAmount: canonicalExposure.lastPaymentAmount,
        status: canonicalPaymentStatus,
        canCreateOrder: canonicalExposure.canCreateOrder,
        blockReason: canonicalExposure.blockReason
      },
      extraDiscounts: extraDiscounts.map(d => ({
        _id: d._id,
        targetType: d.targetType,
        targetId: d.targetId,
        targetName: d.targetName,
        discountPercentage: d.discountPercentage,
        description: d.description,
        isActive: d.isActive,
        createdAt: d.createdAt
      })),
      summary: {
        totalOrders,
        totalPurchaseValue: Math.round(totalPurchaseValue),
        averageOrderValue,
        lastOrderDaysAgo
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Error getting dealer complete info:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};


// Get products accessible to a specific dealer based on their hierarchy permissions
export const getDealerAccessibleProducts = async (req, res) => {
  console.log("🚀 getDealerAccessibleProducts CONTROLLER CALLED!");
  console.log("🚀 Request params:", req.params);
  console.log("🚀 Request query:", req.query);
  
  try {
    // Get models from company-specific connection
    const { Dealer, Brand, Category, Subcategory, ExtendedSubcategory, Product } = getModels(req.dbConnection);
    
    const { id: dealerId } = req.params;
    console.log("🔍 getDealerAccessibleProducts called with dealerId:", dealerId);
    
    const {
      page = 1,
      limit = 50,
      search = "",
      brandId,
      categoryId,
      subcategoryId,
      extendedSubcategoryId,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    console.log("🔍 Query parameters:", { page, limit, search, brandId, categoryId, subcategoryId, extendedSubcategoryId });

    // Parse pagination parameters
    const pageNumber = safeParseInt(page, 1);
    const limitNumber = safeParseInt(limit, 50);
    const skip = (pageNumber - 1) * limitNumber;

    // Get dealer with hierarchy permissions
    console.log("🔍 Fetching dealer with ID:", dealerId);
    const dealer = await Dealer.findById(dealerId)
      .populate('allowedBrands', '_id name')
      .populate('allowedCategories', '_id name')
      .populate('allowedSubcategories', '_id name')
      .populate('allowedExtendedSubcategories', '_id name level');

    if (!dealer) {
      console.log("❌ Dealer not found with ID:", dealerId);
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    console.log("✅ Dealer found:", dealer.name);
    console.log("📊 Dealer permissions:");
    console.log("  - Allowed Brands:", dealer.allowedBrands?.length || 0);
    console.log("  - Allowed Categories:", dealer.allowedCategories?.length || 0);
    console.log("  - Allowed Subcategories:", dealer.allowedSubcategories?.length || 0);
    console.log("  - Allowed Extended:", dealer.allowedExtendedSubcategories?.length || 0);

    // Import permission utility
    const { calculateProductFilter } = await import("../utils/dealerProductPermissions.js");

    // Use smart hierarchical filtering
    console.log("🎯 Calculating smart hierarchical product filter...");
    const productFilter = await calculateProductFilter(dealer, req.dbConnection);
    console.log("🔍 Smart filter result:", JSON.stringify(productFilter, null, 2));

    // Apply search filter if provided
    if (search) {
      const searchConditions = [
        { itemName: { $regex: search, $options: "i" } },
        { productCode: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
      
      // Combine with existing filter
      if (productFilter.$or) {
        // If filter already has $or, wrap both in $and
        productFilter.$and = [
          { $or: productFilter.$or },
          { $or: searchConditions }
        ];
        delete productFilter.$or;
      } else {
        // Add search as additional $and condition
        if (!productFilter.$and) {
          productFilter.$and = [];
        }
        productFilter.$and.push({ $or: searchConditions });
      }
      console.log("🔍 Added search filter for:", search);
    }

    // Apply additional filters from query parameters
    if (brandId && brandId !== "All") {
      const allowedBrandIds = dealer.allowedBrands.map(brand => 
        typeof brand === 'object' ? brand._id.toString() : brand.toString()
      );
      if (allowedBrandIds.includes(brandId)) {
        productFilter.brand = brandId;
      } else {
        return res.status(403).json({
          success: false,
          message: "Access denied: Brand not allowed for this dealer",
        });
      }
    }

    if (categoryId && categoryId !== "All") {
      const allowedCategoryIds = dealer.allowedCategories.map(cat => 
        typeof cat === 'object' ? cat._id.toString() : cat.toString()
      );
      const allowedBrandIds = dealer.allowedBrands?.map(b => 
        typeof b === 'object' ? b._id.toString() : b.toString()
      ) || [];
      
      // Allow if: category is explicitly allowed OR dealer has brand-level access (which implies all categories under that brand)
      if (allowedCategoryIds.includes(categoryId) || allowedBrandIds.length > 0) {
        productFilter.category = categoryId;
      } else {
        return res.status(403).json({
          success: false,
          message: "Access denied: Category not allowed for this dealer",
        });
      }
    }

    if (subcategoryId && subcategoryId !== "All") {
      const allowedSubcategoryIds = dealer.allowedSubcategories.map(sub => 
        typeof sub === 'object' ? sub._id.toString() : sub.toString()
      );
      const allowedBrandIds = dealer.allowedBrands?.map(b => 
        typeof b === 'object' ? b._id.toString() : b.toString()
      ) || [];
      
      // Allow if explicitly allowed OR dealer has brand-level access
      if (allowedSubcategoryIds.includes(subcategoryId) || allowedBrandIds.length > 0) {
        productFilter.subcategory = subcategoryId;
      } else {
        return res.status(403).json({
          success: false,
          message: "Access denied: Subcategory not allowed for this dealer",
        });
      }
    }

    if (extendedSubcategoryId && extendedSubcategoryId !== "All") {
      const allowedExtendedIds = dealer.allowedExtendedSubcategories.map(ext => 
        typeof ext === 'object' ? ext._id.toString() : ext.toString()
      );
      if (allowedExtendedIds.includes(extendedSubcategoryId)) {
        // Only check subcategory1 (Level 1)
        productFilter.subcategory1 = extendedSubcategoryId;
      } else {
        return res.status(403).json({
          success: false,
          message: "Access denied: Extended subcategory not allowed for this dealer",
        });
      }
    }

    console.log("🔍 Final product filter:", JSON.stringify(productFilter, null, 2));

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get total count for pagination
    const total = await Product.countDocuments(productFilter);
    console.log("📊 Total products matching filter:", total);

    // If no products match the hierarchy filter, it might be because products don't have hierarchy fields set
    // In this case, return all products as a fallback (temporary solution)
    let finalFilter = productFilter;
    let finalTotal = total;
    if (total === 0) {
      console.log("⚠️ No products match hierarchy filter. Checking if products have hierarchy fields...");
      
      // Check if any products have hierarchy fields
      const sampleProduct = await Product.findOne({}).select('brand category subcategory subcategory1');
      if (sampleProduct && !sampleProduct.brand && !sampleProduct.category && !sampleProduct.subcategory && !sampleProduct.subcategory1) {
        console.log("⚠️ Products don't have hierarchy fields set. Returning all products as fallback.");
        finalFilter = { status: 'active' }; // Return all active products
        finalTotal = await Product.countDocuments(finalFilter);
      }
    }

    console.log("📊 Final total products:", finalTotal);

    // Get products with pagination
    const products = await Product.find(finalFilter)
      .sort(sort)
      .limit(limitNumber)
      .skip(skip)
      .populate('brand', '_id name')
      .populate('category', '_id name')
      .populate('subcategory', '_id name')
      .populate('subcategory1', '_id name level')
      .populate('subcategory2', '_id name level')
      .select("-__v")
      .lean();

    console.log("📦 Products returned:", products.length);
    console.log("📦 Sample products:", products.slice(0, 3).map(p => ({
      name: p.itemName,
      code: p.productCode,
      brand: p.brand?.toString(),
      category: p.category?.toString(),
      subcategory: p.subcategory?.toString(),
      subcategory1: p.subcategory1?.toString()
    })));

    // Calculate pagination metadata
    const totalPages = Math.ceil(finalTotal / limitNumber);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalItems: finalTotal,
        itemsPerPage: limitNumber,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNumber + 1 : null,
        prevPage: hasPrevPage ? pageNumber - 1 : null,
      },
      dealerInfo: {
        dealerId: dealer._id,
        dealerName: dealer.name,
        dealerCode: dealer.code,
        allowedBrands: dealer.allowedBrands?.length || 0,
        allowedCategories: dealer.allowedCategories?.length || 0,
        allowedSubcategories: dealer.allowedSubcategories?.length || 0,
        allowedExtended: dealer.allowedExtendedSubcategories?.length || 0,
      },
      appliedFilters: {
        search,
        brandId: brandId || null,
        categoryId: categoryId || null,
        subcategoryId: subcategoryId || null,
        extendedSubcategoryId: extendedSubcategoryId || null,
      },
      debug: {
        hierarchyFilterApplied: total > 0,
        fallbackToAllProducts: total === 0 && finalTotal > 0,
        originalFilter: productFilter,
        finalFilter: finalFilter
      }
    });
  } catch (error) {
    console.error("Get dealer accessible products error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get dealer's allowed hierarchy options for filtering
export const getDealerHierarchyOptions = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Dealer, Brand, Category, Subcategory, ExtendedSubcategory } = getModels(req.dbConnection);
    
    const { id: dealerId } = req.params;

    // Get dealer with hierarchy permissions
    const dealer = await Dealer.findById(dealerId)
      .populate('allowedBrands', '_id name description')
      .populate('allowedCategories', '_id name description brandId')
      .populate('allowedSubcategories', '_id name description brandId categoryId')
      .populate('allowedExtendedSubcategories', '_id name level description brandId categoryId subcategoryId');

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    // Organize hierarchy options
    const hierarchyOptions = {
      brands: dealer.allowedBrands || [],
      categories: dealer.allowedCategories || [],
      subcategories: dealer.allowedSubcategories || [],
      extendedSubcategories: dealer.allowedExtendedSubcategories || [],
    };

    res.json({
      success: true,
      dealerInfo: {
        dealerId: dealer._id,
        dealerName: dealer.name,
        dealerCode: dealer.code,
      },
      hierarchyOptions,
      summary: {
        totalBrands: hierarchyOptions.brands.length,
        totalCategories: hierarchyOptions.categories.length,
        totalSubcategories: hierarchyOptions.subcategories.length,
        totalExtended: hierarchyOptions.extendedSubcategories.length,
      },
    });
  } catch (error) {
    console.error("Get dealer hierarchy options error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get dealer outstanding balance
export const getDealerOutstanding = async (req, res) => {
  try {
    const exposure = await getDealerCreditExposure(req.dbConnection, req.params.id);
    const paymentStatus = exposure.overdueAmount > 0
      ? 'overdue'
      : (exposure.isOverlimit ? 'exceeded' : 'current');

    return res.json({
      success: true,
      dealerInfo: {
        dealerId: exposure.dealer._id,
        dealerName: exposure.dealer.name,
        dealerCode: exposure.dealer.code,
        creditLimit: exposure.creditLimit,
        creditDays: exposure.dealer.creditDays
      },
      creditStatus: {
        creditLimit: exposure.creditLimit,
        limitConfigured: exposure.limitConfigured,
        currentOutstanding: exposure.ledgerBalance,
        invoiceOutstanding: exposure.invoiceOutstanding,
        confirmedOrdersAmount: exposure.uninvoicedSalesOrderAmount,
        totalCreditUsed: exposure.totalExposure,
        availableCredit: exposure.availableCredit,
        utilizationPercent: exposure.utilizationPercent,
        status: exposure.status,
        asOf: exposure.asOf
      },
      paymentStatus: {
        totalOutstanding: exposure.ledgerBalance,
        confirmedOrdersAmount: exposure.uninvoicedSalesOrderAmount,
        totalCreditUsed: exposure.totalExposure,
        overdueAmount: exposure.overdueAmount,
        lastPaymentDate: exposure.lastPaymentDate,
        lastPaymentAmount: exposure.lastPaymentAmount,
        status: paymentStatus,
        canCreateOrder: exposure.canCreateOrder,
        blockReason: exposure.blockReason
      },
      summary: {
        creditUtilization: `${exposure.utilizationPercent}%`,
        paymentDue: exposure.overdueAmount > 0,
        creditExceeded: exposure.isOverlimit
      }
    });
  } catch (error) {
    console.error('Get dealer outstanding error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
};


// Get dealer credit limit approval history (last 30 days)
export const getDealerCreditApprovalHistory = async (req, res) => {
  try {
    const { Dealer, SalesOrder } = getModels(req.dbConnection);
    const dealer = await Dealer.findById(req.params.id).lean();
    if (!dealer) {
      return res.status(404).json({ success: false, message: 'Dealer not found' });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orders = await SalesOrder.find({
      dealer: req.params.id,
      $or: [
        { 'creditOverlimit.history.performedAt': { $gte: thirtyDaysAgo } },
        { 'creditOverlimit.approvedAt': { $gte: thirtyDaysAgo } },
        { 'creditOverlimit.rejectedAt': { $gte: thirtyDaysAgo } }
      ]
    })
      .populate('creditOverlimit.history.performedBy', 'name email role')
      .populate('creditOverlimit.approvedBy', 'name email role')
      .populate('creditOverlimit.rejectedBy', 'name email role')
      .lean();

    const approvalHistory = [];
    for (const order of orders) {
      const events = (order.creditOverlimit?.history || [])
        .filter((event) => event.performedAt && new Date(event.performedAt) >= thirtyDaysAgo);

      if (events.length > 0) {
        for (const event of events) {
          approvalHistory.push({
            type: 'sales_order',
            action: event.action,
            orderId: order._id,
            orderNumber: order.orderNumber,
            orderDate: order.orderDate,
            status: order.status,
            amount: Number(event.orderAmount ?? order.creditAmount ?? 0),
            creditAmount: Number(event.orderAmount ?? order.creditAmount ?? 0),
            approvedAt: event.performedAt,
            performedAt: event.performedAt,
            approvedBy: event.performedBy || null,
            performedBy: event.performedBy || null,
            notes: event.notes || '',
            creditLimit: Number(event.creditLimit ?? 0),
            outstandingBefore: Number(event.currentOutstanding ?? 0),
            newOutstanding: Number(event.newOutstanding ?? 0),
            overlimitAmount: Number(event.overlimitAmount ?? 0)
          });
        }
        continue;
      }

      // Legacy fallback for approvals created before append-only history existed.
      if (order.creditOverlimit?.approvedBy && order.creditOverlimit?.approvedAt) {
        approvalHistory.push({
          type: 'sales_order',
          action: 'approved',
          orderId: order._id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          status: order.status,
          amount: Number(order.creditAmount ?? order.creditOverlimit.orderAmount ?? 0),
          creditAmount: Number(order.creditAmount ?? order.creditOverlimit.orderAmount ?? 0),
          approvedAt: order.creditOverlimit.approvedAt,
          performedAt: order.creditOverlimit.approvedAt,
          approvedBy: order.creditOverlimit.approvedBy,
          performedBy: order.creditOverlimit.approvedBy,
          notes: order.creditOverlimit.approvalNotes || '',
          creditLimit: Number(order.creditOverlimit.creditLimit ?? 0),
          outstandingBefore: Number(order.creditOverlimit.currentOutstanding ?? 0),
          newOutstanding: Number(order.creditOverlimit.newOutstanding ?? 0),
          overlimitAmount: Number(order.creditOverlimit.overlimitAmount ?? 0),
          legacy: true
        });
      }
    }

    approvalHistory.sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt));
    return res.json({
      success: true,
      dealerInfo: {
        dealerId: dealer._id,
        dealerName: dealer.name,
        dealerCode: dealer.code,
        creditLimit: dealer.creditLimit
      },
      approvalHistory,
      totalApprovalsLast30Days: approvalHistory.filter((event) => event.action === 'approved').length,
      totalEventsLast30Days: approvalHistory.length,
      periodStart: thirtyDaysAgo,
      periodEnd: new Date()
    });
  } catch (error) {
    console.error('Get dealer credit approval history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching credit approval history',
      error: error.message
    });
  }
};
