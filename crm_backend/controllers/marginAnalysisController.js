import DealerInvoice from "../models/DealerInvoice.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import Dealer from "../models/Dealer.js";
import Supplier from "../models/Supplier.js";
import Category from "../models/Category.js";
import Product from "../models/Product.js";

// Helper to calculate profit metrics for an item
const calculateItemProfit = (item) => {
  const totalSalePrice = item.totalPrice || 0;
  const totalCost = totalSalePrice * 0.7; // Assuming 30% profit margin
  const totalProfit = totalSalePrice - totalCost;
  const profitMargin = totalSalePrice > 0 ? (totalProfit / totalSalePrice) * 100 : 0;
  return { totalCost, totalProfit, profitMargin };
};

// @desc    Get margin analysis by category
// @route   GET /api/margin-analysis/category
// @access  Private
export const getMarginAnalysisByCategory = async (req, res) => {
  try {
    const { 
      dataSource = 'dealer', 
      startDate, 
      endDate, 
      search, 
      page = 1, 
      limit = 10 
    } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    let query = {};
    let dateFilter = {};

    if (startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
      query.invoiceDate = dateFilter;
    }

    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { dealerName: { $regex: search, $options: "i" } },
        { supplierName: { $regex: search, $options: "i" } }
      ];
    }

    let invoices;
    let totalCount;

    if (dataSource === 'dealer') {
      invoices = await DealerInvoice.find(query)
        .populate('dealer', 'name code')
        .populate('items.product', 'itemName productCode category')
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean();
      totalCount = await DealerInvoice.countDocuments(query);
    } else {
      invoices = await SupplierInvoice.find(query)
        .populate('supplier', 'name code')
        .populate('items.product', 'itemName productCode category')
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean();
      totalCount = await SupplierInvoice.countDocuments(query);
    }

    // Group by category
    const categoryData = {};
    
    invoices.forEach(invoice => {
      const sourceName = dataSource === 'dealer' 
        ? (invoice.dealer?.name || invoice.dealerName) 
        : (invoice.supplier?.name || invoice.supplierName);

      invoice.items.forEach(item => {
        if (item.product && item.product.category) {
          const categoryId = item.product.category.toString();
          
          if (!categoryData[categoryId]) {
            categoryData[categoryId] = {
              categoryId,
              categoryName: 'Unknown Category', // Will be populated later
              revenue: 0,
              units: 0,
              margin: 0,
              growth: 0,
              [dataSource]: sourceName,
              billCount: 0
            };
          }

          const { totalCost, totalProfit, profitMargin } = calculateItemProfit(item);
          
          categoryData[categoryId].revenue += item.totalPrice || 0;
          categoryData[categoryId].units += item.quantity || 0;
          categoryData[categoryId].margin = profitMargin;
          categoryData[categoryId].billCount += 1;
        }
      });
    });

    // Get category names
    const categoryIds = Object.keys(categoryData);
    if (categoryIds.length > 0) {
      const categories = await Category.find({ _id: { $in: categoryIds } }).lean();
      categories.forEach(cat => {
        if (categoryData[cat._id.toString()]) {
          categoryData[cat._id.toString()].categoryName = cat.name;
        }
      });
    }

    const categoryResults = Object.values(categoryData).map(item => ({
      category: item.categoryName,
      [dataSource]: item[dataSource],
      revenue: Math.round(item.revenue),
      units: item.units,
      margin: Math.round(item.margin * 100) / 100,
      growth: Math.round((Math.random() * 40 - 10) * 100) / 100, // Mock growth for now
      profit: Math.round(item.revenue * (item.margin / 100))
    }));

    // Calculate summary statistics
    const summaryStats = {
      totalRevenue: categoryResults.reduce((sum, item) => sum + item.revenue, 0),
      totalUnits: categoryResults.reduce((sum, item) => sum + item.units, 0),
      avgMargin: categoryResults.length > 0 
        ? categoryResults.reduce((sum, item) => sum + item.margin, 0) / categoryResults.length 
        : 0,
      avgGrowth: categoryResults.length > 0 
        ? categoryResults.reduce((sum, item) => sum + item.growth, 0) / categoryResults.length 
        : 0
    };

    res.json({
      success: true,
      data: categoryResults,
      summary: summaryStats,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / limitNumber),
        totalItems: totalCount,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber * limitNumber < totalCount,
        hasPrevPage: pageNumber > 1
      }
    });

  } catch (error) {
    console.error("Error fetching margin analysis by category:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching margin analysis by category",
      error: error.message
    });
  }
};

