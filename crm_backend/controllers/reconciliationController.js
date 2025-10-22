import PurchaseOrder from "../models/PurchaseOrder.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import GRN from "../models/GRN.js";
import SupplierPayment from "../models/SupplierPayment.js";
import SupplierLedger from "../models/SupplierLedger.js";
import Supplier from "../models/Supplier.js";

// @desc    Get suppliers for reconciliation
// @route   GET /api/reconciliation/suppliers
// @access  Private
export const getSuppliersForReconciliation = async (req, res) => {
  try {
    const { search } = req.query;
    
    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const suppliers = await Supplier.find(query)
      .select('name code gstin address phone email')
      .sort({ name: 1 })
      .limit(50);

    res.json({
      success: true,
      suppliers
    });
  } catch (error) {
    console.error("Get Suppliers for Reconciliation Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching suppliers for reconciliation",
      error: error.message
    });
  }
};

// @desc    Get purchase orders for reconciliation
// @route   GET /api/reconciliation/purchase-orders
// @access  Private
export const getPurchaseOrdersForReconciliation = async (req, res) => {
  try {
    const { supplierId, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (supplierId) {
      query.supplierId = supplierId;
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const total = await PurchaseOrder.countDocuments(query);

    const purchaseOrders = await PurchaseOrder.find(query)
      .populate('supplierId', 'name code')
      .populate('warehouseId', 'name')
      .populate('lines.productId', 'productCode itemName')
      .populate('createdBy', 'name email')
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limitNumber);

    res.json({
      success: true,
      purchaseOrders,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(total / limitNumber),
        totalItems: total,
        itemsPerPage: limitNumber
      }
    });
  } catch (error) {
    console.error("Get Purchase Orders for Reconciliation Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching purchase orders for reconciliation",
      error: error.message
    });
  }
};

// @desc    Get GRNs for reconciliation
// @route   GET /api/reconciliation/grns
// @access  Private
export const getGRNsForReconciliation = async (req, res) => {
  try {
    const { supplierId, poId, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (supplierId) {
      query.supplierId = supplierId;
    }
    if (poId) {
      query.poId = poId;
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const total = await GRN.countDocuments(query);

    const grns = await GRN.find(query)
      .populate('supplierId', 'name code')
      .populate('poId', 'poNumber orderDate')
      .populate('warehouseId', 'name')
      .populate('items.productId', 'productCode itemName')
      .populate('createdBy', 'name email')
      .sort({ grnDate: -1 })
      .skip(skip)
      .limit(limitNumber);

    res.json({
      success: true,
      grns,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(total / limitNumber),
        totalItems: total,
        itemsPerPage: limitNumber
      }
    });
  } catch (error) {
    console.error("Get GRNs for Reconciliation Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching GRNs for reconciliation",
      error: error.message
    });
  }
};

// @desc    Get supplier invoices for reconciliation
// @route   GET /api/reconciliation/supplier-invoices
// @access  Private
export const getSupplierInvoicesForReconciliation = async (req, res) => {
  try {
    const { supplierId, poId, grnId, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (supplierId) {
      query.supplier = supplierId;
    }
    if (poId) {
      query.purchaseOrder = poId;
    }
    if (grnId) {
      query.grn = grnId;
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const total = await SupplierInvoice.countDocuments(query);

    const invoices = await SupplierInvoice.find(query)
      .populate('supplier', 'name code')
      .populate('grn', 'grnNo grnDate')
      .populate('purchaseOrder', 'poNumber orderDate')
      .populate('items.product', 'productCode itemName')
      .populate('createdBy', 'name email')
      .sort({ invoiceDate: -1 })
      .skip(skip)
      .limit(limitNumber);

    res.json({
      success: true,
      invoices,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(total / limitNumber),
        totalItems: total,
        itemsPerPage: limitNumber
      }
    });
  } catch (error) {
    console.error("Get Supplier Invoices for Reconciliation Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier invoices for reconciliation",
      error: error.message
    });
  }
};

// @desc    Get supplier payments for reconciliation
// @route   GET /api/reconciliation/supplier-payments
// @access  Private
export const getSupplierPaymentsForReconciliation = async (req, res) => {
  try {
    const { supplierId, invoiceId, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (supplierId) {
      query.supplier = supplierId;
    }
    if (invoiceId) {
      query.invoices = invoiceId;
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const total = await SupplierPayment.countDocuments(query);

    const payments = await SupplierPayment.find(query)
      .populate('supplier', 'name code')
      .populate('supplierInvoice', 'invoiceNumber invoiceDate totalAmount')
      .populate('createdBy', 'name email')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limitNumber);

    res.json({
      success: true,
      payments,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(total / limitNumber),
        totalItems: total,
        itemsPerPage: limitNumber
      }
    });
  } catch (error) {
    console.error("Get Supplier Payments for Reconciliation Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier payments for reconciliation",
      error: error.message
    });
  }
};

