import DealerInvoice from '../../models/DealerInvoice.js';
import Dealer from '../../models/Dealer.js';
import { generateInvoicePDF } from '../../utils/pdfGenerator.js';

// @desc    Get dealer's invoices
// @route   GET /api/app/invoices
// @access  Private (Dealer)
export const getMyInvoices = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    const { page = 1, limit = 10, status, paymentStatus, startDate, endDate } = req.query;

    const query = { dealer: dealerId };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (paymentStatus && paymentStatus !== 'all') {
      query.paymentStatus = paymentStatus;
    }

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const invoices = await DealerInvoice.find(query)
      .populate('dealer', 'name code')
      .sort({ invoiceDate: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await DealerInvoice.countDocuments(query);

    // Calculate stats if requested
    if (req.path.includes('/stats')) {
      const totalAmount = await DealerInvoice.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]);

      const paidAmount = await DealerInvoice.aggregate([
        { $match: { ...query, paymentStatus: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$paidAmount' } } }
      ]);

      const outstandingAmount = await DealerInvoice.aggregate([
        { $match: { ...query, paymentStatus: { $ne: 'Paid' } } },
        { $group: { _id: null, total: { $sum: '$outstandingAmount' } } }
      ]);

      return res.json({
        success: true,
        stats: {
          totalInvoices: total,
          totalAmount: totalAmount[0]?.total || 0,
          paidAmount: paidAmount[0]?.total || 0,
          outstandingAmount: outstandingAmount[0]?.total || 0
        },
        invoices,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalInvoices: total
        }
      });
    }

    res.json({
      success: true,
      invoices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalInvoices: total,
        hasNext: skip + invoices.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error getting dealer invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoices',
      error: error.message
    });
  }
};

// @desc    Get invoice details
// @route   GET /api/app/invoices/:id
// @access  Private (Dealer)
export const getInvoiceDetails = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    const invoice = await DealerInvoice.findOne({
      _id: req.params.id,
      dealer: dealerId
    })
      .populate('dealer', 'name code phone email address gst')
      .populate('items.product', 'itemName productCode mrp HSNCode')
      .populate('salesOrder', 'orderNumber')
      .populate('region', 'name');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.json({
      success: true,
      invoice
    });
  } catch (error) {
    console.error('Error getting invoice details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoice details',
      error: error.message
    });
  }
};

// @desc    Download invoice PDF
// @route   GET /api/app/invoices/:id/download
// @access  Private (Dealer)
export const downloadInvoice = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    const invoice = await DealerInvoice.findOne({
      _id: req.params.id,
      dealer: dealerId
    })
      .populate('dealer', 'name code phone email address gst')
      .populate('items.product', 'itemName productCode mrp');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Generate PDF using pdfGenerator utility
    const pdfBuffer = await generateInvoicePDF(invoice);

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send the PDF buffer
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error downloading invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading invoice',
      error: error.message
    });
  }
};

