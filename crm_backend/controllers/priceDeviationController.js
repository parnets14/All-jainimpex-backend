import { salesOrderSchema } from "../models/SalesOrder.js";
import { purchaseOrderSchema } from "../models/PurchaseOrder.js";
import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { supplierInvoiceSchema } from "../models/SupplierInvoice.js";
import { productSchema } from "../models/Product.js";
import { dealerSchema } from "../models/Dealer.js";
import { supplierSchema } from "../models/Supplier.js";
import { grnSchema } from "../models/GRN.js";

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    SalesOrder: dbConnection.models.SalesOrder || 
                dbConnection.model('SalesOrder', salesOrderSchema),
    PurchaseOrder: dbConnection.models.PurchaseOrder || 
                   dbConnection.model('PurchaseOrder', purchaseOrderSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || 
                   dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    SupplierInvoice: dbConnection.models.SupplierInvoice || 
                     dbConnection.model('SupplierInvoice', supplierInvoiceSchema),
    Product: dbConnection.models.Product || 
             dbConnection.model('Product', productSchema),
    Dealer: dbConnection.models.Dealer || 
            dbConnection.model('Dealer', dealerSchema),
    Supplier: dbConnection.models.Supplier || 
              dbConnection.model('Supplier', supplierSchema),
    GRN: dbConnection.models.GRN || 
         dbConnection.model('GRN', grnSchema)
  };
};

// Test endpoint to check database connection
export const testConnection = async (req, res) => {
  try {
    const { PurchaseOrder, SalesOrder, Product } = getModels(req.dbConnection);
    console.log('🔍 [TEST] Testing database connection');
    
    // Test PurchaseOrder count
    const poCount = await PurchaseOrder.countDocuments();
    console.log('🔍 [TEST] PurchaseOrder count:', poCount);
    
    // Test SalesOrder count
    const soCount = await SalesOrder.countDocuments();
    console.log('🔍 [TEST] SalesOrder count:', soCount);
    
    // Test Product count
    const productCount = await Product.countDocuments();
    console.log('🔍 [TEST] Product count:', productCount);
    
    res.json({
      success: true,
      message: 'Database connection test successful',
      data: {
        purchaseOrders: poCount,
        salesOrders: soCount,
        products: productCount
      }
    });
  } catch (error) {
    console.error('❌ [TEST] Database connection test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection test failed',
      error: error.message
    });
  }
};