// @desc    Get margin analysis by product
// @route   GET /api/margin-analysis/product
// @access  Private
export const getMarginAnalysisByProduct = async (req, res) => {
  try {
    const { 
      dataSource = 'dealer', 
      startDate, 
      endDate, 
      search, 
      page = 1, 
      limit = 10 
    } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    let query = {};
    let dateFilter = {};

    if (startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
      query.invoiceDate = dateFilter;
    }

    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { dealerName: { $regex: search, $options: "i" } },
        { supplierName: { $regex: search, $options: "i" } }
      ];
    }

    let invoices;
    let totalCount;

    if (dataSource === 'dealer') {
      invoices = await DealerInvoice.find(query)
        .populate('dealer', 'name code')
        .populate('items.product', 'itemName productCode category')
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean();
      totalCount = await DealerInvoice.countDocuments(query);
    } else {
      invoices = await SupplierInvoice.find(query)
        .populate('supplier', 'name code')
        .populate('items.product', 'itemName productCode category')
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean();
      totalCount = await SupplierInvoice.countDocuments(query);
    }

    // Group by product
    const productData = {};
    
    invoices.forEach(invoice => {
      const sourceName = dataSource === 'dealer' 
        ? (invoice.dealer?.name || invoice.dealerName) 
        : (invoice.supplier?.name || invoice.supplierName);

      invoice.items.forEach(item => {
        if (item.product) {
          const productId = item.product._id.toString();
          
          if (!productData[productId]) {
            productData[productId] = {
              productId,
              product: item.product.itemName || 'Unknown Product',
              category: 'Unknown Category', // Will be populated later
              revenue: 0,
              units: 0,
              margin: 0,
              growth: 0,
              [dataSource]: sourceName,
              billCount: 0
            };
          }

          const { totalCost, totalProfit, profitMargin } = calculateItemProfit(item);
          
          productData[productId].revenue += item.totalPrice || 0;
          productData[productId].units += item.quantity || 0;
          productData[productId].margin = profitMargin;
          productData[productId].billCount += 1;
        }
      });
    });

    // Get category names for products
    const productIds = Object.keys(productData);
    if (productIds.length > 0) {
      const products = await Product.find({ _id: { $in: productIds } })
        .populate('category', 'name')
        .lean();
      
      products.forEach(product => {
        if (productData[product._id.toString()]) {
          productData[product._id.toString()].category = product.category?.name || 'Unknown Category';
        }
      });
    }

    const productResults = Object.values(productData).map(item => ({
      product: item.product,
      category: item.category,
      [dataSource]: item[dataSource],
      revenue: Math.round(item.revenue),
      units: item.units,
      margin: Math.round(item.margin * 100) / 100,
      growth: Math.round((Math.random() * 40 - 10) * 100) / 100, // Mock growth for now
      profit: Math.round(item.revenue * (item.margin / 100))
    }));

    // Calculate summary statistics
    const summaryStats = {
      totalRevenue: productResults.reduce((sum, item) => sum + item.revenue, 0),
      totalUnits: productResults.reduce((sum, item) => sum + item.units, 0),
      avgMargin: productResults.length > 0 
        ? productResults.reduce((sum, item) => sum + item.margin, 0) / productResults.length 
        : 0,
      avgGrowth: productResults.length > 0 
        ? productResults.reduce((sum, item) => sum + item.growth, 0) / productResults.length 
        : 0
    };

    res.json({
      success: true,
      data: productResults,
      summary: summaryStats,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / limitNumber),
        totalItems: totalCount,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber * limitNumber < totalCount,
        hasPrevPage: pageNumber > 1
      }
    });

  } catch (error) {
    console.error("Error fetching margin analysis by product:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching margin analysis by product",
      error: error.message
    });
  }
};

// @desc    Get gross margin trend data
// @route   GET /api/margin-analysis/gross-margin-trend
// @access  Private
export const getGrossMarginTrend = async (req, res) => {
  try {
    const { 
      dataSource = 'dealer', 
      startDate, 
      endDate 
    } = req.query;

    let query = {};
    let dateFilter = {};

    if (startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
      query.invoiceDate = dateFilter;
    }

    let invoices;
    if (dataSource === 'dealer') {
      invoices = await DealerInvoice.find(query)
        .populate('items.product', 'itemName productCode category')
        .sort({ invoiceDate: 1 })
        .lean();
    } else {
      invoices = await SupplierInvoice.find(query)
        .populate('items.product', 'itemName productCode category')
        .sort({ invoiceDate: 1 })
        .lean();
    }

    // Group by month
    const monthlyData = {};
    
    invoices.forEach(invoice => {
      const monthKey = invoice.invoiceDate.toISOString().substring(0, 7); // YYYY-MM
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: invoice.invoiceDate.toLocaleDateString('en-US', { month: 'short' }),
          date: invoice.invoiceDate.toISOString().substring(0, 10),
          revenue: 0,
          cost: 0,
          margin: 0
        };
      }

      invoice.items.forEach(item => {
        const { totalCost, totalProfit } = calculateItemProfit(item);
        monthlyData[monthKey].revenue += item.totalPrice || 0;
        monthlyData[monthKey].cost += totalCost;
      });
    });

    // Calculate margins
    Object.values(monthlyData).forEach(item => {
      item.margin = item.revenue > 0 ? ((item.revenue - item.cost) / item.revenue) * 100 : 0;
    });

    const trendData = Object.values(monthlyData).sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      success: true,
      data: trendData
    });

  } catch (error) {
    console.error("Error fetching gross margin trend:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching gross margin trend",
      error: error.message
    });
  }
};
