import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';
import { dealerSchema } from '../models/Dealer.js';

const getModels = (dbConnection) => ({
  DealerInvoice:
    dbConnection.models.DealerInvoice ||
    dbConnection.model('DealerInvoice', dealerInvoiceSchema),
  SupplierInvoice:
    dbConnection.models.SupplierInvoice ||
    dbConnection.model('SupplierInvoice', supplierInvoiceSchema),
  Dealer:
    dbConnection.models.Dealer ||
    dbConnection.model('Dealer', dealerSchema),
});

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const dateWindow = (fromDate, toDate) => {
  const w = {};
  if (fromDate) w.$gte = new Date(fromDate);
  if (toDate) {
    const t = new Date(toDate);
    t.setHours(23, 59, 59, 999);
    w.$lte = t;
  }
  return Object.keys(w).length ? w : null;
};

// Sales invoices that count for GST (approved, not draft, not cancelled)
const salesMatch = (win) => {
  const m = { isDraft: { $ne: true }, isDeleted: { $ne: true }, status: { $in: ['Approved', 'Paid', 'Partially Paid'] } };
  if (win) m.invoiceDate = win;
  return m;
};

// @desc    GSTR-1 — outward supplies (sales), rate-wise + invoice-wise
// @route   GET /api/gst-reports/gstr1
// @access  Private
export const getGSTR1 = async (req, res) => {
  try {
    const { DealerInvoice } = getModels(req.dbConnection);
    const win = dateWindow(req.query.fromDate, req.query.toDate);
    const match = salesMatch(win);

    // Rate-wise summary (taxable value = item total minus embedded GST)
    const rateWise = await DealerInvoice.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: { $ifNull: ['$items.gst', 0] },
          taxableValue: { $sum: { $subtract: [{ $ifNull: ['$items.totalPrice', 0] }, { $ifNull: ['$items.gstAmount', 0] }] } },
          taxAmount: { $sum: { $ifNull: ['$items.gstAmount', 0] } },
          invoiceValue: { $sum: { $ifNull: ['$items.totalPrice', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const rates = rateWise.map((r) => {
      const tax = round2(r.taxAmount);
      return {
        gstRate: r._id,
        taxableValue: round2(r.taxableValue),
        cgst: round2(tax / 2),
        sgst: round2(tax / 2),
        igst: 0,
        totalTax: tax,
        invoiceValue: round2(r.invoiceValue),
      };
    });

    // Invoice-wise listing
    const invoices = await DealerInvoice.find(match)
      .select('invoiceNumber invoiceDate dealerName customerGST totalAmount totalGst subtotal totalDiscount')
      .populate('dealer', 'name gst gstin')
      .sort({ invoiceDate: 1 })
      .lean();

    const invoiceRows = invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      partyName: inv.dealerName || inv.dealer?.name || '',
      gstin: inv.customerGST || inv.dealer?.gst || inv.dealer?.gstin || '',
      taxableValue: round2((inv.totalAmount || 0) - (inv.totalGst || 0)),
      taxAmount: round2(inv.totalGst || 0),
      invoiceValue: round2(inv.totalAmount || 0),
    }));

    const totals = rates.reduce(
      (acc, r) => ({
        taxableValue: round2(acc.taxableValue + r.taxableValue),
        cgst: round2(acc.cgst + r.cgst),
        sgst: round2(acc.sgst + r.sgst),
        igst: round2(acc.igst + r.igst),
        totalTax: round2(acc.totalTax + r.totalTax),
        invoiceValue: round2(acc.invoiceValue + r.invoiceValue),
      }),
      { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, invoiceValue: 0 }
    );

    res.json({
      success: true,
      data: {
        period: { fromDate: req.query.fromDate || null, toDate: req.query.toDate || null },
        rateWise: rates,
        invoices: invoiceRows,
        totals,
        invoiceCount: invoiceRows.length,
        note: 'GSTR-1 (outward supplies) from approved sales invoices. CGST/SGST shown as an intra-state split of the embedded GST.',
      },
    });
  } catch (error) {
    console.error('GSTR-1 error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    HSN-wise summary of outward supplies
// @route   GET /api/gst-reports/hsn-summary
// @access  Private
export const getHSNSummary = async (req, res) => {
  try {
    const { DealerInvoice } = getModels(req.dbConnection);
    const win = dateWindow(req.query.fromDate, req.query.toDate);
    const match = salesMatch(win);

    const hsn = await DealerInvoice.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: { hsn: { $ifNull: ['$items.HSNCode', 'NA'] }, rate: { $ifNull: ['$items.gst', 0] } },
          quantity: { $sum: { $ifNull: ['$items.quantity', 0] } },
          taxableValue: { $sum: { $subtract: [{ $ifNull: ['$items.totalPrice', 0] }, { $ifNull: ['$items.gstAmount', 0] }] } },
          taxAmount: { $sum: { $ifNull: ['$items.gstAmount', 0] } },
          totalValue: { $sum: { $ifNull: ['$items.totalPrice', 0] } },
        },
      },
      { $sort: { '_id.hsn': 1, '_id.rate': 1 } },
    ]);

    const rows = hsn.map((h) => ({
      hsnCode: h._id.hsn,
      gstRate: h._id.rate,
      quantity: round2(h.quantity),
      taxableValue: round2(h.taxableValue),
      cgst: round2(h.taxAmount / 2),
      sgst: round2(h.taxAmount / 2),
      totalTax: round2(h.taxAmount),
      totalValue: round2(h.totalValue),
    }));

    const totals = rows.reduce(
      (a, r) => ({
        quantity: round2(a.quantity + r.quantity),
        taxableValue: round2(a.taxableValue + r.taxableValue),
        totalTax: round2(a.totalTax + r.totalTax),
        totalValue: round2(a.totalValue + r.totalValue),
      }),
      { quantity: 0, taxableValue: 0, totalTax: 0, totalValue: 0 }
    );

    res.json({
      success: true,
      data: {
        period: { fromDate: req.query.fromDate || null, toDate: req.query.toDate || null },
        rows,
        totals,
      },
    });
  } catch (error) {
    console.error('HSN summary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    GSTR-3B summary — output tax vs input credit, net payable
// @route   GET /api/gst-reports/gstr3b
// @access  Private
export const getGSTR3B = async (req, res) => {
  try {
    const { DealerInvoice, SupplierInvoice } = getModels(req.dbConnection);
    const win = dateWindow(req.query.fromDate, req.query.toDate);

    // Outward (sales) — output tax liability
    const outMatch = salesMatch(win);
    const outAgg = await DealerInvoice.aggregate([
      { $match: outMatch },
      {
        $group: {
          _id: null,
          taxable: { $sum: { $subtract: [{ $ifNull: ['$totalAmount', 0] }, { $ifNull: ['$totalGst', 0] }] } },
          tax: { $sum: { $ifNull: ['$totalGst', 0] } },
          count: { $sum: 1 },
        },
      },
    ]);

    // Inward (purchases) — input tax credit
    const inMatch = { status: { $in: ['Approved', 'Paid', 'Partially Paid'] } };
    if (win) inMatch.invoiceDate = win;
    const inAgg = await SupplierInvoice.aggregate([
      { $match: inMatch },
      {
        $group: {
          _id: null,
          taxable: { $sum: { $subtract: [{ $ifNull: ['$totalAmount', 0] }, { $ifNull: ['$totalGst', 0] }] } },
          tax: { $sum: { $ifNull: ['$totalGst', 0] } },
          count: { $sum: 1 },
        },
      },
    ]);

    const outputTax = round2(outAgg[0]?.tax || 0);
    const inputCredit = round2(inAgg[0]?.tax || 0);
    const netPayable = round2(outputTax - inputCredit);

    res.json({
      success: true,
      data: {
        period: { fromDate: req.query.fromDate || null, toDate: req.query.toDate || null },
        outward: {
          taxableValue: round2(outAgg[0]?.taxable || 0),
          outputTax,
          cgst: round2(outputTax / 2),
          sgst: round2(outputTax / 2),
          invoiceCount: outAgg[0]?.count || 0,
        },
        inward: {
          taxableValue: round2(inAgg[0]?.taxable || 0),
          inputCredit,
          cgst: round2(inputCredit / 2),
          sgst: round2(inputCredit / 2),
          invoiceCount: inAgg[0]?.count || 0,
        },
        netGstPayable: netPayable,
        note: 'GSTR-3B summary: output tax (sales) minus input credit (purchases). Verify against filed returns; this is a working summary, not a filing.',
      },
    });
  } catch (error) {
    console.error('GSTR-3B error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