// Price Deviation Report
export const getPriceDeviationReport = async (req, res) => {
  try {
    const { SalesOrder, DealerInvoice, PurchaseOrder, SupplierInvoice, Product, Dealer, Supplier } = getModels(req.dbConnection);
    console.log('🔍 [PRICE_DEVIATION] Starting price deviation report');
    const { 
      type = 'sales', 
      fromDate, 
      toDate, 
      search,
      page = 1,
      limit = 10,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;
    
    console.log('🔍 [PRICE_DEVIATION] Query params:', { 
      type, fromDate, toDate, search, page, limit, sortBy, sortOrder 
    });
    
    // For purchase type, use enhanced version
    if (type === 'purchase') {
      return getEnhancedPurchasePriceDeviation(req, res);
    }
    
    let matchQuery = {};
    
    // Date range filter
    if (fromDate || toDate) {
      matchQuery.createdAt = {};
      if (fromDate) matchQuery.createdAt.$gte = new Date(fromDate);
      if (toDate) matchQuery.createdAt.$lte = new Date(toDate);
    }

    let data = [];
    let totalCount = 0;
    
    console.log('🔍 [PRICE_DEVIATION] Processing sales orders');
    try {
      // Get sales orders with populated products
      const salesOrders = await SalesOrder.find(matchQuery)
        .populate('dealer', 'name contactPerson')
        .populate('products.product', 'itemName productCode rateSlabs gst')
        .sort({ createdAt: -1 });

      console.log('🔍 [PRICE_DEVIATION] Found sales orders:', salesOrders.length);

      // Calculate price deviations for sales orders
      data = salesOrders.map(order => {
        const deviations = order.products.map(product => {
          const plannedPrice = product.product?.rateSlabs?.[0]?.rate || 0;
          const actualPrice = product.unitPrice || 0;
          const deviation = actualPrice - plannedPrice;
          
          return {
            id: `${order._id}_${product.product?._id}`,
            date: order.orderDate || order.createdAt,
            product: product.productName || product.product?.itemName || 'Unknown Product',
            supplier: order.dealerName || order.dealer?.name || 'Unknown Dealer',
            plannedPrice,
            actualPrice,
            deviation,
            remarks: order.remarks || 'Sales order price deviation'
          };
        });
        return deviations;
      }).flat();
    } catch (salesError) {
      console.error('❌ [PRICE_DEVIATION] Sales order error:', salesError);
      throw salesError;
    }

    console.log('🔍 [PRICE_DEVIATION] Generated deviations:', data.length);

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(item => 
        item.product.toLowerCase().includes(searchLower) ||
        item.supplier.toLowerCase().includes(searchLower) ||
        item.remarks.toLowerCase().includes(searchLower)
      );
      console.log('🔍 [PRICE_DEVIATION] After search filter:', data.length);
    }

    // Store total count before pagination
    totalCount = data.length;

    // Apply sorting
    const sortField = sortBy === 'date' ? 'date' : sortBy;
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    
    data.sort((a, b) => {
      if (sortField === 'date') {
        return sortDirection * (new Date(a.date) - new Date(b.date));
      } else if (sortField === 'deviation') {
        return sortDirection * (a.deviation - b.deviation);
      } else if (sortField === 'product') {
        return sortDirection * a.product.localeCompare(b.product);
      } else if (sortField === 'supplier') {
        return sortDirection * a.supplier.localeCompare(b.supplier);
      }
      return 0;
    });

    // Apply pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const paginatedData = data.slice(skip, skip + limitNum);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    console.log('🔍 [PRICE_DEVIATION] Pagination info:', {
      page: pageNum,
      limit: limitNum,
      totalCount,
      totalPages,
      hasNextPage,
      hasPrevPage,
      returnedItems: paginatedData.length
    });

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage,
        hasPrevPage
      },
      type
    });

  } catch (error) {
    console.error('❌ [PRICE_DEVIATION] Error fetching price deviation report:', error);
    console.error('❌ [PRICE_DEVIATION] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error fetching price deviation report',
      error: error.message
    });
  }
};

// Credit Deviation Report
export const getCreditDeviationReport = async (req, res) => {
  try {
    const { SalesOrder, DealerInvoice, Dealer, SupplierInvoice, Supplier } = getModels(req.dbConnection);
    const { 
      type = 'sales', 
      fromDate, 
      toDate, 
      search,
      page = 1,
      limit = 10,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;
    
    let matchQuery = {};
    
    // Date range filter
    if (fromDate || toDate) {
      matchQuery.createdAt = {};
      if (fromDate) matchQuery.createdAt.$gte = new Date(fromDate);
      if (toDate) matchQuery.createdAt.$lte = new Date(toDate);
    }

    let data = [];
    
    if (type === 'sales') {
      // Get dealer invoices for credit analysis
      const invoices = await DealerInvoice.find(matchQuery)
        .populate('dealer', 'name contactPerson')
        .sort({ createdAt: -1 });

      data = invoices.map(invoice => {
        const totalSale = invoice.totalAmount || 0;
        const cashReceived = invoice.paidAmount || 0;
        const creditGiven = totalSale - cashReceived;
        const deviation = totalSale > 0 ? (creditGiven / totalSale) * 100 : 0;
        
        return {
          id: invoice._id,
          date: invoice.invoiceDate || invoice.createdAt,
          customer: invoice.dealerName || invoice.dealer?.name || 'Unknown Customer',
          totalSale,
          cashReceived,
          creditGiven,
          deviation,
          remarks: invoice.remarks || 'Credit deviation analysis'
        };
      });
      
    } else {
      // Get supplier invoices for credit analysis
      const invoices = await SupplierInvoice.find(matchQuery)
        .populate('supplier', 'name contactPerson')
        .sort({ createdAt: -1 });

      data = invoices.map(invoice => {
        const totalPurchase = invoice.totalAmount || 0;
        const cashPaid = invoice.paidAmount || 0;
        const creditTaken = totalPurchase - cashPaid;
        const deviation = totalPurchase > 0 ? (creditTaken / totalPurchase) * 100 : 0;
        
        return {
          id: invoice._id,
          date: invoice.invoiceDate || invoice.createdAt,
          supplier: invoice.supplierName || invoice.supplier?.name || 'Unknown Supplier',
          totalPurchase,
          cashPaid,
          creditTaken,
          deviation,
          remarks: invoice.remarks || 'Credit deviation analysis'
        };
      });
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(item => 
        (item.customer || item.supplier).toLowerCase().includes(searchLower) ||
        item.remarks.toLowerCase().includes(searchLower)
      );
    }

    // Store total count before pagination
    const totalCount = data.length;

    // Apply sorting
    const sortField = sortBy === 'date' ? 'date' : sortBy;
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    
    data.sort((a, b) => {
      if (sortField === 'date') {
        return sortDirection * (new Date(a.date) - new Date(b.date));
      } else if (sortField === 'deviation') {
        return sortDirection * (a.deviation - b.deviation);
      } else if (sortField === 'customer' || sortField === 'supplier') {
        const nameA = a.customer || a.supplier;
        const nameB = b.customer || b.supplier;
        return sortDirection * nameA.localeCompare(nameB);
      }
      return 0;
    });

    // Apply pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const paginatedData = data.slice(skip, skip + limitNum);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage,
        hasPrevPage
      },
      type
    });

  } catch (error) {
    console.error('Error fetching credit deviation report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching credit deviation report',
      error: error.message
    });
  }
};

