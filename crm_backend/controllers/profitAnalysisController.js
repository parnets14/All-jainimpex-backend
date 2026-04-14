import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { supplierInvoiceSchema } from "../models/SupplierInvoice.js";
import { dealerSchema } from "../models/Dealer.js";
import { supplierSchema } from "../models/Supplier.js";

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    DealerInvoice: dbConnection.models.DealerInvoice || 
                   dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    SupplierInvoice: dbConnection.models.SupplierInvoice || 
                     dbConnection.model('SupplierInvoice', supplierInvoiceSchema),
    Dealer: dbConnection.models.Dealer || 
            dbConnection.model('Dealer', dealerSchema),
    Supplier: dbConnection.models.Supplier || 
              dbConnection.model('Supplier', supplierSchema)
  };
};

// @desc    Get bill-wise profit analysis
// @route   GET /api/profit-analysis/bills
// @access  Private
export const getBillWiseProfitAnalysis = async (req, res) => {
  try {
    const { DealerInvoice, SupplierInvoice, Dealer, Supplier } = getModels(req.dbConnection);
    const {
      page = 1,
      limit = 10,
      analysisType = 'dealer', // 'dealer' or 'supplier'
      startDate,
      endDate,
      search,
      dealer,
      supplier
    } = req.query;

    // Build date filter
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) dateFilter.invoiceDate.$gte = new Date(startDate);
      if (endDate) dateFilter.invoiceDate.$lte = new Date(endDate);
    }

    // Build query based on analysis type
    let query = { ...dateFilter };
    
    if (analysisType === 'dealer') {
      if (dealer) query.dealer = dealer;
    } else {
      if (supplier) query.supplier = supplier;
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { dealerName: { $regex: search, $options: "i" } },
        { supplierName: { $regex: search, $options: "i" } }
      ];
    }

    // Get invoices with pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    let invoices;
    if (analysisType === 'dealer') {
      invoices = await DealerInvoice.find(query)
        .populate('dealer', 'name code')
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean();
    } else {
      invoices = await SupplierInvoice.find(query)
        .populate('supplier', 'name code')
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean();
    }

    // Get total count for pagination
    const total = analysisType === 'dealer' 
      ? await DealerInvoice.countDocuments(query)
      : await SupplierInvoice.countDocuments(query);

    // Transform data to match the expected format
    const transformedData = invoices.map(invoice => {
      // Calculate profit using 30% margin assumption (as used in dealer performance)
      const totalSalePrice = invoice.totalAmount || 0;
      const totalDiscount = invoice.totalDiscount || 0;
      const totalRevenue = totalSalePrice - totalDiscount;
      const totalCost = totalRevenue * 0.7; // Assuming 30% margin
      const totalProfit = totalRevenue - totalCost;
      const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      return {
        id: invoice._id,
        billNo: invoice.invoiceNumber,
        date: invoice.invoiceDate,
        dealerName: analysisType === 'dealer' ? (invoice.dealer?.name || invoice.dealerName) : 'N/A',
        supplierName: analysisType === 'supplier' ? (invoice.supplier?.name || invoice.supplierName) : 'N/A',
        totalCost: Math.round(totalCost),
        totalRevenue: Math.round(totalRevenue),
        totalSalePrice: Math.round(totalSalePrice),
        totalDiscount: Math.round(totalDiscount),
        totalProfit: Math.round(totalProfit),
        profitMargin: Math.round(profitMargin * 100) / 100
      };
    });

    // Calculate summary statistics
    const summaryStats = {
      totalSalePrice: transformedData.reduce((sum, bill) => sum + bill.totalSalePrice, 0),
      totalDiscount: transformedData.reduce((sum, bill) => sum + bill.totalDiscount, 0),
      totalRevenue: transformedData.reduce((sum, bill) => sum + bill.totalRevenue, 0),
      totalCost: transformedData.reduce((sum, bill) => sum + bill.totalCost, 0),
      totalProfit: transformedData.reduce((sum, bill) => sum + bill.totalProfit, 0),
      avgProfitMargin: transformedData.length > 0 
        ? transformedData.reduce((sum, bill) => sum + bill.profitMargin, 0) / transformedData.length 
        : 0
    };

    res.json({
      success: true,
      data: transformedData,
      summary: summaryStats,
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
    console.error("Bill Wise Profit Analysis Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching bill-wise profit analysis",
      error: error.message
    });
  }
};

// @desc    Get grouped profit analysis (dealer/supplier wise)
// @route   GET /api/profit-analysis/grouped
// @access  Private
export const getGroupedProfitAnalysis = async (req, res) => {
  try {
    const {
      analysisType = 'dealer', // 'dealer' or 'supplier'
      startDate,
      endDate,
      search
    } = req.query;

    // Build date filter
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) dateFilter.invoiceDate.$gte = new Date(startDate);
      if (endDate) dateFilter.invoiceDate.$lte = new Date(endDate);
    }

    // Add search functionality
    let query = { ...dateFilter };
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { dealerName: { $regex: search, $options: "i" } },
        { supplierName: { $regex: search, $options: "i" } }
      ];
    }

    // Get all invoices for grouping
    let invoices;
    if (analysisType === 'dealer') {
      invoices = await DealerInvoice.find(query)
        .populate('dealer', 'name code')
        .lean();
    } else {
      invoices = await SupplierInvoice.find(query)
        .populate('supplier', 'name code')
        .lean();
    }

    // Group by dealer/supplier
    const groupedData = {};
    
    invoices.forEach(invoice => {
      const key = analysisType === 'dealer' 
        ? (invoice.dealer?.name || invoice.dealerName)
        : (invoice.supplier?.name || invoice.supplierName);

      if (!groupedData[key]) {
        groupedData[key] = {
          name: key,
          totalSalePrice: 0,
          totalDiscount: 0,
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          billCount: 0,
          bills: []
        };
      }

      const totalSalePrice = invoice.totalAmount || 0;
      const totalDiscount = invoice.totalDiscount || 0;
      const totalRevenue = totalSalePrice - totalDiscount;
      const totalCost = totalRevenue * 0.7; // Assuming 30% margin
      const totalProfit = totalRevenue - totalCost;

      groupedData[key].totalSalePrice += totalSalePrice;
      groupedData[key].totalDiscount += totalDiscount;
      groupedData[key].totalRevenue += totalRevenue;
      groupedData[key].totalCost += totalCost;
      groupedData[key].totalProfit += totalProfit;
      groupedData[key].billCount += 1;
      groupedData[key].bills.push({
        id: invoice._id,
        billNo: invoice.invoiceNumber,
        date: invoice.invoiceDate,
        totalSalePrice: Math.round(totalSalePrice),
        totalDiscount: Math.round(totalDiscount),
        totalRevenue: Math.round(totalRevenue),
        totalCost: Math.round(totalCost),
        totalProfit: Math.round(totalProfit)
      });
    });

    // Convert to array and sort by profit
    const groupedArray = Object.values(groupedData).sort((a, b) => b.totalProfit - a.totalProfit);

    res.json({
      success: true,
      data: groupedArray
    });

  } catch (error) {
    console.error("Grouped Profit Analysis Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching grouped profit analysis",
      error: error.message
    });
  }
};
