import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { accountMasterSchema } from '../models/AccountMaster.js';
import { voucherSchema } from '../models/Voucher.js';
import { dealerPaymentSchema } from '../models/DealerPayment.js';
import { cashAccountSchema } from '../models/CashAccount.js';
import { bankAccountSchema } from '../models/BankAccount.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';

const getModels = (dbConnection) => ({
  JournalVoucher: dbConnection.models.JournalVoucher || dbConnection.model('JournalVoucher', journalVoucherSchema),
  AccountMaster: dbConnection.models.AccountMaster || dbConnection.model('AccountMaster', accountMasterSchema),
  Voucher: dbConnection.models.Voucher || dbConnection.model('Voucher', voucherSchema),
  DealerPayment: dbConnection.models.DealerPayment || dbConnection.model('DealerPayment', dealerPaymentSchema),
  CashAccount: dbConnection.models.CashAccount || dbConnection.model('CashAccount', cashAccountSchema),
  BankAccount: dbConnection.models.BankAccount || dbConnection.model('BankAccount', bankAccountSchema),
  DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
});

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Sum a single account's net (debit-positive) across all posted JV entries + opening
const accountClosingFromJV = async (JournalVoucher, AccountMaster, accountName) => {
  const acc = await AccountMaster.findOne({ accountName }).lean();
  let net = 0;
  if (acc) net += (acc.openingBalanceType || 'Dr') === 'Dr' ? (acc.openingBalance || 0) : -(acc.openingBalance || 0);
  const agg = await JournalVoucher.aggregate([
    { $match: { status: 'Posted' } },
    { $unwind: '$entries' },
    { $match: { 'entries.accountName': accountName } },
    { $group: { _id: null, debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
  ]);
  if (agg[0]) net += agg[0].debit - agg[0].credit;
  return round2(net);
};

// @desc    Books Health Check — surfaces accounting data inconsistencies
// @route   GET /api/financial-reports/health-check
// @access  Private
export const getBooksHealthCheck = async (req, res) => {
  try {
    const { JournalVoucher, AccountMaster, Voucher, DealerPayment, CashAccount, BankAccount, DealerInvoice } = getModels(req.dbConnection);
    const checks = [];

    // 1) Journal vouchers balanced (Dr = Cr across all posted entries)
    const jvAgg = await JournalVoucher.aggregate([
      { $match: { status: 'Posted' } },
      { $unwind: '$entries' },
      { $group: { _id: null, debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
    ]);
    const jvDebit = round2(jvAgg[0]?.debit || 0);
    const jvCredit = round2(jvAgg[0]?.credit || 0);
    const jvDiff = round2(jvDebit - jvCredit);
    checks.push({
      id: 'jv-balanced',
      title: 'Journal vouchers balanced',
      status: Math.abs(jvDiff) < 0.01 ? 'pass' : 'fail',
      detail: Math.abs(jvDiff) < 0.01
        ? 'All posted journal vouchers have equal debits and credits.'
        : `Total debits (₹${jvDebit}) ≠ credits (₹${jvCredit}); difference ₹${jvDiff}.`,
      numbers: { totalDebit: jvDebit, totalCredit: jvCredit, difference: jvDiff },
    });

    // 2) Opening balances net to zero
    const accounts = await AccountMaster.find({}).lean();
    let openingNet = 0;
    for (const a of accounts) {
      openingNet += (a.openingBalanceType || 'Dr') === 'Dr' ? (a.openingBalance || 0) : -(a.openingBalance || 0);
    }
    openingNet = round2(openingNet);
    checks.push({
      id: 'opening-balanced',
      title: 'Opening balances net to zero',
      status: Math.abs(openingNet) < 0.01 ? 'pass' : 'warn',
      detail: Math.abs(openingNet) < 0.01
        ? 'Chart-of-accounts opening balances are balanced.'
        : `Opening balances net to ₹${openingNet} (should be 0). Add the difference to a "Difference in Opening Balance" account.`,
      numbers: { openingNet },
    });

    // 3) Cash representation: balance-doc vs journal vouchers
    let cashDoc = 0;
    try { const c = await CashAccount.findOne({}).lean(); cashDoc = round2(c?.currentBalance || 0); } catch { /* none */ }
    const cashJV = await accountClosingFromJV(JournalVoucher, AccountMaster, 'Cash Account');
    const cashDiff = round2(cashDoc - cashJV);
    checks.push({
      id: 'cash-reconcile',
      title: 'Cash: balance-doc vs journal',
      status: Math.abs(cashDiff) < 1 ? 'pass' : 'warn',
      detail: `Cash per balance record: ₹${cashDoc}. Cash per journal vouchers: ₹${cashJV}.` +
        (Math.abs(cashDiff) < 1 ? ' They agree.' : ` They differ by ₹${cashDiff} — cash is tracked in two places (Voucher balances vs journals).`),
      numbers: { balanceDoc: cashDoc, journal: cashJV, difference: cashDiff },
    });

    // 4) Bank representation: balance-doc vs journal vouchers
    let bankDoc = 0;
    try {
      const banks = await BankAccount.find({}).lean();
      bankDoc = round2(banks.reduce((s, b) => s + (b.currentBalance || 0), 0));
    } catch { /* none */ }
    const bankJV = await accountClosingFromJV(JournalVoucher, AccountMaster, 'Bank Account');
    const bankDiff = round2(bankDoc - bankJV);
    checks.push({
      id: 'bank-reconcile',
      title: 'Bank: balance-doc vs journal',
      status: Math.abs(bankDiff) < 1 ? 'pass' : 'warn',
      detail: `Bank per balance records: ₹${bankDoc}. Bank per journal vouchers: ₹${bankJV}.` +
        (Math.abs(bankDiff) < 1 ? ' They agree.' : ` They differ by ₹${bankDiff}.`),
      numbers: { balanceDoc: bankDoc, journal: bankJV, difference: bankDiff },
    });

    // 5) Possible duplicate dealer receipts (Voucher vs DealerPayment)
    const dealerReceiptVouchers = await Voucher.aggregate([
      { $match: { voucherType: 'Receipt', partyType: 'Dealer', status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
    ]);
    const dealerPayments = await DealerPayment.aggregate([
      { $match: { status: 'Approved' } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$paymentAmount' } } },
    ]);
    const vCount = dealerReceiptVouchers[0]?.count || 0;
    const dpCount = dealerPayments[0]?.count || 0;
    const bothUsed = vCount > 0 && dpCount > 0;
    checks.push({
      id: 'dealer-receipt-duplication',
      title: 'Dealer receipts recorded in one system',
      status: bothUsed ? 'warn' : 'pass',
      detail: bothUsed
        ? `Dealer receipts exist in BOTH the Voucher module (${vCount}, ₹${round2(dealerReceiptVouchers[0].total)}) and Dealer Payments (${dpCount}, ₹${round2(dealerPayments[0].total)}). If the same receipt was entered in both, it is double-counted. Standardise on one screen.`
        : 'Dealer receipts are recorded through a single system.',
      numbers: {
        voucherReceipts: { count: vCount, total: round2(dealerReceiptVouchers[0]?.total || 0) },
        dealerPayments: { count: dpCount, total: round2(dealerPayments[0]?.total || 0) },
      },
    });

    // 6) Over-paid invoices
    const overpaid = await DealerInvoice.find({
      isDeleted: { $ne: true },
      $expr: { $gt: ['$paidAmount', { $add: ['$totalAmount', 0.01] }] },
    }).select('invoiceNumber totalAmount paidAmount').limit(50).lean();
    checks.push({
      id: 'overpaid-invoices',
      title: 'No over-paid invoices',
      status: overpaid.length === 0 ? 'pass' : 'warn',
      detail: overpaid.length === 0
        ? 'No invoices have payments exceeding their total.'
        : `${overpaid.length} invoice(s) have paid amount greater than the invoice total.`,
      numbers: { count: overpaid.length },
      items: overpaid.map((i) => ({ invoiceNumber: i.invoiceNumber, totalAmount: round2(i.totalAmount), paidAmount: round2(i.paidAmount) })),
    });

    // 7) Approved sales invoices journalized
    const approvedInvCount = await DealerInvoice.countDocuments({ status: { $in: ['Approved', 'Dispatched', 'Delivered'] }, isDeleted: { $ne: true }, isDraft: { $ne: true } });
    const invJVCount = await JournalVoucher.countDocuments({ referenceType: 'DealerInvoice', status: 'Posted' });
    checks.push({
      id: 'invoices-journalized',
      title: 'Sales invoices journalized',
      status: invJVCount >= approvedInvCount ? 'pass' : 'warn',
      detail: `${approvedInvCount} approved sales invoice(s); ${invJVCount} have journal entries.` +
        (invJVCount >= approvedInvCount ? '' : ' Some invoices may be missing journal entries.'),
      numbers: { approvedInvoices: approvedInvCount, journalized: invJVCount },
    });

    const summary = {
      pass: checks.filter((c) => c.status === 'pass').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      fail: checks.filter((c) => c.status === 'fail').length,
    };

    res.json({ success: true, data: { generatedAt: new Date(), summary, checks } });
  } catch (error) {
    console.error('Books health check error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
