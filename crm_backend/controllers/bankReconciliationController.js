import { bankAccountSchema } from '../models/BankAccount.js';
import { voucherSchema } from '../models/Voucher.js';
import { bankReconciliationSchema } from '../models/BankReconciliation.js';

const getModels = (dbConnection) => ({
  BankAccount:
    dbConnection.models.BankAccount ||
    dbConnection.model('BankAccount', bankAccountSchema),
  Voucher:
    dbConnection.models.Voucher ||
    dbConnection.model('Voucher', voucherSchema),
  BankReconciliation:
    dbConnection.models.BankReconciliation ||
    dbConnection.model('BankReconciliation', bankReconciliationSchema),
});

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Build the list of book transactions that affect a given bank account.
// direction 'credit' increases the bank balance, 'debit' decreases it.
const buildBankTransactions = async (Voucher, bankId, fromDate, toDate) => {
  const dateMatch = {};
  if (fromDate) dateMatch.$gte = fromDate;
  if (toDate) dateMatch.$lte = toDate;

  const match = {
    status: 'Posted',
    $or: [
      { bankAccount: bankId },
      { 'contraDetails.fromAccount.accountId': bankId },
      { 'contraDetails.toAccount.accountId': bankId },
    ],
  };
  if (Object.keys(dateMatch).length) match.voucherDate = dateMatch;

  const vouchers = await Voucher.find(match)
    .sort({ voucherDate: 1, createdAt: 1 })
    .select('voucherNumber voucherType voucherDate transactionMode partyName narration totalAmount chequeNumber referenceNumber bankAccount contraDetails')
    .lean();

  const txns = [];
  for (const v of vouchers) {
    let direction = null;
    if (v.voucherType === 'Receipt' && String(v.bankAccount) === String(bankId)) {
      direction = 'credit';
    } else if (v.voucherType === 'Payment' && String(v.bankAccount) === String(bankId)) {
      direction = 'debit';
    } else if (v.voucherType === 'Contra') {
      const toId = v.contraDetails?.toAccount?.accountId;
      const fromId = v.contraDetails?.fromAccount?.accountId;
      if (toId && String(toId) === String(bankId)) direction = 'credit';
      else if (fromId && String(fromId) === String(bankId)) direction = 'debit';
    }
    if (!direction) continue;

    txns.push({
      voucherId: String(v._id),
      voucherNumber: v.voucherNumber,
      voucherType: v.voucherType,
      date: v.voucherDate,
      mode: v.transactionMode,
      particulars: v.partyName || v.narration || v.voucherType,
      reference: v.chequeNumber || v.referenceNumber || '',
      amount: round2(v.totalAmount || 0),
      direction,
    });
  }
  return txns;
};

