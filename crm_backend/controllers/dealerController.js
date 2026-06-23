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
      .populate('regionId', 'name code')
      .populate('routeId', 'name code')
      .populate('salesExecutiveId', 'name empId email')
      .populate('dealerCategory', 'name color description')
      .populate('allowedBrands', 'name description')
      .populate('allowedCategories', 'name description')
      .populate('allowedSubcategories', 'name description')
      .populate('allowedExtendedSubcategories', 'name level description')
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
  try {
    // Get models from company-specific connection
    const { Dealer } = getModels(req.dbConnection);
    
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
      creditLimit: parseFloat(creditLimit) || 0,
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
      openingBalance: parseFloat(openingBalance) || 0,
      openingBalanceType: openingBalanceType === 'Cr' ? 'Cr' : 'Dr',
      openingBalanceDate: openingBalanceDate ? new Date(openingBalanceDate) : null,
      // Documents will be handled separately via upload endpoint
      panDocument: [],
      aadharDocument: [],
      gstDocument: [],
      documents: [],
      createdBy: req.user._id,
    };

    const dealer = await Dealer.create(dealerData);

    // Seed the opening balance (go-live migration): a dealer-ledger opening
    // entry (so it flows into AR / aging / balance sheet) + a balancing JV.
    const obAmount = parseFloat(openingBalance) || 0;
    if (obAmount > 0) {
      try {
        const { DealerLedger } = getModels(req.dbConnection);
        const obType = openingBalanceType === 'Cr' ? 'Cr' : 'Dr';
        const obDate = openingBalanceDate ? new Date(openingBalanceDate) : new Date();

        await DealerLedger.create({
          dealer: dealer._id,
          dealerName: dealer.name,
          dealerCode: dealer.code,
          entryDate: obDate,
          transactionType: 'Opening Balance',
          // Dr = dealer owes us (debit); Cr = we owe dealer / advance (credit)
          debitAmount: obType === 'Dr' ? obAmount : 0,
          creditAmount: obType === 'Cr' ? obAmount : 0,
          runningBalance: 0, // computed by pre-save hook
          description: `Opening Balance (${obType}) brought forward`,
          status: 'Active',
          createdBy: req.user._id,
        });

        const { createDealerOpeningEntry } = await import('../services/accountingService.js');
        await createDealerOpeningEntry(
          { dealer, amount: obAmount, type: obType, date: obDate },
          req.dbConnection,
          req.user._id
        );
      } catch (obErr) {
        console.error('⚠️ Failed to seed dealer opening balance (non-critical):', obErr.message);
      }
    }

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
      // Opening Balance
      openingBalance,
      openingBalanceType,
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
    if (creditLimit !== undefined)
      updateData.creditLimit = parseFloat(creditLimit) || 0;
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

    // Opening Balance (only set if provided; don't overwrite once set unless explicitly changed)
    if (openingBalance !== undefined) {
      updateData.openingBalance = parseFloat(openingBalance) || 0;
      updateData.openingBalanceType = openingBalanceType || 'Dr';
    }
    
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
    
    // Import DiscountMapping schema and create model
    const { discountMappingSchema } = await import("../models/DiscountMapping.js");
    const DiscountMapping = req.dbConnection.models.DiscountMapping || req.dbConnection.model('DiscountMapping', discountMappingSchema);
    
    // 1. Get dealer basic info
    const dealer = await Dealer.findById(id);
    if (!dealer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dealer not found' 
      });
    }
    
    // 2. Calculate credit status from ledger AND payment allocations
    const ledgerEntries = await DealerLedger.find({ dealer: id }).sort({ entryDate: 1 });
    
    // Get payment allocations (these are NOT in DealerLedger but should be counted)
    const paymentAllocations = await PaymentAllocation.find({ partyId: id }).lean();
    
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
    
    // Calculate confirmed orders amount (orders confirmed but not yet invoiced)
    // These are orders in Confirmed/Processing/In Transit status that don't have an invoice yet
    const confirmedOrders = await SalesOrder.find({
      dealer: id,
      status: { $in: ['Confirmed', 'Processing', 'In Transit'] }
    }).lean();
    
    // Check which confirmed orders already have invoices (to avoid double counting)
    const invoicedOrderIds = await DealerInvoice.distinct('salesOrder', {
      dealer: id,
      salesOrder: { $ne: null },
      status: { $nin: ['Cancelled', 'Rejected'] }
    });
    const invoicedOrderIdStrings = invoicedOrderIds.map(id => id.toString());
    
    // Sum up confirmed orders that are NOT yet invoiced
    const confirmedOrdersAmount = confirmedOrders.reduce((sum, order) => {
      const isInvoiced = invoicedOrderIdStrings.includes(order._id.toString());
      // Use creditAmount (conservative: excludes level discount) if available,
      // otherwise fall back to totalAmount for older orders.
      return isInvoiced ? sum : sum + (order.creditAmount || order.totalAmount || 0);
    }, 0);
    
    // Total credit used = actual ledger outstanding + confirmed-but-not-invoiced orders
    const totalCreditUsed = currentOutstanding + confirmedOrdersAmount;
    
    console.log(`📊 Dealer ${dealer.name} Outstanding Calculation:`);
    console.log(`   Ledger Balance: ₹${(currentOutstanding + totalAllocatedPayments).toLocaleString()}`);
    console.log(`   Payment Allocations: ₹${totalAllocatedPayments.toLocaleString()}`);
    console.log(`   Invoice Outstanding: ₹${currentOutstanding.toLocaleString()}`);
    console.log(`   Confirmed Orders (not invoiced): ₹${confirmedOrdersAmount.toLocaleString()} (${confirmedOrders.filter(o => !invoicedOrderIdStrings.includes(o._id.toString())).length} orders)`);
    console.log(`   Total Credit Used: ₹${totalCreditUsed.toLocaleString()}`);
    
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
    
    // 3. Get last purchase
    const lastOrder = await SalesOrder.findOne({ dealer: id })
      .sort({ orderDate: -1 })
      .populate('products.product', 'itemName');
    
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
    
    console.log(`📊 Overdue Calculation:`);
    console.log(`   Current Outstanding: ₹${currentOutstanding.toLocaleString()}`);
    console.log(`   Overdue Amount: ₹${overdueAmount.toLocaleString()}`);
    
    // Get last payment - check both DealerLedger and PaymentAllocation
    const lastLedgerPayment = await DealerLedger.findOne({ 
      dealer: id, 
      transactionType: 'Payment' 
    }).sort({ entryDate: -1 });
    
    const lastAllocationPayment = await PaymentAllocation.findOne({ 
      partyId: id 
    }).sort({ allocationDate: -1 });
    
    // Determine which is the most recent payment
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
    
    // 6. Calculate summary statistics
    const allOrders = await SalesOrder.find({ dealer: id });
    const totalOrders = allOrders.length;
    const totalPurchaseValue = allOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const averageOrderValue = totalOrders > 0 ? Math.round(totalPurchaseValue / totalOrders) : 0;
    const lastOrderDaysAgo = lastOrder 
      ? Math.floor((today - new Date(lastOrder.orderDate)) / (1000 * 60 * 60 * 24))
      : null;
    
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
        creditLimit: dealer.creditLimit,
        currentOutstanding: Math.round(currentOutstanding),
        confirmedOrdersAmount: Math.round(confirmedOrdersAmount),
        totalCreditUsed: Math.round(totalCreditUsed),
        availableCredit: Math.round(availableCredit),
        utilizationPercent,
        status: creditStatusType
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
        totalOutstanding: Math.round(currentOutstanding),
        confirmedOrdersAmount: Math.round(confirmedOrdersAmount),
        totalCreditUsed: Math.round(totalCreditUsed),
        overdueAmount: Math.round(overdueAmount),
        lastPaymentDate: lastPaymentDate,
        lastPaymentAmount: lastPaymentAmount,
        status: paymentStatusType,
        canCreateOrder,
        blockReason
      },
      extraDiscounts: extraDiscounts.map(d => ({
        _id: d._id,
        targetType: d.targetType,
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
    const productFilter = await calculateProductFilter(dealer);
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
    if (total === 0) {
      console.log("⚠️ No products match hierarchy filter. Checking if products have hierarchy fields...");
      
      // Check if any products have hierarchy fields
      const sampleProduct = await Product.findOne({}).select('brand category subcategory subcategory1');
      if (sampleProduct && !sampleProduct.brand && !sampleProduct.category && !sampleProduct.subcategory && !sampleProduct.subcategory1) {
        console.log("⚠️ Products don't have hierarchy fields set. Returning all products as fallback.");
        finalFilter = { status: 'active' }; // Return all active products
      }
    }

    // Recalculate total with final filter
    const finalTotal = await Product.countDocuments(finalFilter);
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
      .select("-__v");

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
    // Get models from company-specific connection
    const { Dealer, DealerLedger, PaymentAllocation } = getModels(req.dbConnection);
    
    const { id } = req.params;

    // Get dealer
    const dealer = await Dealer.findById(id);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    // Get all ledger entries for this dealer
    const ledgerEntries = await DealerLedger.find({ dealer: id }).sort({ entryDate: 1 });
    
    // Calculate current outstanding balance
    const currentOutstanding = ledgerEntries.reduce((sum, entry) => {
      return sum + (entry.debitAmount || 0) - (entry.creditAmount || 0);
    }, 0);
    
    // Calculate available credit
    const availableCredit = Math.max(0, dealer.creditLimit - currentOutstanding);
    
    // Calculate utilization percentage
    const utilizationPercent = dealer.creditLimit > 0 
      ? Math.round((currentOutstanding / dealer.creditLimit) * 100) 
      : 0;
    
    // Determine credit status
    let creditStatusType = 'good';
    if (utilizationPercent > 90 || currentOutstanding > dealer.creditLimit) {
      creditStatusType = 'exceeded';
    } else if (utilizationPercent > 70) {
      creditStatusType = 'warning';
    }

    // Calculate overdue amount (entries older than credit days)
    const creditDays = dealer.creditDays || 30;
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - creditDays);
    
    const overdueAmount = ledgerEntries
      .filter(entry => entry.entryDate < overdueDate && entry.debitAmount > 0)
      .reduce((sum, entry) => sum + (entry.debitAmount || 0), 0);

    // Get last payment
    const lastPayment = ledgerEntries
      .filter(entry => entry.creditAmount > 0)
      .sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate))[0];

    const lastPaymentDate = lastPayment?.entryDate || null;
    const lastPaymentAmount = lastPayment?.creditAmount || 0;

    // Determine payment status
    let paymentStatusType = 'current';
    let canCreateOrder = true;
    let blockReason = null;

    // IMPORTANT: Different handling for overdue vs credit limit exceeded
    // - Overdue payment (past credit days): BLOCK completely - must collect payment
    // - Credit limit exceeded: Allow Pending order - requires admin approval
    
    if (overdueAmount > 0) {
      // STRICT BLOCK: Payment is overdue (past credit days)
      paymentStatusType = 'overdue';
      canCreateOrder = false;
      blockReason = `₹${overdueAmount.toLocaleString()} payment is overdue (${creditDays} days). Please collect payment first.`;
    } else if (currentOutstanding > dealer.creditLimit) {
      // WARNING: Credit limit exceeded but no overdue payment
      // Allow creating Pending orders that require admin approval
      paymentStatusType = 'exceeded';
      canCreateOrder = true; // Allow Pending orders
      blockReason = null; // No block, just warning
    }

    res.json({
      success: true,
      dealerInfo: {
        dealerId: dealer._id,
        dealerName: dealer.name,
        dealerCode: dealer.code,
        creditLimit: dealer.creditLimit,
        creditDays: dealer.creditDays,
      },
      creditStatus: {
        creditLimit: dealer.creditLimit,
        currentOutstanding: Math.round(currentOutstanding),
        availableCredit: Math.round(availableCredit),
        utilizationPercent,
        status: creditStatusType,
      },
      paymentStatus: {
        totalOutstanding: Math.round(currentOutstanding),
        overdueAmount: Math.round(overdueAmount),
        lastPaymentDate: lastPaymentDate,
        lastPaymentAmount: lastPaymentAmount,
        status: paymentStatusType,
        canCreateOrder,
        blockReason,
      },
      summary: {
        totalLedgerEntries: ledgerEntries.length,
        creditUtilization: `${utilizationPercent}%`,
        paymentDue: overdueAmount > 0,
        creditExceeded: currentOutstanding > dealer.creditLimit,
      },
    });
  } catch (error) {
    console.error("Get dealer outstanding error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// Get dealer credit limit approval history (last 30 days)
export const getDealerCreditApprovalHistory = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Dealer, DealerInvoice, DealerLedger, SalesOrder } = getModels(req.dbConnection);
    
    const { id } = req.params;

    // Get dealer
    const dealer = await Dealer.findById(id);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const approvalHistory = [];

    // 1. Check INVOICES that exceeded credit limit (new system)
    const invoices = await DealerInvoice.find({
      dealer: id,
      approvedAt: { $gte: thirtyDaysAgo },
      status: { $in: ['Approved', 'Confirmed', 'Processing', 'Delivered'] }
    })
    .populate('approvedBy', 'name email role')
    .sort({ approvedAt: -1 });

    for (const invoice of invoices) {
      // Get ledger state at the time of invoice approval
      const ledgerEntriesBeforeInvoice = await DealerLedger.find({
        dealer: id,
        createdAt: { $lt: invoice.approvedAt }
      }).sort({ createdAt: 1 });
      
      // Calculate outstanding before this invoice
      const outstandingBeforeInvoice = ledgerEntriesBeforeInvoice.reduce((sum, entry) => {
        return sum + (entry.debitAmount || 0) - (entry.creditAmount || 0);
      }, 0);
      
      const newOutstanding = outstandingBeforeInvoice + invoice.totalAmount;
      const wasOverlimit = newOutstanding > dealer.creditLimit;
      
      if (wasOverlimit) {
        approvalHistory.push({
          type: 'invoice',
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          amount: invoice.totalAmount,
          approvedAt: invoice.approvedAt,
          approvedBy: invoice.approvedBy,
          creditLimit: dealer.creditLimit,
          outstandingBefore: Math.round(outstandingBeforeInvoice),
          newOutstanding: Math.round(newOutstanding),
          overlimitAmount: Math.round(newOutstanding - dealer.creditLimit)
        });
      }
    }

    // 2. Check SALES ORDERS that exceeded credit limit and were approved (old system)
    const salesOrders = await SalesOrder.find({
      dealer: id,
      'creditOverlimit.isOverlimit': true,
      'creditOverlimit.approvedBy': { $exists: true, $ne: null },
      'creditOverlimit.approvedAt': { $gte: thirtyDaysAgo },
      status: { $in: ['Confirmed', 'Processing', 'Delivered'] }
    })
    .populate('creditOverlimit.approvedBy', 'name email role')
    .sort({ 'creditOverlimit.approvedAt': -1 });

    for (const order of salesOrders) {
      if (order.creditOverlimit && order.creditOverlimit.approvedBy) {
        approvalHistory.push({
          type: 'sales_order',
          orderId: order._id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          amount: order.totalAmount,
          approvedAt: order.creditOverlimit.approvedAt,
          approvedBy: order.creditOverlimit.approvedBy,
          creditLimit: order.creditOverlimit.creditLimit || dealer.creditLimit,
          outstandingBefore: Math.round(order.creditOverlimit.currentOutstanding || 0),
          newOutstanding: Math.round(order.creditOverlimit.newOutstanding || 0),
          overlimitAmount: Math.round(order.creditOverlimit.overlimitAmount || 0)
        });
      }
    }

    // Sort all approvals by date (newest first)
    approvalHistory.sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt));

    res.json({
      success: true,
      dealerInfo: {
        dealerId: dealer._id,
        dealerName: dealer.name,
        dealerCode: dealer.code,
        creditLimit: dealer.creditLimit
      },
      approvalHistory: approvalHistory,
      totalApprovalsLast30Days: approvalHistory.length,
      periodStart: thirtyDaysAgo,
      periodEnd: new Date()
    });
  } catch (error) {
    console.error("Get dealer credit approval history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching credit approval history",
      error: error.message
    });
  }
};
