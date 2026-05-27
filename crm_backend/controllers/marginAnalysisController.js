import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { supplierInvoiceSchema } from "../models/SupplierInvoice.js";
import { dealerSchema } from "../models/Dealer.js";
import { supplierSchema } from "../models/Supplier.js";
import { categorySchema } from "../models/Category.js";
import { productSchema } from "../models/Product.js";
import { dealerPricingSchema } from "../models/DealerPricing.js";

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
              dbConnection.model('Supplier', supplierSchema),
    Category: dbConnection.models.Category || 
              dbConnection.model('Category', categorySchema),
    Product: dbConnection.models.Product || 
             dbConnection.model('Product', productSchema),
    DealerPricing: dbConnection.models.DealerPricing || 
                   dbConnection.model('DealerPricing', dealerPricingSchema)
  };
};

// Helper to calculate profit metrics for an item using pricing map
const calculateItemProfitWithPricing = (item, pricingMap) => {
  const qty = item.quantity || 0;
  const totalSalePrice = item.totalPrice || 0; // What dealer pays (after discounts)
  const productId = item.product?._id?.toString() || item.product?.toString();
  
  let totalCost = 0;
  if (productId && pricingMap[productId] && pricingMap[productId].purchasePrice > 0) {
    totalCost = qty * pricingMap[productId].purchasePrice;
  } else {
    // No purchase price data — cost unknown, set to sale price (0 profit)
    totalCost = totalSalePrice;
  }
  
  const totalProfit = totalSalePrice - totalCost;
  const profitMargin = totalSalePrice > 0 ? (totalProfit / totalSalePrice) * 100 : 0;
  return { totalCost, totalProfit, profitMargin };
};

