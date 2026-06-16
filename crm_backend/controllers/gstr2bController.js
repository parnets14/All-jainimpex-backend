import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';

const getModels = (dbConnection) => ({
  SupplierInvoice:
    dbConnection.models.SupplierInvoice ||
    dbConnection.model('SupplierInvoice', supplierInvoiceSchema),
});

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const normGstin = (s) => String(s || '').toUpperCase().replace(/\s+/g, '').trim();
const normInv = (s) => String(s || '').toUpperCase().replace(/[\s/\-_.]+/g, '').trim();

const getFYStartDate = (fy) => new Date(parseInt(fy.split('-')[0], 10), 3, 1);
const getFYEndDate = (fy) => new Date(parseInt(fy.split('-')[0], 10) + 1, 2, 31, 23, 59, 59, 999);

// Resolve the reconciliation window from financialYear OR fromDate/toDate
const resolveWindow = ({ fromDate, toDate, financialYear }) => {
  let from = fromDate ? new Date(fromDate) : null;
  let to = toDate ? new Date(toDate) : new Date();
  if (financialYear && /^\d{4}-\d{2}$/.test(financialYear)) {
    from = getFYStartDate(financialYear);
    const fyEnd = getFYEndDate(financialYear);
    if (!toDate || to > fyEnd) to = fyEnd;
  }
  if (to) to.setHours(23, 59, 59, 999);
  if (from) from.setHours(0, 0, 0, 0);
  return { from, to };
};

