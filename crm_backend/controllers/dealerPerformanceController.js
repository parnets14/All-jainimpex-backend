import DealerPerformance from "../models/DealerPerformance.js";
import Dealer from "../models/Dealer.js";
import DealerInvoice from "../models/DealerInvoice.js";
import CreditNote from "../models/CreditNote.js";

// Get all dealer performance records with pagination and filters
export const getDealerPerformance = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      dealerSearch = "",
      dealerSelect = "",
      category = "",
      dealerType = "",
      fromDate = "",
      toDate = "",
      period = "Monthly",
      sortBy = "performance",
      sortOrder = "desc"
    } = req.query;

    // Parse pagination parameters
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Build filter object
    const filter = { isActive: true };

    // Search by dealer name
    if (dealerSearch) {
      filter.dealerName = { $regex: dealerSearch, $options: "i" };
    }

    // Filter by specific dealer
    if (dealerSelect) {
      filter.dealerName = dealerSelect;
    }

    // Filter by category
    if (category) {
      filter.category = category;
    }

    // Filter by dealer type
    if (dealerType) {
      filter.dealerType = dealerType;
    }

    // Filter by period
    if (period) {
      filter.period = period;
    }

    // Date range filter
    if (fromDate || toDate) {
      filter.performanceDate = {};
      if (fromDate) filter.performanceDate.$gte = new Date(fromDate);
      if (toDate) filter.performanceDate.$lte = new Date(toDate);
    }

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get total count for pagination
    const total = await DealerPerformance.countDocuments(filter);

    // Get performance records with pagination
    const performanceRecords = await DealerPerformance.find(filter)
      .populate('dealer', 'name code dealerType category')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limitNumber);

    // Calculate summary statistics
    const summary = await DealerPerformance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$sales" },
          totalQuantity: { $sum: "$quantity" },
          totalSchemes: { $sum: "$schemeEarned" },
          totalProfit: { $sum: "$totalProfit" },
          avgPerformance: { $avg: "$performance" },
          count: { $sum: 1 }
        }
      }
    ]);

    const summaryData = summary.length > 0 ? summary[0] : {
      totalSales: 0,
      totalQuantity: 0,
      totalSchemes: 0,
      totalProfit: 0,
      avgPerformance: 0,
      count: 0
    };

    res.json({
      success: true,
      data: performanceRecords,
      summary: summaryData,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(total / limitNumber),
        totalItems: total,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber < Math.ceil(total / limitNumber),
        hasPrevPage: pageNumber > 1
      }
    });

  } catch (error) {
    console.error("Error fetching dealer performance:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer performance data",
      error: error.message
    });
  }
};

// Get dealer performance by ID
export const getDealerPerformanceById = async (req, res) => {
  try {
    const { id } = req.params;

    const performanceRecord = await DealerPerformance.findById(id)
      .populate('dealer', 'name code dealerType category phone email address')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!performanceRecord) {
      return res.status(404).json({
        success: false,
        message: "Dealer performance record not found"
      });
    }

    res.json({
      success: true,
      data: performanceRecord
    });

  } catch (error) {
    console.error("Error fetching dealer performance by ID:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer performance record",
      error: error.message
    });
  }
};

