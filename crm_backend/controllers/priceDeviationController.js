import SalesOrder from "../models/SalesOrder.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import DealerInvoice from "../models/DealerInvoice.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import Product from "../models/Product.js";
import Dealer from "../models/Dealer.js";
import Supplier from "../models/Supplier.js";

// Price Deviation Report
export const getPriceDeviationReport = async (req, res) => {
  try {
    const { type = 'sales', fromDate, toDate, search } = req.query;
    
    let matchQuery = {};
    
    // Date range filter
    if (fromDate || toDate) {
      matchQuery.createdAt = {};
      if (fromDate) matchQuery.createdAt.$gte = new Date(fromDate);
      if (toDate) matchQuery.createdAt.$lte = new Date(toDate);
    }

    let data = [];
    
    if (type === 'sales') {
      // Get sales orders with populated products
      const salesOrders = await SalesOrder.find(matchQuery)
        .populate('dealer', 'name contactPerson')
        .populate('products.product', 'itemName productCode rateSlabs gst')
        .sort({ createdAt: -1 });

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
      
    } else {
      // Get purchase orders with populated products
      const purchaseOrders = await PurchaseOrder.find(matchQuery)
        .populate('supplier', 'name contactPerson')
        .populate('products.product', 'itemName productCode rateSlabs gst')
        .sort({ createdAt: -1 });

      // Calculate price deviations for purchase orders
      data = purchaseOrders.map(order => {
        const deviations = order.products.map(product => {
          const plannedPrice = product.product?.rateSlabs?.[0]?.rate || 0;
          const actualPrice = product.unitPrice || 0;
          const deviation = actualPrice - plannedPrice;
          
          return {
            id: `${order._id}_${product.product?._id}`,
            date: order.orderDate || order.createdAt,
            product: product.productName || product.product?.itemName || 'Unknown Product',
            supplier: order.supplierName || order.supplier?.name || 'Unknown Supplier',
            plannedPrice,
            actualPrice,
            deviation,
            remarks: order.remarks || 'Purchase order price deviation'
          };
        });
        return deviations;
      }).flat();
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(item => 
        item.product.toLowerCase().includes(searchLower) ||
        item.supplier.toLowerCase().includes(searchLower) ||
        item.remarks.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      data,
      total: data.length,
      type
    });

  } catch (error) {
    console.error('Error fetching price deviation report:', error);
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
    const { type = 'sales', fromDate, toDate, search } = req.query;
    
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

    res.json({
      success: true,
      data,
      total: data.length,
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
    const { type = 'sales', fromDate, toDate, search } = req.query;
    
    let matchQuery = {};
    
    // Date range filter
    if (fromDate || toDate) {
      matchQuery.createdAt = {};
      if (fromDate) matchQuery.createdAt.$gte = new Date(fromDate);
      if (toDate) matchQuery.createdAt.$lte = new Date(toDate);
    }

    let data = [];
    
    if (type === 'sales') {
      // Get dealer invoices with payment information
      const invoices = await DealerInvoice.find({
        ...matchQuery,
        status: { $in: ['paid', 'partially_paid', 'overdue'] }
      })
        .populate('dealer', 'name contactPerson')
        .sort({ createdAt: -1 });

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
          remarks: invoice.paymentRemarks || 'Payment deviation analysis'
        };
      });
      
    } else {
      // Get supplier invoices with payment information
      const invoices = await SupplierInvoice.find({
        ...matchQuery,
        status: { $in: ['paid', 'partially_paid', 'overdue'] }
      })
        .populate('supplier', 'name contactPerson')
        .sort({ createdAt: -1 });

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
          remarks: invoice.paymentRemarks || 'Payment deviation analysis'
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

    res.json({
      success: true,
      data,
      total: data.length,
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
    const { type = 'sales', fromDate, toDate, search } = req.query;
    
    let matchQuery = {};
    
    // Date range filter
    if (fromDate || toDate) {
      matchQuery.createdAt = {};
      if (fromDate) matchQuery.createdAt.$gte = new Date(fromDate);
      if (toDate) matchQuery.createdAt.$lte = new Date(toDate);
    }

    let data = [];
    
    if (type === 'sales') {
      // Get sales orders with discount information
      const salesOrders = await SalesOrder.find(matchQuery)
        .populate('dealer', 'name contactPerson dealerType')
        .sort({ createdAt: -1 });

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
      // Get purchase orders with discount information
      const purchaseOrders = await PurchaseOrder.find(matchQuery)
        .populate('supplier', 'name contactPerson')
        .sort({ createdAt: -1 });

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

    res.json({
      success: true,
      data,
      total: data.length,
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