// @desc    Reconcile uploaded GSTR-2B rows against recorded purchase invoices
// @route   POST /api/gst-reports/gstr2b-reconcile
// @access  Private
// Body: { financialYear?, fromDate?, toDate?, rows: [{ gstin, invoiceNumber, invoiceDate, taxableValue, igst, cgst, sgst, total }] }
export const reconcileGSTR2B = async (req, res) => {
  try {
    const { SupplierInvoice } = getModels(req.dbConnection);
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No GSTR-2B rows provided. Upload the portal file first.' });
    }

    const { from, to } = resolveWindow(req.body);

    // 1) Build the books side from recorded purchase invoices (exclude cancelled)
    const match = { status: { $ne: 'Cancelled' } };
    if (from || to) {
      match.invoiceDate = {};
      if (from) match.invoiceDate.$gte = from;
      if (to) match.invoiceDate.$lte = to;
    }
    const invoices = await SupplierInvoice.find(match)
      .select('invoiceNumber supplierName supplierGSTIN invoiceDate subtotal totalDiscount totalGst totalAmount')
      .lean();

    const bookRows = invoices.map((inv) => {
      const taxable = round2((inv.subtotal || 0) - (inv.totalDiscount || 0));
      return {
        source: 'books',
        id: String(inv._id),
        gstin: normGstin(inv.supplierGSTIN),
        gstinRaw: inv.supplierGSTIN || '',
        supplierName: inv.supplierName || '',
        invoiceNumber: inv.invoiceNumber || '',
        invKey: normInv(inv.invoiceNumber),
        invoiceDate: inv.invoiceDate,
        taxable,
        tax: round2(inv.totalGst || 0),
        total: round2(inv.totalAmount || 0),
        matched: false,
      };
    });

    // 2) Normalize the uploaded GSTR-2B rows
    const portalRows = rows.map((r, i) => {
      const igst = Number(r.igst) || 0;
      const cgst = Number(r.cgst) || 0;
      const sgst = Number(r.sgst) || 0;
      const tax = round2(igst + cgst + sgst);
      const taxable = round2(Number(r.taxableValue) || 0);
      const total = r.total != null ? round2(Number(r.total) || 0) : round2(taxable + tax);
      return {
        source: '2b',
        id: `2b-${i}`,
        gstin: normGstin(r.gstin),
        gstinRaw: r.gstin || '',
        supplierName: r.supplierName || '',
        invoiceNumber: r.invoiceNumber || '',
        invKey: normInv(r.invoiceNumber),
        invoiceDate: r.invoiceDate ? new Date(r.invoiceDate) : null,
        taxable,
        tax,
        total,
        matched: false,
      };
    });

    const AMOUNT_TOL = 1; // ₹1 tolerance

    // 3) Pass 1 — match on GSTIN + normalized invoice number
    for (const p of portalRows) {
      if (!p.invKey) continue;
      const b = bookRows.find((x) => !x.matched && x.gstin === p.gstin && x.invKey && x.invKey === p.invKey);
      if (b) {
        b.matched = true; p.matched = true;
        p.matchId = b.id; b.matchId = p.id;
        p.matchType = b.matchType = 'invoice';
      }
    }

    // 4) Pass 2 — match remaining on GSTIN + total within tolerance
    for (const p of portalRows) {
      if (p.matched) continue;
      const b = bookRows.find((x) => !x.matched && x.gstin === p.gstin && Math.abs(x.total - p.total) <= AMOUNT_TOL);
      if (b) {
        b.matched = true; p.matched = true;
        p.matchId = b.id; b.matchId = p.id;
        p.matchType = b.matchType = 'amount';
      }
    }

    // 5) Build result buckets
    const matched = [];
    const mismatched = [];
    for (const p of portalRows) {
      if (!p.matched) continue;
      const b = bookRows.find((x) => x.id === p.matchId);
      const taxDiff = round2((b?.tax || 0) - p.tax);
      const taxableDiff = round2((b?.taxable || 0) - p.taxable);
      const row = {
        gstin: p.gstinRaw || b?.gstinRaw,
        supplierName: b?.supplierName || p.supplierName,
        bookInvoice: b?.invoiceNumber || '',
        portalInvoice: p.invoiceNumber || '',
        bookTaxable: b?.taxable || 0,
        portalTaxable: p.taxable,
        bookTax: b?.tax || 0,
        portalTax: p.tax,
        taxDiff,
        taxableDiff,
        matchType: p.matchType,
      };
      if (Math.abs(taxDiff) <= AMOUNT_TOL && Math.abs(taxableDiff) <= AMOUNT_TOL) matched.push(row);
      else mismatched.push(row);
    }

    // Invoices in books but not in the portal (ITC at risk — supplier may not have filed)
    const onlyInBooks = bookRows.filter((b) => !b.matched).map((b) => ({
      gstin: b.gstinRaw, supplierName: b.supplierName, invoiceNumber: b.invoiceNumber,
      invoiceDate: b.invoiceDate, taxable: b.taxable, tax: b.tax, total: b.total,
    }));

    // Rows in the portal but not in books (you may have missed recording the purchase)
    const onlyIn2B = portalRows.filter((p) => !p.matched).map((p) => ({
      gstin: p.gstinRaw, supplierName: p.supplierName, invoiceNumber: p.invoiceNumber,
      invoiceDate: p.invoiceDate, taxable: p.taxable, tax: p.tax, total: p.total,
    }));

    const sum = (arr, k) => round2(arr.reduce((s, x) => s + (x[k] || 0), 0));
    const summary = {
      booksInvoiceCount: bookRows.length,
      portalRowCount: portalRows.length,
      matchedCount: matched.length,
      mismatchedCount: mismatched.length,
      onlyInBooksCount: onlyInBooks.length,
      onlyIn2BCount: onlyIn2B.length,
      booksTax: sum(bookRows, 'tax'),
      portalTax: sum(portalRows, 'tax'),
      taxDifference: round2(sum(bookRows, 'tax') - sum(portalRows, 'tax')),
      itcAtRisk: sum(onlyInBooks, 'tax'),       // claimed in books but not in 2B
      itcUnclaimed: sum(onlyIn2B, 'tax'),       // in 2B but not recorded
    };

    res.json({
      success: true,
      data: {
        period: { from: from || null, to },
        financialYear: req.body.financialYear || null,
        summary,
        matched,
        mismatched,
        onlyInBooks,
        onlyIn2B,
        note: 'Matched by supplier GSTIN and invoice number, then by GSTIN and amount. Because the portal uses the supplier’s bill number while the system stores its own, verify invoice numbers on amount-matched rows.',
      },
    });
  } catch (error) {
    console.error('GSTR-2B reconciliation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