// Create new dealer performance record
export const createDealerPerformance = async (req, res) => {
  try {
    const {
      dealer,
      dealerName,
      dealerCode,
      dealerType,
      category,
      quantity,
      sales,
      schemeEarned,
      discountLevel,
      performance,
      rank,
      performanceDate,
      period,
      products,
      customerSatisfaction,
      returnRate
    } = req.body;

    // Validate required fields
    if (!dealer || !dealerName || !dealerCode || !dealerType || !category) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: dealer, dealerName, dealerCode, dealerType, category"
      });
    }

    // Validate dealer exists
    const dealerExists = await Dealer.findById(dealer);
    if (!dealerExists) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    // Calculate totals from products
    let totalProfit = 0;
    let averageProfitMargin = 0;
    
    if (products && products.length > 0) {
      totalProfit = products.reduce((sum, product) => sum + (product.profit || 0), 0);
      averageProfitMargin = products.reduce((sum, product) => sum + (product.profitMargin || 0), 0) / products.length;
    }

    const performanceData = {
      dealer,
      dealerName,
      dealerCode,
      dealerType,
      category,
      quantity: quantity || 0,
      sales: sales || 0,
      schemeEarned: schemeEarned || 0,
      discountLevel: discountLevel || "Level 1",
      performance: performance || 0,
      rank: rank || 1,
      performanceDate: performanceDate ? new Date(performanceDate) : new Date(),
      period: period || "Monthly",
      products: products || [],
      totalProfit,
      averageProfitMargin,
      customerSatisfaction: customerSatisfaction || 0,
      returnRate: returnRate || 0,
      createdBy: req.user._id
    };

    const newPerformanceRecord = new DealerPerformance(performanceData);
    await newPerformanceRecord.save();

    // Populate the response
    const populatedRecord = await DealerPerformance.findById(newPerformanceRecord._id)
      .populate('dealer', 'name code dealerType category')
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Dealer performance record created successfully",
      data: populatedRecord
    });

  } catch (error) {
    console.error("Error creating dealer performance:", error);
    res.status(500).json({
      success: false,
      message: "Error creating dealer performance record",
      error: error.message
    });
  }
};

// Update dealer performance record
export const updateDealerPerformance = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.createdBy;

    // Add updatedBy field
    updateData.updatedBy = req.user._id;

    // Recalculate totals if products are updated
    if (updateData.products && updateData.products.length > 0) {
      updateData.totalProfit = updateData.products.reduce((sum, product) => sum + (product.profit || 0), 0);
      updateData.averageProfitMargin = updateData.products.reduce((sum, product) => sum + (product.profitMargin || 0), 0) / updateData.products.length;
    }

    const updatedRecord = await DealerPerformance.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('dealer', 'name code dealerType category')
     .populate('createdBy', 'name email')
     .populate('updatedBy', 'name email');

    if (!updatedRecord) {
      return res.status(404).json({
        success: false,
        message: "Dealer performance record not found"
      });
    }

    res.json({
      success: true,
      message: "Dealer performance record updated successfully",
      data: updatedRecord
    });

  } catch (error) {
    console.error("Error updating dealer performance:", error);
    res.status(500).json({
      success: false,
      message: "Error updating dealer performance record",
      error: error.message
    });
  }
};

// Delete dealer performance record
export const deleteDealerPerformance = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedRecord = await DealerPerformance.findByIdAndUpdate(
      id,
      { isActive: false, updatedBy: req.user._id },
      { new: true }
    );

    if (!deletedRecord) {
      return res.status(404).json({
        success: false,
        message: "Dealer performance record not found"
      });
    }

    res.json({
      success: true,
      message: "Dealer performance record deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting dealer performance:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting dealer performance record",
      error: error.message
    });
  }
};