// @desc    Perform automatic reconciliation for a supplier
// @route   POST /api/reconciliation/auto-reconcile
// @access  Private
export const performAutoReconciliation = async (req, res) => {
  try {
    const { supplierId, dateRange, page = 1, limit = 10 } = req.body;

    if (!supplierId) {
      return res.status(400).json({
        success: false,
        message: "Supplier ID is required"
      });
    }

    // Build date filter
    let dateFilter = {};
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      dateFilter = {
        $gte: new Date(dateRange.startDate),
        $lte: new Date(dateRange.endDate)
      };
    }

    // Pagination parameters
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    console.log('Starting reconciliation for supplier:', supplierId);
    console.log('Date filter:', dateFilter);
    console.log('Pagination:', { page: pageNumber, limit: limitNumber, skip });

    // Build base query for supplier
    const poQuery = { supplierId };
    const grnQuery = { supplierId };
    const invoiceQuery = { supplier: supplierId };
    const paymentQuery = { supplier: supplierId };
    const ledgerQuery = { supplier: supplierId };

    // Add date filters
    if (Object.keys(dateFilter).length > 0) {
      poQuery.orderDate = dateFilter;
      grnQuery.grnDate = dateFilter;
      invoiceQuery.invoiceDate = dateFilter;
      paymentQuery.paymentDate = dateFilter;
      ledgerQuery.entryDate = dateFilter;
    }

    // Get total counts for pagination
    const [totalPOs, totalGRNs, totalInvoices, totalPayments, totalLedgerEntries] = await Promise.all([
      PurchaseOrder.countDocuments(poQuery),
      GRN.countDocuments(grnQuery),
      SupplierInvoice.countDocuments(invoiceQuery),
      SupplierPayment.countDocuments(paymentQuery),
      SupplierLedger.countDocuments(ledgerQuery)
    ]);

    // Get paginated data for the supplier
    const [purchaseOrders, grns, invoices, payments, ledgerEntries] = await Promise.all([
      PurchaseOrder.find(poQuery)
        .populate('lines.productId', 'productCode itemName')
        .sort({ orderDate: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      
      GRN.find(grnQuery)
        .populate('poId', 'poNumber orderDate')
        .populate('items.productId', 'productCode itemName')
        .sort({ grnDate: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      
      SupplierInvoice.find(invoiceQuery)
        .populate('grn', 'grnNo grnDate')
        .populate('purchaseOrder', 'poNumber orderDate')
        .populate('items.product', 'productCode itemName')
        .sort({ invoiceDate: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      
      SupplierPayment.find(paymentQuery)
        .populate('supplierInvoice', 'invoiceNumber invoiceDate totalAmount')
        .sort({ paymentDate: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      
      SupplierLedger.find(ledgerQuery)
        .populate('invoice', 'invoiceNumber totalAmount')
        .populate('debitNote', 'debitNoteNumber debitAmount')
        .sort({ entryDate: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean()
    ]);

    console.log('Data fetched:', {
      purchaseOrders: purchaseOrders.length,
      grns: grns.length,
      invoices: invoices.length,
      payments: payments.length,
      ledgerEntries: ledgerEntries.length
    });

    // Get supplier information
    const supplier = await Supplier.findById(supplierId).select('name code gstin').lean();
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found"
      });
    }

    // Perform reconciliation analysis
    const reconciliationResults = {
      supplier,
      summary: {
        totalPOs: totalPOs,
        totalGRNs: totalGRNs,
        totalInvoices: totalInvoices,
        totalPayments: totalPayments,
        totalLedgerEntries: totalLedgerEntries,
        currentPagePOs: purchaseOrders.length,
        currentPageGRNs: grns.length,
        currentPageInvoices: invoices.length,
        currentPagePayments: payments.length,
        currentPageLedgerEntries: ledgerEntries.length
      },
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(Math.max(totalPOs, totalGRNs, totalInvoices, totalPayments, totalLedgerEntries) / limitNumber),
        totalItems: Math.max(totalPOs, totalGRNs, totalInvoices, totalPayments, totalLedgerEntries),
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber < Math.ceil(Math.max(totalPOs, totalGRNs, totalInvoices, totalPayments, totalLedgerEntries) / limitNumber),
        hasPrevPage: pageNumber > 1
      },
      discrepancies: [],
      matches: [],
      unmatched: []
    };

    // Analyze PO vs GRN discrepancies
    purchaseOrders.forEach(po => {
      if (!po.lines || !Array.isArray(po.lines)) {
        console.log('PO has no lines or lines is not array:', po._id);
        return;
      }

      const relatedGRNs = grns.filter(grn => 
        grn.poId && grn.poId._id && grn.poId._id.toString() === po._id.toString()
      );
      
      po.lines.forEach(poLine => {
        if (!poLine.productId || !poLine.productId._id) {
          console.log('PO line missing productId:', poLine);
          return;
        }

        const productId = poLine.productId._id.toString();
        
        // Find matching GRN items
        const grnItems = [];
        relatedGRNs.forEach(grn => {
          if (!grn.items || !Array.isArray(grn.items)) {
            return;
          }
          
          const grnItem = grn.items.find(item => 
            item.productId && item.productId._id && 
            item.productId._id.toString() === productId
          );
          if (grnItem) {
            grnItems.push({
              grnId: grn._id,
              grnNo: grn.grnNo,
              grnDate: grn.grnDate,
              ...grnItem
            });
          }
        });

        const totalReceivedQuantity = grnItems.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0);
        const totalAcceptedQuantity = grnItems.reduce((sum, item) => sum + (item.acceptedQuantity || 0), 0);

        // Check for discrepancies - be more lenient with matching
        const quantityDifference = Math.abs((poLine.quantity || 0) - totalAcceptedQuantity);
        const isSignificantDifference = quantityDifference > 0.01; // Allow for small rounding differences

        if (isSignificantDifference) {
          reconciliationResults.discrepancies.push({
            type: 'PO_GRN_MISMATCH',
            poId: po._id,
            poNumber: po.poNumber,
            poDate: po.orderDate,
            productId: productId,
            productName: poLine.productId.itemName || 'Unknown Product',
            poQuantity: poLine.quantity || 0,
            receivedQuantity: totalReceivedQuantity,
            acceptedQuantity: totalAcceptedQuantity,
            difference: (poLine.quantity || 0) - totalAcceptedQuantity,
            grnDetails: grnItems
          });
        } else {
          // Only add to matches if we have GRNs for this PO line
          if (grnItems.length > 0) {
            reconciliationResults.matches.push({
              type: 'PO_GRN_MATCH',
              poId: po._id,
              poNumber: po.poNumber,
              productId: productId,
              productName: poLine.productId.itemName || 'Unknown Product',
              quantity: poLine.quantity || 0,
              receivedQuantity: totalReceivedQuantity,
              acceptedQuantity: totalAcceptedQuantity,
              grnCount: grnItems.length
            });
          }
        }
      });
    });

    // Analyze GRN vs Invoice discrepancies
    grns.forEach(grn => {
      if (!grn.items || !Array.isArray(grn.items)) {
        return;
      }

      const relatedInvoices = invoices.filter(inv => 
        inv.grn && inv.grn._id && inv.grn._id.toString() === grn._id.toString()
      );
      
      grn.items.forEach(grnItem => {
        if (!grnItem.productId || !grnItem.productId._id) {
          return;
        }

        const productId = grnItem.productId._id.toString();
        
        // Find matching invoice items
        const invoiceItems = [];
        relatedInvoices.forEach(invoice => {
          if (!invoice.items || !Array.isArray(invoice.items)) {
            return;
          }
          
          const invoiceItem = invoice.items.find(item => 
            item.product && item.product._id && 
            item.product._id.toString() === productId
          );
          if (invoiceItem) {
            invoiceItems.push({
              invoiceId: invoice._id,
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.invoiceDate,
              ...invoiceItem
            });
          }
        });

        const totalInvoiceQuantity = invoiceItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const totalInvoiceAmount = invoiceItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

        // Check for discrepancies - be more lenient with matching
        const quantityDifference = Math.abs((grnItem.acceptedQuantity || 0) - totalInvoiceQuantity);
        const isSignificantDifference = quantityDifference > 0.01; // Allow for small rounding differences

        if (isSignificantDifference) {
          reconciliationResults.discrepancies.push({
            type: 'GRN_INVOICE_MISMATCH',
            grnId: grn._id,
            grnNo: grn.grnNo,
            grnDate: grn.grnDate,
            productId: productId,
            productName: grnItem.productId.itemName || 'Unknown Product',
            grnAcceptedQuantity: grnItem.acceptedQuantity || 0,
            invoiceQuantity: totalInvoiceQuantity,
            difference: (grnItem.acceptedQuantity || 0) - totalInvoiceQuantity,
            invoiceDetails: invoiceItems
          });
        } else {
          // Only add to matches if we have invoices for this GRN item
          if (invoiceItems.length > 0) {
            reconciliationResults.matches.push({
              type: 'GRN_INVOICE_MATCH',
              grnId: grn._id,
              grnNo: grn.grnNo,
              productId: productId,
              productName: grnItem.productId.itemName || 'Unknown Product',
              quantity: grnItem.acceptedQuantity || 0,
              invoiceQuantity: totalInvoiceQuantity,
              amount: totalInvoiceAmount,
              invoiceCount: invoiceItems.length
            });
          }
        }
      });
    });

    // Analyze Invoice vs Payment discrepancies
    invoices.forEach(invoice => {
      const relatedPayments = payments.filter(payment => 
        payment.supplierInvoice && payment.supplierInvoice._id && 
        payment.supplierInvoice._id.toString() === invoice._id.toString()
      );

      const totalPaidAmount = relatedPayments.reduce((sum, payment) => {
        return sum + (payment.paymentAmount || 0);
      }, 0);

      const outstandingAmount = (invoice.totalAmount || 0) - totalPaidAmount;
      const isSignificantOutstanding = Math.abs(outstandingAmount) > 0.01; // Allow for small rounding differences

      if (isSignificantOutstanding && outstandingAmount > 0) {
        reconciliationResults.discrepancies.push({
          type: 'INVOICE_PAYMENT_MISMATCH',
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          invoiceAmount: invoice.totalAmount || 0,
          paidAmount: totalPaidAmount,
          outstandingAmount: outstandingAmount,
          paymentDetails: relatedPayments.map(payment => ({
            paymentId: payment._id,
            paymentNumber: payment.paymentNumber,
            paymentDate: payment.paymentDate,
            amount: payment.paymentAmount || 0,
            status: payment.status
          }))
        });
      } else if (!isSignificantOutstanding || outstandingAmount <= 0) {
        // Add to matches if fully paid or overpaid (within tolerance)
        reconciliationResults.matches.push({
          type: 'INVOICE_PAYMENT_MATCH',
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          amount: invoice.totalAmount || 0,
          paidAmount: totalPaidAmount,
          paymentCount: relatedPayments.length
        });
      }
    });

    // Calculate reconciliation statistics
    const totalDiscrepancies = reconciliationResults.discrepancies.length;
    const totalMatches = reconciliationResults.matches.length;
    const reconciliationRate = totalMatches > 0 ? (totalMatches / (totalMatches + totalDiscrepancies)) * 100 : 100;

    reconciliationResults.summary.reconciliationRate = Math.round(reconciliationRate);
    reconciliationResults.summary.totalDiscrepancies = totalDiscrepancies;
    reconciliationResults.summary.totalMatches = totalMatches;

    console.log('Reconciliation completed:', {
      totalMatches,
      totalDiscrepancies,
      reconciliationRate: reconciliationResults.summary.reconciliationRate,
      matches: reconciliationResults.matches.map(m => ({ type: m.type, productName: m.productName, quantity: m.quantity })),
      discrepancies: reconciliationResults.discrepancies.map(d => ({ type: d.type, productName: d.productName, difference: d.difference }))
    });

    res.json({
      success: true,
      reconciliation: reconciliationResults,
      pagination: reconciliationResults.pagination
    });

  } catch (error) {
    console.error("Auto Reconciliation Error:", error);
    res.status(500).json({
      success: false,
      message: "Error performing auto reconciliation",
      error: error.message
    });
  }
};

// @desc    Get reconciliation summary for dashboard
// @route   GET /api/reconciliation/summary
// @access  Private
export const getReconciliationSummary = async (req, res) => {
  try {
    const { dateRange } = req.query;
    
    let dateFilter = {};
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      dateFilter = {
        $gte: new Date(dateRange.startDate),
        $lte: new Date(dateRange.endDate)
      };
    }

    const [
      totalSuppliers,
      totalPOs,
      totalGRNs,
      totalInvoices,
      totalPayments,
      pendingReconciliations
    ] = await Promise.all([
      Supplier.countDocuments(),
      PurchaseOrder.countDocuments(Object.keys(dateFilter).length > 0 ? { orderDate: dateFilter } : {}),
      GRN.countDocuments(Object.keys(dateFilter).length > 0 ? { grnDate: dateFilter } : {}),
      SupplierInvoice.countDocuments(Object.keys(dateFilter).length > 0 ? { invoiceDate: dateFilter } : {}),
      SupplierPayment.countDocuments(Object.keys(dateFilter).length > 0 ? { paymentDate: dateFilter } : {}),
      // This would need more complex logic to determine pending reconciliations
      0
    ]);

    res.json({
      success: true,
      summary: {
        totalSuppliers,
        totalPOs,
        totalGRNs,
        totalInvoices,
        totalPayments,
        pendingReconciliations,
        reconciliationRate: 85 // This would be calculated based on actual data
      }
    });
  } catch (error) {
    console.error("Get Reconciliation Summary Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching reconciliation summary",
      error: error.message
    });
  }
};
