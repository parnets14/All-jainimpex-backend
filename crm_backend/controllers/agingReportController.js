import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';
import { dealerSchema } from '../models/Dealer.js';
import { supplierSchema } from '../models/Supplier.js';

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
  Supplier:
    dbConnection.models.Supplier ||
    dbConnection.model('Supplier', supplierSchema),
});

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const DAY = 24 * 60 * 60 * 1000;

const emptyBuckets = () => ({ notDue: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 });

// Assign an outstanding amount to a bucket based on days past due (or invoice date)
const bucketFor = (asOf, dueDate, invoiceDate) => {
  const ref = dueDate ? new Date(dueDate) : new Date(invoiceDate);
  const daysOverdue = Math.floor((asOf - ref) / DAY);
  if (daysOverdue < 0) return 'notDue';
  if (daysOverdue <= 30) return 'd0_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd90plus';
};

const buildAging = async ({ invoices, asOf, partyKey, partyNameKey }) => {
  const byParty = new Map();
  const grand = emptyBuckets();

  for (const inv of invoices) {
    const outstanding = round2((inv.totalAmount || 0) - (inv.paidAmount || 0));
    if (outstanding <= 0.009) continue;

    const pid = (inv[partyKey]?._id || inv[partyKey] || 'unknown').toString();
    const pname = inv[partyKey]?.name || inv[partyNameKey] || 'Unknown';
    if (!byParty.has(pid)) {
      byParty.set(pid, { partyId: pid, partyName: pname, ...emptyBuckets(), invoices: [] });
    }
    const row = byParty.get(pid);
    const bucket = bucketFor(asOf, inv.dueDate, inv.invoiceDate);

    row[bucket] = round2(row[bucket] + outstanding);
    row.total = round2(row.total + outstanding);
    grand[bucket] = round2(grand[bucket] + outstanding);
    grand.total = round2(grand.total + outstanding);

    const ref = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.invoiceDate);
    row.invoices.push({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate || null,
      total: round2(inv.totalAmount || 0),
      paid: round2(inv.paidAmount || 0),
      outstanding,
      daysOverdue: Math.max(0, Math.floor((asOf - ref) / DAY)),
      bucket,
    });
  }

  const parties = Array.from(byParty.values()).sort((a, b) => b.total - a.total);
  return { parties, totals: grand };
};

// @desc    Accounts Receivable aging (dealer outstanding)
// @route   GET /api/aging-reports/receivables
// @access  Private
export const getReceivablesAging = async (req, res) => {
  try {
    const { DealerInvoice } = getModels(req.dbConnection);
    const asOf = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date();
    asOf.setHours(23, 59, 59, 999);

    const invoices = await DealerInvoice.find({
      isDraft: { $ne: true },
      isDeleted: { $ne: true },
      status: { $nin: ['Cancelled', 'Draft'] },
      invoiceDate: { $lte: asOf },
    })
      .select('invoiceNumber invoiceDate dueDate totalAmount paidAmount dealer dealerName')
      .populate('dealer', 'name')
      .lean();

    const result = await buildAging({ invoices, asOf, partyKey: 'dealer', partyNameKey: 'dealerName' });

    res.json({
      success: true,
      data: {
        asOfDate: asOf,
        type: 'receivables',
        ...result,
      },
    });
  } catch (error) {
    console.error('Receivables aging error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Accounts Payable aging (supplier outstanding)
// @route   GET /api/aging-reports/payables
// @access  Private
export const getPayablesAging = async (req, res) => {
  try {
    const { SupplierInvoice } = getModels(req.dbConnection);
    const asOf = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date();
    asOf.setHours(23, 59, 59, 999);

    const invoices = await SupplierInvoice.find({
      status: { $nin: ['Cancelled', 'Draft'] },
      invoiceDate: { $lte: asOf },
    })
      .select('invoiceNumber invoiceDate dueDate totalAmount paidAmount supplier supplierName')
      .populate('supplier', 'name')
      .lean();

    const result = await buildAging({ invoices, asOf, partyKey: 'supplier', partyNameKey: 'supplierName' });

    res.json({
      success: true,
      data: {
        asOfDate: asOf,
        type: 'payables',
        ...result,
      },
    });
  } catch (error) {
    console.error('Payables aging error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