// Generate dealer performance from invoices and credit notes
export const generateDealerPerformance = async (req, res) => {
  try {
    const {
      fromDate,
      toDate,
      period = "Monthly"
    } = req.body;

    console.log("Starting dealer performance generation...");

    // Clear existing performance records for the period
    await DealerPerformance.deleteMany({ period });

    // Build date filter
    const dateFilter = {};
    if (fromDate) dateFilter.$gte = new Date(fromDate);
    if (toDate) dateFilter.$lte = new Date(toDate);

    // Get all dealers
    const dealers = await Dealer.find({ isActive: true });
    console.log(`Found ${dealers.length} active dealers`);

    const performanceRecords = [];

    for (const dealer of dealers) {
      console.log(`Processing dealer: ${dealer.name} (${dealer.code})`);

      // Get invoices for the dealer in the date range
      const invoiceFilter = { dealer: dealer._id };
      if (Object.keys(dateFilter).length > 0) {
        invoiceFilter.invoiceDate = dateFilter;
      }

      const invoices = await DealerInvoice.find(invoiceFilter);
      const creditNotes = await CreditNote.find({ 
        dealer: dealer._id,
        ...(Object.keys(dateFilter).length > 0 && { creditNoteDate: dateFilter })
      });

      console.log(`  - Found ${invoices.length} invoices and ${creditNotes.length} credit notes`);

        // Calculate performance metrics
        const totalSales = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const totalCreditAmount = creditNotes.reduce((sum, cn) => sum + (cn.creditAmount || 0), 0);
        // Sales = Total Invoice Amount (credit notes are payments, not returns)
        const netSales = totalSales;
      
      const totalQuantity = invoices.reduce((sum, inv) => {
        return sum + (inv.items ? inv.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) : 0);
      }, 0);

      console.log(`  - Net Sales: ${netSales}, Quantity: ${totalQuantity}`);

      // Only create performance record if dealer has sales
      if (netSales > 0) {
        // Calculate scheme points (assuming 10% of sales as scheme)
        const schemeEarned = Math.round(totalSales * 0.1);

        // Determine discount level based on sales
        let discountLevel = "Level 1";
        if (netSales >= 2000000) discountLevel = "Level 2";
        if (netSales >= 3000000) discountLevel = "Level 3";
        if (netSales >= 4000000) discountLevel = "Level 4";
        if (netSales >= 5000000) discountLevel = "Level 5";

        // Calculate performance percentage (simplified calculation)
        const performance = Math.min(100, Math.round((netSales / 1000000) * 20));

        // Create product breakdown from invoices
        const products = [];
        const productMap = new Map();

        invoices.forEach(invoice => {
          if (invoice.items) {
            invoice.items.forEach(item => {
              const productKey = item.productName || item.itemName || 'Unknown Product';
              if (productMap.has(productKey)) {
                const existing = productMap.get(productKey);
                existing.quantity += item.quantity || 0;
                existing.amount += item.totalPrice || 0;
                existing.points += Math.round((item.totalPrice || 0) * 0.1);
              } else {
                const costPrice = (item.totalPrice || 0) * 0.7; // Assuming 30% margin
                const profit = (item.totalPrice || 0) - costPrice;
                productMap.set(productKey, {
                  name: productKey,
                  category: item.product?.category || "Other",
                  quantity: item.quantity || 0,
                  amount: item.totalPrice || 0,
                  points: Math.round((item.totalPrice || 0) * 0.1),
                  costPrice,
                  profit,
                  profitMargin: item.totalPrice > 0 ? ((profit / item.totalPrice) * 100) : 0
                });
              }
            });
          }
        });

        products.push(...Array.from(productMap.values()));

        const totalProfit = products.reduce((sum, product) => sum + product.profit, 0);
        const averageProfitMargin = products.length > 0 
          ? products.reduce((sum, product) => sum + product.profitMargin, 0) / products.length
          : 0;

        // Calculate additional financial metrics
        // Paid amount should come from credit notes (payments), not invoice status
        const paid = creditNotes.reduce((sum, cn) => sum + (cn.creditAmount || 0), 0);
        
        const outstanding = netSales - paid;
        
        // Calculate growth percentage (comparing with previous period)
        const previousPeriodStart = new Date(toDate || new Date());
        previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);
        const previousInvoices = await DealerInvoice.find({
          dealer: dealer._id,
          invoiceDate: { $gte: previousPeriodStart, $lt: new Date(toDate || new Date()) }
        });
        const previousSales = previousInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const growthPercentage = previousSales > 0 ? ((netSales - previousSales) / previousSales) * 100 : 0;
        
        // Calculate target achieved percentage
        const salesTarget = dealer.salesTarget || 1000000; // Default target
        const targetAchieved = Math.min(100, (netSales / salesTarget) * 100);
        
        // Calculate returns percentage (based on actual returns, not payments)
        // For now, we'll calculate this based on credit notes that are actual returns
        // This is a simplified calculation - in reality, you'd need to distinguish between payments and returns
        const returnsPercentage = netSales > 0 ? Math.min(100, (totalCreditAmount / netSales) * 100) : 0;
        
        // Calculate total points earned
        const totalPoints = invoices.reduce((sum, inv) => {
          return sum + (inv.items ? inv.items.reduce((itemSum, item) => itemSum + (item.pointsEarned || 0), 0) : 0);
        }, 0);
        
        // Calculate average discount availed
        const totalDiscountAmount = invoices.reduce((sum, inv) => sum + (inv.totalDiscount || 0), 0);
        const averageDiscountAvailed = netSales > 0 ? Math.min(100, (totalDiscountAmount / netSales) * 100) : 0;

        performanceRecords.push({
          dealer: dealer._id,
          dealerName: dealer.name,
          dealerCode: dealer.code,
          dealerType: dealer.dealerType,
          category: dealer.category || "Sanitary & Plumbing",
          quantity: totalQuantity,
          sales: netSales,
          schemeEarned,
          discountLevel,
          performance,
          rank: 0, // Will be calculated after sorting
          performanceDate: toDate ? new Date(toDate) : new Date(),
          period,
          products,
          totalProfit,
          averageProfitMargin,
          customerSatisfaction: Math.random() * 2 + 3, // Random between 3-5
          returnRate: Math.random() * 5, // Random between 0-5%
          // New comprehensive metrics
          paid,
          outstanding,
          growthPercentage: Math.round(growthPercentage * 100) / 100,
          targetAchieved: Math.round(targetAchieved * 100) / 100,
          returnsPercentage: Math.round(returnsPercentage * 100) / 100,
          totalPoints,
          averageDiscountAvailed: Math.round(averageDiscountAvailed * 100) / 100,
          createdBy: req.user._id
        });

        console.log(`  - Created performance record for ${dealer.name}`);
      } else {
        console.log(`  - Skipping ${dealer.name} (no sales)`);
      }
    }

    console.log(`Total performance records to create: ${performanceRecords.length}`);

    // Sort by sales and assign ranks
    performanceRecords.sort((a, b) => b.sales - a.sales);
    performanceRecords.forEach((record, index) => {
      record.rank = index + 1;
    });

    // Save performance records
    const savedRecords = await DealerPerformance.insertMany(performanceRecords);

    console.log(`Successfully created ${savedRecords.length} dealer performance records`);

    res.json({
      success: true,
      message: `Generated ${savedRecords.length} dealer performance records`,
      data: savedRecords
    });

  } catch (error) {
    console.error("Error generating dealer performance:", error);
    res.status(500).json({
      success: false,
      message: "Error generating dealer performance data",
      error: error.message
    });
  }
};