// Payment Deviation Report
export const getPaymentDeviationReport = async (req, res) => {
  try {
    const { SalesOrder, DealerInvoice, Dealer, SupplierInvoice, Supplier } = getModels(req.dbConnection);
    const { 
      type = 'sales', 
      fromDate, 
      toDate, 
      search,
      page = 1,
      limit = 10,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;
    
    let matchQuery = {};
    
    // Date range filter
    if (fromDate || toDate) {
      matchQuery.createdAt = {};
      if (fromDate) matchQuery.createdAt.$gte = new Date(fromDate);
      if (toDate) matchQuery.createdAt.$lte = new Date(toDate);
    }

    let data = [];
    
    if (type === 'sales') {
      console.log('🔍 [PAYMENT_DEVIATION] Processing sales payment deviations');
      
      // Get dealer invoices with payment information
      const invoices = await DealerInvoice.find({
        ...matchQuery,
        status: { $in: ['paid', 'partially_paid', 'overdue'] }
      })
        .populate('dealer', 'name contactPerson')
        .sort({ createdAt: -1 });

      console.log('🔍 [PAYMENT_DEVIATION] Found dealer invoices:', invoices.length);

      data = invoices.map(invoice => {
        const dueDate = invoice.dueDate || invoice.createdAt;
        const actualDate = invoice.paymentDate || invoice.updatedAt;
        const delayDays = Math.max(0, Math.floor((actualDate - dueDate) / (1000 * 60 * 60 * 24)));
        
        return {
          id: invoice._id,
          customer: invoice.dealerName || invoice.dealer?.name || 'Unknown Customer',
          amount: invoice.totalAmount || 0,
          dueDate,
          actualDate,
          delayDays,
          remarks: invoice.paymentRemarks || 'Payment deviation analysis',
          invoiceNumber: invoice.invoiceNumber || 'N/A'
        };
      });
      
    } else {
      console.log('🔍 [PAYMENT_DEVIATION] Processing purchase payment deviations');
      
      // Get supplier invoices with payment information
      const invoices = await SupplierInvoice.find({
        ...matchQuery,
        status: { $in: ['paid', 'partially_paid', 'overdue'] }
      })
        .populate('supplier', 'name contactPerson')
        .sort({ createdAt: -1 });

      console.log('🔍 [PAYMENT_DEVIATION] Found supplier invoices:', invoices.length);

      data = invoices.map(invoice => {
        const dueDate = invoice.dueDate || invoice.createdAt;
        const actualDate = invoice.paymentDate || invoice.updatedAt;
        const delayDays = Math.max(0, Math.floor((actualDate - dueDate) / (1000 * 60 * 60 * 24)));
        
        return {
          id: invoice._id,
          supplier: invoice.supplierName || invoice.supplier?.name || 'Unknown Supplier',
          amount: invoice.totalAmount || 0,
          dueDate,
          actualDate,
          delayDays,
          remarks: invoice.paymentRemarks || 'Payment deviation analysis',
          invoiceNumber: invoice.invoiceNumber || 'N/A'
        };
      });
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(item => 
        (item.customer || item.supplier).toLowerCase().includes(searchLower) ||
        item.remarks.toLowerCase().includes(searchLower) ||
        (item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(searchLower))
      );
    }

    // Store total count before pagination
    const totalCount = data.length;

    // Apply sorting
    const sortField = sortBy === 'date' ? 'dueDate' : sortBy;
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    
    data.sort((a, b) => {
      if (sortField === 'dueDate' || sortField === 'date') {
        return sortDirection * (new Date(a.dueDate) - new Date(b.dueDate));
      } else if (sortField === 'delayDays') {
        return sortDirection * (a.delayDays - b.delayDays);
      } else if (sortField === 'amount') {
        return sortDirection * (a.amount - b.amount);
      } else if (sortField === 'customer' || sortField === 'supplier') {
        const nameA = a.customer || a.supplier;
        const nameB = b.customer || b.supplier;
        return sortDirection * nameA.localeCompare(nameB);
      }
      return 0;
    });

    // Apply pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const paginatedData = data.slice(skip, skip + limitNum);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    console.log('🔍 [PAYMENT_DEVIATION] Pagination info:', {
      page: pageNum,
      limit: limitNum,
      totalCount,
      totalPages,
      hasNextPage,
      hasPrevPage,
      returnedItems: paginatedData.length
    });

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage,
        hasPrevPage
      },
      type
    });

  } catch (error) {
    console.error('Error fetching payment deviation report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment deviation report',
      error: error.message
    });
  }
};

