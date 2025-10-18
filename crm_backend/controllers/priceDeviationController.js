import SalesOrder from "../models/SalesOrder.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import DealerInvoice from "../models/DealerInvoice.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import Product from "../models/Product.js";
import Dealer from "../models/Dealer.js";
import Supplier from "../models/Supplier.js";

// Test endpoint to check database connection
export const testConnection = async (req, res) => {
  try {
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
    
    let matchQuery = {};
    
    // Date range filter
    if (fromDate || toDate) {
      matchQuery.createdAt = {};
      if (fromDate) matchQuery.createdAt.$gte = new Date(fromDate);
      if (toDate) matchQuery.createdAt.$lte = new Date(toDate);
    }

    let data = [];
    let totalCount = 0;
    
    if (type === 'sales') {
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
      
    } else {
      console.log('🔍 [PRICE_DEVIATION] Processing purchase orders');
      try {
        // Get purchase orders with populated products
        const purchaseOrders = await PurchaseOrder.find(matchQuery)
          .populate('supplierId', 'name contactPerson')
          .populate('lines.productId', 'itemName productCode rateSlabs gst')
          .sort({ createdAt: -1 });

        console.log('🔍 [PRICE_DEVIATION] Found purchase orders:', purchaseOrders.length);

        // Calculate price deviations for purchase orders
        data = purchaseOrders.map(order => {
          const deviations = order.lines.map(line => {
            const plannedPrice = line.productId?.rateSlabs?.[0]?.rate || 0;
            const actualPrice = line.price || 0;
            const deviation = actualPrice - plannedPrice;
            
            return {
              id: `${order._id}_${line.productId?._id}`,
              date: order.orderDate || order.createdAt,
              product: line.productId?.itemName || 'Unknown Product',
              supplier: order.supplierId?.name || 'Unknown Supplier',
              plannedPrice,
              actualPrice,
              deviation,
              remarks: order.notes || 'Purchase order price deviation'
            };
          });
          return deviations;
        }).flat();
      } catch (purchaseError) {
        console.error('❌ [PRICE_DEVIATION] Purchase order error:', purchaseError);
        throw purchaseError;
      }
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
      
    } else {
      console.log('🔍 [DISCOUNT_DEVIATION] Processing purchase discount deviations');
      
      // Get purchase orders with discount information
      const purchaseOrders = await PurchaseOrder.find(matchQuery)
        .populate('supplier', 'name contactPerson')
        .sort({ createdAt: -1 });

      console.log('🔍 [DISCOUNT_DEVIATION] Found purchase orders:', purchaseOrders.length);

      data = purchaseOrders.map(order => {
        const totalDiscount = order.totalDiscount || 0;
        const totalAmount = order.totalAmount || 0;
        const discountLevel = totalAmount > 0 ? (totalDiscount / totalAmount) * 100 : 0;
        
        return {
          id: order._id,
          date: order.orderDate || order.createdAt,
          dealer: order.supplierName || order.supplier?.name || 'Unknown Supplier',
          discountLevel: Math.round(discountLevel),
          schema: 'Purchase',
          discountRemark: order.discountRemarks || 'Purchase discount applied',
          remarks: order.remarks || 'Purchase discount analysis',
          finalRemark: order.status === 'Received' ? 'Approved and received' : 'Pending approval'
        };
      });
    }

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