// @desc    Bank reconciliation worksheet for an account
// @route   GET /api/bank-reconciliation?bankAccountId=&fromDate=&toDate=
// @access  Private
export const getReconciliation = async (req, res) => {
  try {
    const { BankAccount, Voucher, BankReconciliation } = getModels(req.dbConnection);
    const { bankAccountId, fromDate, toDate } = req.query;

    if (!bankAccountId) {
      return res.status(400).json({ success: false, message: 'bankAccountId is required.' });
    }
    const bank = await BankAccount.findById(bankAccountId).lean();
    if (!bank) {
      return res.status(404).json({ success: false, message: 'Bank account not found.' });
    }

    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : new Date();
    to.setHours(23, 59, 59, 999);

    // 1) Book balance as on `to` date = opening + credits up to date − debits up to date
    const allUpToDate = await buildBankTransactions(Voucher, bankAccountId, null, to);
    let bookBalance = round2(bank.openingBalance || 0);
    for (const t of allUpToDate) {
      bookBalance = round2(bookBalance + (t.direction === 'credit' ? t.amount : -t.amount));
    }

    // 2) Transactions shown in the worksheet (within the chosen window)
    const windowTxns = from
      ? allUpToDate.filter((t) => new Date(t.date) >= from)
      : allUpToDate;

    // 3) Merge saved clearance state
    const recon = await BankReconciliation.findOne({ bankAccountId }).lean();
    const clearedMap = recon?.clearedItems || {};
    const transactions = windowTxns.map((t) => ({
      ...t,
      cleared: !!clearedMap[t.voucherId],
      clearedDate: clearedMap[t.voucherId]?.clearedDate || null,
    }));

    // 4) Uncleared items shift the book balance towards the bank statement balance
    let unclearedDeposits = 0; // recorded receipts the bank hasn't credited yet
    let unclearedPayments = 0; // cheques issued the bank hasn't debited yet
    for (const t of transactions) {
      if (t.cleared) continue;
      if (t.direction === 'credit') unclearedDeposits = round2(unclearedDeposits + t.amount);
      else unclearedPayments = round2(unclearedPayments + t.amount);
    }

    // Expected bank statement balance:
    //   bank = book + unpresented payments − uncredited deposits
    const expectedBankBalance = round2(bookBalance + unclearedPayments - unclearedDeposits);
    const statementBalance = recon?.lastStatementBalance;
    const difference = statementBalance != null ? round2(statementBalance - expectedBankBalance) : null;

    res.json({
      success: true,
      data: {
        bankAccount: {
          _id: bank._id,
          accountName: bank.accountName,
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          currentBalance: round2(bank.currentBalance || 0),
        },
        fromDate: from,
        toDate: to,
        bookBalance,
        unclearedDeposits,
        unclearedPayments,
        expectedBankBalance,
        statementBalance: statementBalance != null ? round2(statementBalance) : null,
        statementDate: recon?.lastStatementDate || null,
        difference,
        isReconciled: difference != null && Math.abs(difference) < 0.01,
        transactions,
        summary: {
          total: transactions.length,
          cleared: transactions.filter((t) => t.cleared).length,
          uncleared: transactions.filter((t) => !t.cleared).length,
        },
      },
    });
  } catch (error) {
    console.error('Bank reconciliation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark a single book transaction cleared / uncleared
// @route   PATCH /api/bank-reconciliation/clear
// @access  Private
export const toggleClearance = async (req, res) => {
  try {
    const { BankReconciliation } = getModels(req.dbConnection);
    const { bankAccountId, voucherId, cleared, clearedDate } = req.body;

    if (!bankAccountId || !voucherId) {
      return res.status(400).json({ success: false, message: 'bankAccountId and voucherId are required.' });
    }

    let recon = await BankReconciliation.findOne({ bankAccountId });
    if (!recon) recon = new BankReconciliation({ bankAccountId, clearedItems: {} });

    if (cleared) {
      recon.clearedItems.set(String(voucherId), {
        clearedDate: clearedDate ? new Date(clearedDate) : new Date(),
        clearedBy: req.user?._id,
        updatedAt: new Date(),
      });
    } else {
      recon.clearedItems.delete(String(voucherId));
    }
    await recon.save();

    res.json({ success: true, message: 'Updated.', data: { voucherId, cleared: !!cleared } });
  } catch (error) {
    console.error('Toggle clearance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark many transactions cleared / uncleared at once
// @route   PATCH /api/bank-reconciliation/clear-bulk
// @access  Private
export const bulkClearance = async (req, res) => {
  try {
    const { BankReconciliation } = getModels(req.dbConnection);
    const { bankAccountId, voucherIds, cleared } = req.body;

    if (!bankAccountId || !Array.isArray(voucherIds)) {
      return res.status(400).json({ success: false, message: 'bankAccountId and voucherIds[] are required.' });
    }

    let recon = await BankReconciliation.findOne({ bankAccountId });
    if (!recon) recon = new BankReconciliation({ bankAccountId, clearedItems: {} });

    for (const id of voucherIds) {
      if (cleared) {
        recon.clearedItems.set(String(id), { clearedDate: new Date(), clearedBy: req.user?._id, updatedAt: new Date() });
      } else {
        recon.clearedItems.delete(String(id));
      }
    }
    await recon.save();

    res.json({ success: true, message: 'Updated.', data: { count: voucherIds.length, cleared: !!cleared } });
  } catch (error) {
    console.error('Bulk clearance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Save the bank statement closing balance + date for the account
// @route   PATCH /api/bank-reconciliation/statement
// @access  Private
export const saveStatement = async (req, res) => {
  try {
    const { BankReconciliation } = getModels(req.dbConnection);
    const { bankAccountId, statementBalance, statementDate } = req.body;

    if (!bankAccountId) {
      return res.status(400).json({ success: false, message: 'bankAccountId is required.' });
    }

    let recon = await BankReconciliation.findOne({ bankAccountId });
    if (!recon) recon = new BankReconciliation({ bankAccountId, clearedItems: {} });

    if (statementBalance != null) recon.lastStatementBalance = Number(statementBalance);
    if (statementDate) recon.lastStatementDate = new Date(statementDate);
    recon.lastReconciledAt = new Date();
    recon.lastReconciledBy = req.user?._id;
    await recon.save();

    res.json({ success: true, message: 'Statement balance saved.' });
  } catch (error) {
    console.error('Save statement error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