// Discount Deviation Report
export const getDiscountDeviationReport = async (req, res) => {
  try {
    const { SalesOrder, DealerInvoice, Product, Dealer } = getModels(req.dbConnection);
    const { 
      type = 'sales', 
      fromDate, 
      toDate, 
      search,
      page = 1,
      limit = 10,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;
    
    // For purchase type, use enhanced version
    if (type === 'purchase') {
      return getEnhancedPurchaseDiscountDeviation(req, res);
    }
    
    let matchQuery = {};
    
    // Date range filter
    if (fromDate || toDate) {
      matchQuery.createdAt = {};
      if (fromDate) matchQuery.createdAt.$gte = new Date(fromDate);
      if (toDate) matchQuery.createdAt.$lte = new Date(toDate);
    }

    let data = [];
    
    console.log('🔍 [DISCOUNT_DEVIATION] Processing sales discount deviations');
    
    // Get sales orders with discount information
    const salesOrders = await SalesOrder.find(matchQuery)
      .populate('dealer', 'name contactPerson dealerType')
      .sort({ createdAt: -1 });

    console.log('🔍 [DISCOUNT_DEVIATION] Found sales orders:', salesOrders.length);

    data = salesOrders.map(order => {
      const totalDiscount = order.totalDiscount || 0;
      const totalAmount = order.totalAmount || 0;
      const discountLevel = totalAmount > 0 ? (totalDiscount / totalAmount) * 100 : 0;
      
      return {
        id: order._id,
        date: order.orderDate || order.createdAt,
        dealer: order.dealerName || order.dealer?.name || 'Unknown Dealer',
        discountLevel: Math.round(discountLevel),
        schema: order.dealer?.dealerType || 'Standard',
        discountRemark: order.discountRemarks || 'Standard discount applied',
        remarks: order.remarks || 'Discount deviation analysis',
        finalRemark: order.status === 'Delivered' ? 'Approved and delivered' : 'Pending approval'
      };
    });

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(item => 
        item.dealer.toLowerCase().includes(searchLower) ||
        item.discountRemark.toLowerCase().includes(searchLower) ||
        item.remarks.toLowerCase().includes(searchLower)
      );
    }

    // Store total count before pagination
    const totalCount = data.length;

    // Apply sorting
    const sortField = sortBy === 'date' ? 'date' : sortBy;
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    
    data.sort((a, b) => {
      if (sortField === 'date') {
        return sortDirection * (new Date(a.date) - new Date(b.date));
      } else if (sortField === 'discountLevel') {
        return sortDirection * (a.discountLevel - b.discountLevel);
      } else if (sortField === 'dealer') {
        return sortDirection * a.dealer.localeCompare(b.dealer);
      }
      return 0;
    });

    // Apply pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const paginatedData = data.slice(skip, skip + limitNum);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    console.log('🔍 [DISCOUNT_DEVIATION] Pagination info:', {
      page: pageNum,
      limit: limitNum,
      totalCount,
      totalPages,
      hasNextPage,
      hasPrevPage,
      returnedItems: paginatedData.length
    });

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage,
        hasPrevPage
      },
      type
    });

  } catch (error) {
    console.error('Error fetching discount deviation report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching discount deviation report',
      error: error.message
    });
  }
};



