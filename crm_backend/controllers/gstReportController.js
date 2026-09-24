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

// @desc    GSTR-1 — outward supplies (sales), rate-wise + invoice-wise + SAC summary
// @route   GET /api/gst-reports/gstr1
// @access  Private
export const getGSTR1 = async (req, res) => {
  try {
    const { DealerInvoice } = getModels(req.dbConnection);
    const win = dateWindow(req.query.fromDate, req.query.toDate);
    const match = salesMatch(win);

    // Product HSN Rate-wise summary (taxable value = item total minus embedded GST)
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

    // Service Charges SAC-wise summary
    const sacWise = await DealerInvoice.aggregate([
      { $match: match },
      { $unwind: '$serviceCharges' },
      {
        $group: {
          _id: { 
            sac: { $ifNull: ['$serviceCharges.sacCode', 'NA'] },
            rate: { $ifNull: ['$serviceCharges.taxRate', 0] }
          },
          taxableValue: { $sum: { $ifNull: ['$serviceCharges.amount', 0] } },
          taxAmount: { $sum: { $ifNull: ['$serviceCharges.taxAmount', 0] } },
          invoiceValue: { $sum: { $ifNull: ['$serviceCharges.totalAmount', 0] } },
        },
      },
      { $sort: { '_id.sac': 1, '_id.rate': 1 } },
    ]);

    const sacSummary = sacWise.map((s) => {
      const tax = round2(s.taxAmount);
      return {
        sacCode: s._id.sac,
        gstRate: s._id.rate,
        taxableValue: round2(s.taxableValue),
        cgst: round2(tax / 2),
        sgst: round2(tax / 2),
        igst: 0,
        totalTax: tax,
        invoiceValue: round2(s.invoiceValue),
      };
    });

    // Invoice-wise listing
    const invoices = await DealerInvoice.find(match)
      .select('invoiceNumber invoiceDate dealerName customerGST totalAmount totalGst subtotal totalDiscount serviceChargesSubtotal serviceChargesTax')
      .populate('dealer', 'name gst gstin')
      .sort({ invoiceDate: 1 })
      .lean();

    const invoiceRows = invoices.map((inv) => {
      const productTaxable = (inv.subtotal || 0) - (inv.totalDiscount || 0);
      const productTax = inv.totalGst || 0;
      const serviceTaxable = inv.serviceChargesSubtotal || 0;
      const serviceTax = inv.serviceChargesTax || 0;
      return {
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        partyName: inv.dealerName || inv.dealer?.name || '',
        gstin: inv.customerGST || inv.dealer?.gst || inv.dealer?.gstin || '',
        productTaxable: round2(productTaxable),
        serviceTaxable: round2(serviceTaxable),
        taxableValue: round2(productTaxable + serviceTaxable),
        productTax: round2(productTax),
        serviceTax: round2(serviceTax),
        taxAmount: round2(productTax + serviceTax),
        invoiceValue: round2(inv.totalAmount || 0),
      };
    });

    // Combined totals (products + services)
    const productTotals = rates.reduce(
      (acc, r) => ({
        taxableValue: round2(acc.taxableValue + r.taxableValue),
        totalTax: round2(acc.totalTax + r.totalTax),
        invoiceValue: round2(acc.invoiceValue + r.invoiceValue),
      }),
      { taxableValue: 0, totalTax: 0, invoiceValue: 0 }
    );

    const serviceTotals = sacSummary.reduce(
      (acc, s) => ({
        taxableValue: round2(acc.taxableValue + s.taxableValue),
        totalTax: round2(acc.totalTax + s.totalTax),
        invoiceValue: round2(acc.invoiceValue + s.invoiceValue),
      }),
      { taxableValue: 0, totalTax: 0, invoiceValue: 0 }
    );

    const grandTotals = {
      productTaxable: productTotals.taxableValue,
      serviceTaxable: serviceTotals.taxableValue,
      taxableValue: round2(productTotals.taxableValue + serviceTotals.taxableValue),
      productTax: productTotals.totalTax,
      serviceTax: serviceTotals.totalTax,
      totalTax: round2(productTotals.totalTax + serviceTotals.totalTax),
      cgst: round2((productTotals.totalTax + serviceTotals.totalTax) / 2),
      sgst: round2((productTotals.totalTax + serviceTotals.totalTax) / 2),
      igst: 0,
      invoiceValue: round2(productTotals.invoiceValue + serviceTotals.invoiceValue),
    };

    res.json({
      success: true,
      data: {
        period: { fromDate: req.query.fromDate || null, toDate: req.query.toDate || null },
        hsnSummary: rates,
        sacSummary,
        invoices: invoiceRows,
        totals: grandTotals,
        invoiceCount: invoiceRows.length,
        note: 'GSTR-1 (outward supplies) from approved sales invoices. HSN for products, SAC for service charges. CGST/SGST shown as an intra-state split of the embedded GST.',
      },
    });
  } catch (error) {
    console.error('GSTR-1 error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    HSN-wise (products) and SAC-wise (services) summary of outward supplies
// @route   GET /api/gst-reports/hsn-summary
// @access  Private
export const getHSNSummary = async (req, res) => {
  try {
    const { DealerInvoice } = getModels(req.dbConnection);
    const win = dateWindow(req.query.fromDate, req.query.toDate);
    const match = salesMatch(win);

    // HSN summary for products
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

    const hsnRows = hsn.map((h) => ({
      hsnCode: h._id.hsn,
      gstRate: h._id.rate,
      quantity: round2(h.quantity),
      taxableValue: round2(h.taxableValue),
      cgst: round2(h.taxAmount / 2),
      sgst: round2(h.taxAmount / 2),
      totalTax: round2(h.taxAmount),
      totalValue: round2(h.totalValue),
    }));

    // SAC summary for service charges
    const sac = await DealerInvoice.aggregate([
      { $match: match },
      { $unwind: '$serviceCharges' },
      {
        $group: {
          _id: { 
            sac: { $ifNull: ['$serviceCharges.sacCode', 'NA'] }, 
            rate: { $ifNull: ['$serviceCharges.taxRate', 0] } 
          },
          taxableValue: { $sum: { $ifNull: ['$serviceCharges.amount', 0] } },
          taxAmount: { $sum: { $ifNull: ['$serviceCharges.taxAmount', 0] } },
          totalValue: { $sum: { $ifNull: ['$serviceCharges.totalAmount', 0] } },
        },
      },
      { $sort: { '_id.sac': 1, '_id.rate': 1 } },
    ]);

    const sacRows = sac.map((s) => ({
      sacCode: s._id.sac,
      gstRate: s._id.rate,
      taxableValue: round2(s.taxableValue),
      cgst: round2(s.taxAmount / 2),
      sgst: round2(s.taxAmount / 2),
      totalTax: round2(s.taxAmount),
      totalValue: round2(s.totalValue),
    }));

    const hsnTotals = hsnRows.reduce(
      (a, r) => ({
        quantity: round2(a.quantity + r.quantity),
        taxableValue: round2(a.taxableValue + r.taxableValue),
        totalTax: round2(a.totalTax + r.totalTax),
        totalValue: round2(a.totalValue + r.totalValue),
      }),
      { quantity: 0, taxableValue: 0, totalTax: 0, totalValue: 0 }
    );

    const sacTotals = sacRows.reduce(
      (a, r) => ({
        taxableValue: round2(a.taxableValue + r.taxableValue),
        totalTax: round2(a.totalTax + r.totalTax),
        totalValue: round2(a.totalValue + r.totalValue),
      }),
      { taxableValue: 0, totalTax: 0, totalValue: 0 }
    );

    const combinedTotals = {
      hsnQuantity: hsnTotals.quantity,
      productTaxable: hsnTotals.taxableValue,
      serviceTaxable: sacTotals.taxableValue,
      taxableValue: round2(hsnTotals.taxableValue + sacTotals.taxableValue),
      productTax: hsnTotals.totalTax,
      serviceTax: sacTotals.totalTax,
      totalTax: round2(hsnTotals.totalTax + sacTotals.totalTax),
      productValue: hsnTotals.totalValue,
      serviceValue: sacTotals.totalValue,
      totalValue: round2(hsnTotals.totalValue + sacTotals.totalValue),
    };

    res.json({
      success: true,
      data: {
        period: { fromDate: req.query.fromDate || null, toDate: req.query.toDate || null },
        hsnRows,
        sacRows,
        hsnTotals,
        sacTotals,
        combinedTotals,
      },
    });
  } catch (error) {
    console.error('HSN/SAC summary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    GSTR-3B summary — output tax vs input credit, net payable (includes service charges)
// @route   GET /api/gst-reports/gstr3b
// @access  Private
export const getGSTR3B = async (req, res) => {
  try {
    const { DealerInvoice, SupplierInvoice } = getModels(req.dbConnection);
    const win = dateWindow(req.query.fromDate, req.query.toDate);

    // Outward (sales) — output tax liability (products + services)
    const outMatch = salesMatch(win);
    const outAgg = await DealerInvoice.aggregate([
      { $match: outMatch },
      {
        $group: {
          _id: null,
          productTaxable: { $sum: { $subtract: [{ $add: [{ $ifNull: ['$subtotal', 0] }] }, { $add: [{ $ifNull: ['$totalDiscount', 0] }] }] } },
          productTax: { $sum: { $ifNull: ['$totalGst', 0] } },
          serviceTaxable: { $sum: { $ifNull: ['$serviceChargesSubtotal', 0] } },
          serviceTax: { $sum: { $ifNull: ['$serviceChargesTax', 0] } },
          total: { $sum: { $ifNull: ['$totalAmount', 0] } },
          count: { $sum: 1 },
        },
      },
    ]);

    // Inward (purchases) — input tax credit (products + services)
    const inMatch = { status: { $in: ['Approved', 'Paid', 'Partially Paid'] } };
    if (win) inMatch.invoiceDate = win;
    const inAgg = await SupplierInvoice.aggregate([
      { $match: inMatch },
      {
        $group: {
          _id: null,
          productTaxable: { $sum: { $subtract: [{ $add: [{ $ifNull: ['$subtotal', 0] }] }, { $add: [{ $ifNull: ['$totalDiscount', 0] }] }] } },
          productTax: { $sum: { $ifNull: ['$totalGst', 0] } },
          serviceTaxable: { $sum: { $ifNull: ['$serviceChargesSubtotal', 0] } },
          serviceTax: { $sum: { $ifNull: ['$serviceChargesTax', 0] } },
          total: { $sum: { $ifNull: ['$totalAmount', 0] } },
          count: { $sum: 1 },
        },
      },
    ]);

    const outProductTaxable = round2(outAgg[0]?.productTaxable || 0);
    const outServiceTaxable = round2(outAgg[0]?.serviceTaxable || 0);
    const outProductTax = round2(outAgg[0]?.productTax || 0);
    const outServiceTax = round2(outAgg[0]?.serviceTax || 0);
    const outputTax = round2(outProductTax + outServiceTax);

    const inProductTaxable = round2(inAgg[0]?.productTaxable || 0);
    const inServiceTaxable = round2(inAgg[0]?.serviceTaxable || 0);
    const inProductTax = round2(inAgg[0]?.productTax || 0);
    const inServiceTax = round2(inAgg[0]?.serviceTax || 0);
    const inputCredit = round2(inProductTax + inServiceTax);

    const netPayable = round2(outputTax - inputCredit);

    res.json({
      success: true,
      data: {
        period: { fromDate: req.query.fromDate || null, toDate: req.query.toDate || null },
        outward: {
          productTaxable: outProductTaxable,
          serviceTaxable: outServiceTaxable,
          taxableValue: round2(outProductTaxable + outServiceTaxable),
          productTax: outProductTax,
          serviceTax: outServiceTax,
          outputTax,
          cgst: round2(outputTax / 2),
          sgst: round2(outputTax / 2),
          invoiceCount: outAgg[0]?.count || 0,
        },
        inward: {
          productTaxable: inProductTaxable,
          serviceTaxable: inServiceTaxable,
          taxableValue: round2(inProductTaxable + inServiceTaxable),
          productTax: inProductTax,
          serviceTax: inServiceTax,
          inputCredit,
          cgst: round2(inputCredit / 2),
          sgst: round2(inputCredit / 2),
          invoiceCount: inAgg[0]?.count || 0,
        },
        netGstPayable: netPayable,
        note: 'GSTR-3B summary: output tax (sales) minus input credit (purchases) including service charges. Verify against filed returns; this is a working summary, not a filing.',
      },
    });
  } catch (error) {
    console.error('GSTR-3B error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