// @desc    Get margin analysis by category/subcategory/brand
// @route   GET /api/margin-analysis/category
// @access  Private
export const getMarginAnalysisByCategory = async (req, res) => {
  try {
    const { DealerInvoice, SupplierInvoice, Category, Product, DealerPricing } = getModels(req.dbConnection);
    const { 
      dataSource = 'dealer',
      groupBy = 'category', // category, subcategory, brand
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

    if (startDate || endDate) { query.invoiceDate = {}; if (startDate) query.invoiceDate.$gte = new Date(startDate); if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); query.invoiceDate.$lte = end; } } else { query.invoiceDate = { $ne: null }; }

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
      // Get ALL invoices for proper aggregation (no pagination here)
      invoices = await DealerInvoice.find(query)
        .populate('dealer', 'name code')
        .populate('items.product', 'itemName productCode category subcategory brand')
        .sort({ invoiceDate: -1 })
        .lean();
      totalCount = await DealerInvoice.countDocuments(query);
    } else {
      // Get ALL invoices for proper aggregation (no pagination here)
      invoices = await SupplierInvoice.find(query)
        .populate('supplier', 'name code')
        .populate('items.product', 'itemName productCode category subcategory brand')
        .sort({ invoiceDate: -1 })
        .lean();
      totalCount = await SupplierInvoice.countDocuments(query);
    }

    // Load all pricing data for efficient lookup
    const allPricing = await DealerPricing.find({ isActive: true }).lean();
    const pricingMap = {};
    allPricing.forEach(p => { pricingMap[p.product.toString()] = p; });

    // Group by the selected dimension (category/subcategory/brand)
    const groupedData = {};
    
    invoices.forEach(invoice => {
      const sourceName = dataSource === 'dealer' 
        ? (invoice.dealer?.name || invoice.dealerName) 
        : (invoice.supplier?.name || invoice.supplierName);

      invoice.items.forEach(item => {
        if (!item.product) return;
        
        // Determine grouping key based on groupBy param
        let groupKey = null;
        if (groupBy === 'category' && item.product.category) {
          groupKey = item.product.category.toString();
        } else if (groupBy === 'subcategory' && item.product.subcategory) {
          groupKey = item.product.subcategory.toString();
        } else if (groupBy === 'brand' && item.product.brand) {
          groupKey = item.product.brand.toString();
        }
        
        if (!groupKey) return;
        
        if (!groupedData[groupKey]) {
          groupedData[groupKey] = {
            id: groupKey,
            name: 'Unknown',
            revenue: 0,
            cost: 0,
            units: 0,
            [dataSource]: sourceName,
            billCount: 0
          };
        }

        const { totalCost } = calculateItemProfitWithPricing(item, pricingMap);
        
        groupedData[groupKey].revenue += item.totalPrice || 0;
        groupedData[groupKey].cost += totalCost;
        groupedData[groupKey].units += item.quantity || 0;
        groupedData[groupKey].billCount += 1;
      });
    });

    // Get names for the grouped IDs
    const groupIds = Object.keys(groupedData);
    if (groupIds.length > 0) {
      // Import schemas for subcategory and brand if needed
      let lookupModel = Category;
      if (groupBy === 'subcategory') {
        const { subcategorySchema } = await import('../models/Subcategory.js');
        lookupModel = req.dbConnection.models.Subcategory || req.dbConnection.model('Subcategory', subcategorySchema);
      } else if (groupBy === 'brand') {
        const { brandSchema } = await import('../models/Brand.js');
        lookupModel = req.dbConnection.models.Brand || req.dbConnection.model('Brand', brandSchema);
      }
      
      const docs = await lookupModel.find({ _id: { $in: groupIds } }).lean();
      docs.forEach(doc => {
        if (groupedData[doc._id.toString()]) {
          groupedData[doc._id.toString()].name = doc.name;
        }
      });
    }

    const allCategoryResults = Object.values(groupedData).map(item => {
      const profit = item.revenue - item.cost;
      const margin = item.revenue > 0 ? (profit / item.revenue) * 100 : 0;
      return {
        category: item.name,
        groupBy: groupBy,
        [dataSource]: item[dataSource],
        revenue: Math.round(item.revenue),
        units: item.units,
        margin: Math.round(margin * 100) / 100,
        growth: 0,
        profit: Math.round(profit),
        cost: Math.round(item.cost)
      };
    });

    // Apply pagination to results AFTER aggregation
    const categoryResults = allCategoryResults.slice(skip, skip + limitNumber);

    // Calculate summary statistics from ALL results (not just paginated)
    const summaryStats = {
      totalRevenue: allCategoryResults.reduce((sum, item) => sum + item.revenue, 0),
      totalUnits: allCategoryResults.reduce((sum, item) => sum + item.units, 0),
      avgMargin: allCategoryResults.length > 0 
        ? allCategoryResults.reduce((sum, item) => sum + item.margin, 0) / allCategoryResults.length 
        : 0,
      avgGrowth: allCategoryResults.length > 0 
        ? allCategoryResults.reduce((sum, item) => sum + item.growth, 0) / allCategoryResults.length 
        : 0
    };

    res.json({
      success: true,
      data: categoryResults,
      summary: summaryStats,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(allCategoryResults.length / limitNumber),
        totalItems: allCategoryResults.length,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber * limitNumber < allCategoryResults.length,
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
    const { DealerInvoice, SupplierInvoice, Product } = getModels(req.dbConnection);
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

    if (startDate || endDate) { query.invoiceDate = {}; if (startDate) query.invoiceDate.$gte = new Date(startDate); if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); query.invoiceDate.$lte = end; } } else { query.invoiceDate = { $ne: null }; }

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
      // Get ALL invoices for proper aggregation (no pagination here)
      invoices = await DealerInvoice.find(query)
        .populate('dealer', 'name code')
        .populate('items.product', 'itemName productCode category subcategory brand')
        .sort({ invoiceDate: -1 })
        .lean();
      totalCount = await DealerInvoice.countDocuments(query);
    } else {
      // Get ALL invoices for proper aggregation (no pagination here)
      invoices = await SupplierInvoice.find(query)
        .populate('supplier', 'name code')
        .populate('items.product', 'itemName productCode category subcategory brand')
        .sort({ invoiceDate: -1 })
        .lean();
      totalCount = await SupplierInvoice.countDocuments(query);
    }

    // Load all pricing data for efficient lookup
    const { DealerPricing } = getModels(req.dbConnection);
    const allPricing2 = await DealerPricing.find({ isActive: true }).lean();
    const pricingMap2 = {};
    allPricing2.forEach(p => { pricingMap2[p.product.toString()] = p; });

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
              category: 'Unknown Category',
              revenue: 0,
              cost: 0,
              units: 0,
              margin: 0,
              growth: 0,
              [dataSource]: sourceName,
              billCount: 0
            };
          }

          const { totalCost, totalProfit, profitMargin } = calculateItemProfitWithPricing(item, pricingMap2);
          
          productData[productId].revenue += item.totalPrice || 0;
          productData[productId].cost += totalCost;
          productData[productId].units += item.quantity || 0;
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

    const allProductResults = Object.values(productData).map(item => {
      const profit = item.revenue - item.cost;
      const margin = item.revenue > 0 ? (profit / item.revenue) * 100 : 0;
      return {
        product: item.product,
        category: item.category,
        [dataSource]: item[dataSource],
        revenue: Math.round(item.revenue),
        units: item.units,
        margin: Math.round(margin * 100) / 100,
        growth: 0,
        profit: Math.round(profit),
        cost: Math.round(item.cost)
      };
    });

    // Apply pagination to results AFTER aggregation
    const productResults = allProductResults.slice(skip, skip + limitNumber);

    // Calculate summary statistics from ALL results (not just paginated)
    const summaryStats = {
      totalRevenue: allProductResults.reduce((sum, item) => sum + item.revenue, 0),
      totalUnits: allProductResults.reduce((sum, item) => sum + item.units, 0),
      avgMargin: allProductResults.length > 0 
        ? allProductResults.reduce((sum, item) => sum + item.margin, 0) / allProductResults.length 
        : 0,
      avgGrowth: allProductResults.length > 0 
        ? allProductResults.reduce((sum, item) => sum + item.growth, 0) / allProductResults.length 
        : 0
    };

    res.json({
      success: true,
      data: productResults,
      summary: summaryStats,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(allProductResults.length / limitNumber),
        totalItems: allProductResults.length,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber * limitNumber < allProductResults.length,
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
    const { DealerInvoice, SupplierInvoice } = getModels(req.dbConnection);
    const { 
      dataSource = 'dealer', 
      startDate, 
      endDate 
    } = req.query;

    let query = {};
    let dateFilter = {};

    if (startDate || endDate) { query.invoiceDate = {}; if (startDate) query.invoiceDate.$gte = new Date(startDate); if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); query.invoiceDate.$lte = end; } } else { query.invoiceDate = { $ne: null }; }

    let invoices;
    if (dataSource === 'dealer') {
      invoices = await DealerInvoice.find(query)
        .populate('items.product', 'itemName productCode category subcategory brand')
        .sort({ invoiceDate: 1 })
        .lean();
    } else {
      invoices = await SupplierInvoice.find(query)
        .populate('items.product', 'itemName productCode category subcategory brand')
        .sort({ invoiceDate: 1 })
        .lean();
    }

    // Load pricing for trend calculation
    const { DealerPricing } = getModels(req.dbConnection);
    const allPricing3 = await DealerPricing.find({ isActive: true }).lean();
    const pricingMap3 = {};
    allPricing3.forEach(p => { pricingMap3[p.product.toString()] = p; });

    // Group by month
    const monthlyData = {};
    
    invoices.forEach(invoice => {
      if (!invoice.invoiceDate) return;
      const monthKey = invoice.invoiceDate.toISOString().substring(0, 7);
      
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
        const { totalCost } = calculateItemProfitWithPricing(item, pricingMap3);
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