// Enhanced Price Deviation Report - Purchase Side (Product Master Price vs Invoice Price)
export const getEnhancedPurchasePriceDeviation = async (req, res) => {
  try {
    const { SupplierInvoice, Product, Supplier } = getModels(req.dbConnection);
    console.log('🔍 [ENHANCED_PRICE_DEVIATION] Starting enhanced purchase price deviation report');
    const { 
      fromDate, 
      toDate, 
      search,
      page = 1,
      limit = 10,
      sortBy = 'invoiceDate',
      sortOrder = 'desc',
      supplier,
      status,
      deviationRange,
      product
    } = req.query;
    
    let matchQuery = {};
    
    // Date range filter on invoice date
    if (fromDate || toDate) {
      matchQuery.invoiceDate = {};
      if (fromDate) matchQuery.invoiceDate.$gte = new Date(fromDate);
      if (toDate) matchQuery.invoiceDate.$lte = new Date(toDate);
    }

    // Supplier filter
    if (supplier) {
      matchQuery.supplier = supplier;
    }

    // Status filter
    if (status) {
      matchQuery.status = status;
    }

    // Get supplier invoices with populated data
    const invoices = await SupplierInvoice.find(matchQuery)
      .populate('supplier', 'name contactPerson')
      .populate('purchaseOrder', 'poNumber lines')
      .populate('items.product', 'itemName productCode unitPrice')
      .sort({ invoiceDate: -1 });

    console.log('🔍 [ENHANCED_PRICE_DEVIATION] Found supplier invoices:', invoices.length);

    let data = [];

    // Process each invoice and compare with Product Master Price
    for (const invoice of invoices) {
      for (const invoiceItem of invoice.items) {
        if (!invoiceItem.product) continue;

        // Product filter
        if (product && invoiceItem.product._id.toString() !== product) continue;

        // Get master price from Product
        const masterPrice = invoiceItem.product.unitPrice || 0;
        
        // Get PO price if available
        let poPrice = 0;
        if (invoice.purchaseOrder && invoice.purchaseOrder.lines) {
          const poLine = invoice.purchaseOrder.lines.find(
            line => line.productId && line.productId.toString() === invoiceItem.product._id.toString()
          );
          poPrice = poLine ? (poLine.price || 0) : 0;
        }

        // Get actual invoice price
        const invoicePrice = invoiceItem.unitPrice || 0;
        
        // Calculate deviation from master price
        const priceDeviation = invoicePrice - masterPrice;
        const deviationPercentage = masterPrice > 0 ? ((priceDeviation / masterPrice) * 100) : 0;

        // Deviation range filter
        if (deviationRange) {
          const absDeviation = Math.abs(deviationPercentage);
          if (deviationRange === '0-5' && (absDeviation < 0 || absDeviation > 5)) continue;
          if (deviationRange === '5-10' && (absDeviation < 5 || absDeviation > 10)) continue;
          if (deviationRange === '10-20' && (absDeviation < 10 || absDeviation > 20)) continue;
          if (deviationRange === '20+' && absDeviation < 20) continue;
        }

        data.push({
          _id: `${invoice._id}_${invoiceItem.product._id}`,
          invoiceDate: invoice.invoiceDate,
          invoiceNumber: invoice.invoiceNumber,
          poNumber: invoice.purchaseOrder?.poNumber || 'N/A',
          supplierName: invoice.supplierName || invoice.supplier?.name || 'Unknown',
          supplierId: invoice.supplier?._id,
          productName: invoiceItem.productName || invoiceItem.product?.itemName || 'Unknown',
          productId: invoiceItem.product._id,
          masterPrice, // Product Master Price
          poPrice, // PO Price (for reference)
          invoicePrice, // Actual Invoice Price
          priceDeviation, // Deviation from Master Price
          deviationPercentage,
          status: invoice.status
        });
      }
    }

    console.log('🔍 [ENHANCED_PRICE_DEVIATION] Generated price deviations:', data.length);

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(item => 
        item.supplierName.toLowerCase().includes(searchLower) ||
        item.productName.toLowerCase().includes(searchLower) ||
        item.invoiceNumber.toLowerCase().includes(searchLower) ||
        item.poNumber.toLowerCase().includes(searchLower)
      );
    }

    // Store total count before pagination
    const totalCount = data.length;

    // Apply sorting
    data.sort((a, b) => {
      const direction = sortOrder === 'desc' ? -1 : 1;
      if (sortBy === 'invoiceDate') {
        return direction * (new Date(a.invoiceDate) - new Date(b.invoiceDate));
      } else if (sortBy === 'priceDeviation') {
        return direction * (a.priceDeviation - b.priceDeviation);
      } else if (sortBy === 'deviationPercentage') {
        return direction * (a.deviationPercentage - b.deviationPercentage);
      }
      return 0;
    });

    // Apply pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const paginatedData = data.slice(skip, skip + limitNum);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (error) {
    console.error('❌ [ENHANCED_PRICE_DEVIATION] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching enhanced price deviation report',
      error: error.message
    });
  }
};