// Get dealer performance statistics
export const getDealerPerformanceStats = async (req, res) => {
  try {
    const { period = "Monthly", fromDate, toDate } = req.query;

    const filter = { isActive: true, period };
    if (fromDate || toDate) {
      filter.performanceDate = {};
      if (fromDate) filter.performanceDate.$gte = new Date(fromDate);
      if (toDate) filter.performanceDate.$lte = new Date(toDate);
    }

    const stats = await DealerPerformance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          totalSales: { $sum: "$sales" },
          totalQuantity: { $sum: "$quantity" },
          totalSchemes: { $sum: "$schemeEarned" },
          totalProfit: { $sum: "$totalProfit" },
          avgPerformance: { $avg: "$performance" },
          avgCustomerSatisfaction: { $avg: "$customerSatisfaction" },
          avgReturnRate: { $avg: "$returnRate" },
          topPerformer: { $max: "$performance" },
          lowestPerformer: { $min: "$performance" }
        }
      }
    ]);

    // Dealer type breakdown
    const dealerTypeStats = await DealerPerformance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$dealerType",
          count: { $sum: 1 },
          totalSales: { $sum: "$sales" },
          avgPerformance: { $avg: "$performance" }
        }
      }
    ]);

    // Category breakdown
    const categoryStats = await DealerPerformance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          totalSales: { $sum: "$sales" },
          avgPerformance: { $avg: "$performance" }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        summary: stats[0] || {},
        dealerTypeBreakdown: dealerTypeStats,
        categoryBreakdown: categoryStats
      }
    });

  } catch (error) {
    console.error("Error fetching dealer performance stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer performance statistics",
      error: error.message
    });
  }
};
