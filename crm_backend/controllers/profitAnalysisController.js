import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { supplierInvoiceSchema } from "../models/SupplierInvoice.js";
import { dealerSchema } from "../models/Dealer.js";
import { supplierSchema } from "../models/Supplier.js";
import { dealerPricingSchema } from "../models/DealerPricing.js";
import { productSchema } from "../models/Product.js";

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
    DealerPricing: dbConnection.models.DealerPricing || 
                   dbConnection.model('DealerPricing', dealerPricingSchema),
    Product: dbConnection.models.Product || 
             dbConnection.model('Product', productSchema)
  };
};

// @desc    Get bill-wise profit analysis
// @route   GET /api/profit-analysis/bills
// @access  Private
export const getBillWiseProfitAnalysis = async (req, res) => {
  try {
    const { DealerInvoice, SupplierInvoice, Dealer, Supplier, DealerPricing } = getModels(req.dbConnection);
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
      // Show all invoices that have an invoice number (non-empty drafts)
      query.invoiceNumber = { $ne: null, $exists: true };
    } else {
      if (supplier) query.supplier = supplier;
      query.invoiceNumber = { $ne: null, $exists: true };
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
        .populate('items.product', 'itemName productCode mrp')
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean();
    } else {
      invoices = await SupplierInvoice.find(query)
        .populate('supplier', 'name code')
        .populate('items.product', 'itemName productCode mrp')
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
    const transformedData = [];
    
    for (const invoice of invoices) {
      if (analysisType === 'dealer') {
        // DEALER WISE: You sell to dealer
        // Gross Revenue = totalAmount (what dealer pays at MRP, includes GST)
        // Discount = totalDiscount (dealer discounts given)
        // Net Revenue = totalAmount - totalDiscount = what dealer actually pays you
        // Cost = purchase price × qty for each item (from last supplier invoice/PO)
        // Profit = Net Revenue - Cost
        
        const grossRevenue = invoice.totalAmount || 0;
        const totalDiscount = invoice.totalDiscount || 0;
        const netRevenue = grossRevenue - totalDiscount;
        
        // Calculate cost from purchase prices
        let totalCost = 0;
        if (invoice.items && invoice.items.length > 0) {
          for (const item of invoice.items) {
            const qty = item.quantity || 0;
            const productId = item.product?._id || item.product;
            if (productId) {
              const pricing = await DealerPricing.findOne({ product: productId, isActive: true }).lean();
              if (pricing && pricing.purchasePrice > 0) {
                totalCost += qty * pricing.purchasePrice;
              } else {
                // No purchase price available - use item's totalPrice as fallback (net selling)
                // This means profit will be 0 for items without purchase price data
                totalCost += item.totalPrice || (qty * (item.unitPrice || item.mrp || 0));
              }
            }
          }
        }
        
        // If no items or no cost calculated, estimate
        if (totalCost === 0) {
          totalCost = netRevenue; // No profit data available
        }
        
        const totalProfit = netRevenue - totalCost;
        const profitMargin = netRevenue > 0 ? (totalProfit / netRevenue) * 100 : 0;

        transformedData.push({
          id: invoice._id,
          billNo: invoice.invoiceNumber,
          date: invoice.invoiceDate,
          dealerName: invoice.dealer?.name || invoice.dealerName || 'N/A',
          supplierName: 'N/A',
          totalSalePrice: Math.round(grossRevenue),
          totalDiscount: Math.round(totalDiscount),
          totalRevenue: Math.round(netRevenue),
          totalCost: Math.round(totalCost),
          totalProfit: Math.round(totalProfit),
          profitMargin: Math.round(profitMargin * 100) / 100
        });
        
      } else {
        // SUPPLIER WISE: You buy from supplier
        // Gross Revenue = subtotal (qty × MRP before discounts)
        // Discount = purchase discounts (direct + extra + floating)
        // Net Revenue = what you actually paid the supplier (Gross - Discount)
        // Cost = Net Revenue (this IS your cost)
        // For supplier, we show: how much you saved via discounts
        
        let grossRevenue = 0;
        let totalDiscount = 0;
        
        if (invoice.items && invoice.items.length > 0) {
          for (const item of invoice.items) {
            const qty = item.quantity || 0;
            const mrp = item.unitPrice || 0;
            grossRevenue += qty * mrp;
          }
          // Recalculate discount from percentages (sequential)
          for (const item of invoice.items) {
            const qty = item.quantity || 0;
            const mrp = item.unitPrice || 0;
            const sub = qty * mrp;
            const directPct = item.purchaseDiscount?.directDiscountPercentage || 0;
            const extraPct = item.purchaseDiscount?.supplierExtraDiscountPercentage || 0;
            const floatingPct = item.purchaseDiscount?.floatingDiscountPercentage || 0;
            const directAmt = (sub * directPct) / 100;
            const afterDir = sub - directAmt;
            const extraAmt = (afterDir * extraPct) / 100;
            const afterExt = afterDir - extraAmt;
            const floatingAmt = (afterExt * floatingPct) / 100;
            totalDiscount += directAmt + extraAmt + floatingAmt;
          }
        } else {
          grossRevenue = invoice.subtotal || invoice.totalAmount || 0;
          totalDiscount = invoice.totalDiscount || 0;
        }
        
        const netPaid = grossRevenue - totalDiscount; // What you actually paid
        // For supplier: "profit" = savings from discounts
        const savings = totalDiscount;
        const savingsMargin = grossRevenue > 0 ? (savings / grossRevenue) * 100 : 0;

        transformedData.push({
          id: invoice._id,
          billNo: invoice.invoiceNumber,
          date: invoice.invoiceDate,
          dealerName: 'N/A',
          supplierName: invoice.supplier?.name || invoice.supplierName || 'N/A',
          totalSalePrice: Math.round(grossRevenue),
          totalDiscount: Math.round(totalDiscount),
          totalRevenue: Math.round(netPaid),
          totalCost: Math.round(netPaid), // Cost = what you paid
          totalProfit: Math.round(savings), // "Profit" = savings from discounts
          profitMargin: Math.round(savingsMargin * 100) / 100
        });
      }
    }

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
    const { DealerInvoice, SupplierInvoice } = getModels(req.dbConnection);
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