// Quantity Deviation Report - Purchase Side (PO vs GRN)
export const getQuantityDeviationReport = async (req, res) => {
  try {
    const { PurchaseOrder, Product, Supplier, GRN } = getModels(req.dbConnection);
    console.log('🔍 [QUANTITY_DEVIATION] Starting quantity deviation report');
    const { 
      fromDate, 
      toDate, 
      search,
      page = 1,
      limit = 10,
      sortBy = 'grnDate',
      sortOrder = 'desc',
      supplier,
      status,
      deviationRange,
      product
    } = req.query;
    
    let matchQuery = {};
    
    // Date range filter on GRN date
    if (fromDate || toDate) {
      matchQuery.grnDate = {};
      if (fromDate) matchQuery.grnDate.$gte = new Date(fromDate);
      if (toDate) matchQuery.grnDate.$lte = new Date(toDate);
    }

    // Supplier filter
    if (supplier) {
      matchQuery.supplierId = supplier;
    }

    // Status filter
    if (status) {
      matchQuery.status = status;
    }

    // Get GRNs with populated data
    const grns = await GRN.find(matchQuery)
      .populate('supplierId', 'name contactPerson')
      .populate('poId', 'poNumber lines')
      .populate('items.productId', 'itemName productCode')
      .sort({ grnDate: -1 });

    console.log('🔍 [QUANTITY_DEVIATION] Found GRNs:', grns.length);

    let data = [];

    // Process each GRN and compare with PO
    for (const grn of grns) {
      if (!grn.poId) continue;

      for (const grnItem of grn.items) {
        // Product filter
        if (product && grnItem.productId._id.toString() !== product) continue;

        // Find matching PO line item
        const poLine = grn.poId.lines.find(
          line => line.productId.toString() === grnItem.productId._id.toString()
        );

        if (poLine) {
          const orderedQuantity = poLine.quantity || 0;
          const receivedQuantity = grnItem.receivedQuantity || 0;
          const damagedQuantity = grnItem.damageQuantity || 0;
          const acceptedQuantity = grnItem.acceptedQuantity || 0;
          const quantityDeviation = acceptedQuantity - orderedQuantity;
          const deviationPercentage = orderedQuantity > 0 ? ((quantityDeviation / orderedQuantity) * 100) : 0;

          // Deviation range filter
          if (deviationRange) {
            const absDeviation = Math.abs(deviationPercentage);
            if (deviationRange === '0-5' && (absDeviation < 0 || absDeviation > 5)) continue;
            if (deviationRange === '5-10' && (absDeviation < 5 || absDeviation > 10)) continue;
            if (deviationRange === '10-20' && (absDeviation < 10 || absDeviation > 20)) continue;
            if (deviationRange === '20+' && absDeviation < 20) continue;
          }

          // Determine item-level status
          let itemStatus = 'Exact Match';
          if (quantityDeviation < 0) {
            itemStatus = 'Short Delivery';
          } else if (quantityDeviation > 0) {
            itemStatus = 'Over Delivery';
          }

          data.push({
            _id: `${grn._id}_${grnItem.productId._id}`,
            grnDate: grn.grnDate,
            grnNumber: grn.grnNo,
            poNumber: grn.poId.poNumber,
            supplierName: grn.supplierId?.name || 'Unknown',
            supplierId: grn.supplierId?._id,
            productName: grnItem.productId?.itemName || 'Unknown',
            productId: grnItem.productId._id,
            orderedQuantity,
            receivedQuantity,
            damagedQuantity,
            acceptedQuantity,
            quantityDeviation,
            deviationPercentage,
            itemStatus,
            status: grn.status
          });
        }
      }
    }

    console.log('🔍 [QUANTITY_DEVIATION] Generated quantity deviations:', data.length);

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(item => 
        item.supplierName.toLowerCase().includes(searchLower) ||
        item.productName.toLowerCase().includes(searchLower) ||
        item.grnNumber.toLowerCase().includes(searchLower) ||
        item.poNumber.toLowerCase().includes(searchLower)
      );
    }

    // Store total count before pagination
    const totalCount = data.length;

    // Apply sorting
    data.sort((a, b) => {
      const direction = sortOrder === 'desc' ? -1 : 1;
      if (sortBy === 'grnDate') {
        return direction * (new Date(a.grnDate) - new Date(b.grnDate));
      } else if (sortBy === 'quantityDeviation') {
        return direction * (a.quantityDeviation - b.quantityDeviation);
      } else if (sortBy === 'deviationPercentage') {
        return direction * (a.deviationPercentage - b.deviationPercentage);
      }
      return 0;
    });

    // Apply pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const paginatedData = data.slice(skip, skip + limitNum);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (error) {
    console.error('❌ [QUANTITY_DEVIATION] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching quantity deviation report',
      error: error.message
    });
  }
};

// Enhanced Discount Deviation Report - Purchase Side (PO Floating Discount vs Invoice Floating Discount)
export const getEnhancedPurchaseDiscountDeviation = async (req, res) => {
  try {
    const { PurchaseOrder, SupplierInvoice, Product, Supplier } = getModels(req.dbConnection);
    console.log('🔍 [ENHANCED_DISCOUNT_DEVIATION] Starting enhanced purchase discount deviation report');
    const { 
      fromDate, 
      toDate, 
      search,
      page = 1,
      limit = 10,
      sortBy = 'invoiceDate',
      sortOrder = 'desc',
      supplier,
      status,
      deviationRange,
      product
    } = req.query;
    
    let matchQuery = {};
    
    // Date range filter on invoice date
    if (fromDate || toDate) {
      matchQuery.invoiceDate = {};
      if (fromDate) matchQuery.invoiceDate.$gte = new Date(fromDate);
      if (toDate) matchQuery.invoiceDate.$lte = new Date(toDate);
    }

    // Supplier filter
    if (supplier) {
      matchQuery.supplier = supplier;
    }

    // Status filter
    if (status) {
      matchQuery.status = status;
    }

    // Get supplier invoices with populated data
    const invoices = await SupplierInvoice.find(matchQuery)
      .populate('supplier', 'name contactPerson')
      .populate('purchaseOrder', 'poNumber lines')
      .populate('items.product', 'itemName productCode')
      .sort({ invoiceDate: -1 });

    console.log('🔍 [ENHANCED_DISCOUNT_DEVIATION] Found supplier invoices:', invoices.length);

    let data = [];

    // Process each invoice and compare floating discounts with PO
    for (const invoice of invoices) {
      if (!invoice.purchaseOrder) continue;

      for (const invoiceItem of invoice.items) {
        // Product filter
        if (product && invoiceItem.product._id.toString() !== product) continue;

        // Find matching PO line item
        const poLine = invoice.purchaseOrder.lines.find(
          line => line.productId.toString() === invoiceItem.product._id.toString()
        );

        if (poLine) {
          // Get floating discount from PO (reference floating discount)
          const poFloatingDiscount = poLine.purchaseDiscount?.referenceFloatingDiscount || 0;
          
          // Get actual floating discount from invoice
          const invoiceFloatingDiscount = invoiceItem.purchaseDiscount?.floatingDiscountPercentage || 0;
          
          // Calculate deviation
          const discountDeviation = invoiceFloatingDiscount - poFloatingDiscount;
          
          // Calculate deviation percentage (for range filter)
          const deviationPercentage = Math.abs(discountDeviation);

          // Deviation range filter
          if (deviationRange) {
            if (deviationRange === '0-5' && (deviationPercentage < 0 || deviationPercentage > 5)) continue;
            if (deviationRange === '5-10' && (deviationPercentage < 5 || deviationPercentage > 10)) continue;
            if (deviationRange === '10-20' && (deviationPercentage < 10 || deviationPercentage > 20)) continue;
            if (deviationRange === '20+' && deviationPercentage < 20) continue;
          }
          
          // Calculate amount impact
          const baseAmount = invoiceItem.quantity * invoiceItem.unitPrice;
          const amountImpact = (baseAmount * discountDeviation) / 100;

          data.push({
            _id: `${invoice._id}_${invoiceItem.product._id}`,
            invoiceDate: invoice.invoiceDate,
            invoiceNumber: invoice.invoiceNumber,
            poNumber: invoice.purchaseOrder.poNumber,
            supplierName: invoice.supplierName || invoice.supplier?.name || 'Unknown',
            supplierId: invoice.supplier?._id,
            productName: invoiceItem.productName || invoiceItem.product?.itemName || 'Unknown',
            productId: invoiceItem.product._id,
            poFloatingDiscount,
            invoiceFloatingDiscount,
            discountDeviation,
            deviationPercentage,
            amountImpact,
            status: invoice.status
          });
        }
      }
    }

    console.log('🔍 [ENHANCED_DISCOUNT_DEVIATION] Generated discount deviations:', data.length);

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(item => 
        item.supplierName.toLowerCase().includes(searchLower) ||
        item.productName.toLowerCase().includes(searchLower) ||
        item.invoiceNumber.toLowerCase().includes(searchLower) ||
        item.poNumber.toLowerCase().includes(searchLower)
      );
    }

    // Store total count before pagination
    const totalCount = data.length;

    // Apply sorting
    data.sort((a, b) => {
      const direction = sortOrder === 'desc' ? -1 : 1;
      if (sortBy === 'invoiceDate') {
        return direction * (new Date(a.invoiceDate) - new Date(b.invoiceDate));
      } else if (sortBy === 'discountDeviation') {
        return direction * (a.discountDeviation - b.discountDeviation);
      } else if (sortBy === 'amountImpact') {
        return direction * (a.amountImpact - b.amountImpact);
      }
      return 0;
    });

    // Apply pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const paginatedData = data.slice(skip, skip + limitNum);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (error) {
    console.error('❌ [ENHANCED_DISCOUNT_DEVIATION] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching enhanced discount deviation report',
      error: error.message
    });
  }
};
