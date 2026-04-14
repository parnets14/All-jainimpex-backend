import { bankAccountSchema } from '../models/BankAccount.js';
import { cashAccountSchema } from '../models/CashAccount.js';
import { dealerLedgerSchema } from '../models/DealerLedger.js';
import { supplierLedgerSchema } from '../models/SupplierLedger.js';
import { stockMovementSchema } from '../models/Stock.js';
import { grnSchema } from '../models/GRN.js';
import { expenseSchema } from '../models/Expense.js';
import { chequeSchema } from '../models/Cheque.js';
import { capitalSchema } from '../models/Capital.js';
import { loanSchema } from '../models/Loan.js';
import { fixedAssetSchema } from '../models/FixedAsset.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';
import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { accountMasterSchema } from '../models/AccountMaster.js';

const getModels = (dbConnection) => {
  return {
    BankAccount: dbConnection.models.BankAccount || dbConnection.model('BankAccount', bankAccountSchema),
    CashAccount: dbConnection.models.CashAccount || dbConnection.model('CashAccount', cashAccountSchema),
    DealerLedger: dbConnection.models.DealerLedger || dbConnection.model('DealerLedger', dealerLedgerSchema),
    SupplierLedger: dbConnection.models.SupplierLedger || dbConnection.model('SupplierLedger', supplierLedgerSchema),
    StockMovement: dbConnection.models.StockMovement || dbConnection.model('StockMovement', stockMovementSchema),
    GRN: dbConnection.models.GRN || dbConnection.model('GRN', grnSchema),
    Expense: dbConnection.models.Expense || dbConnection.model('Expense', expenseSchema),
    Cheque: dbConnection.models.Cheque || dbConnection.model('Cheque', chequeSchema),
    Capital: dbConnection.models.Capital || dbConnection.model('Capital', capitalSchema),
    Loan: dbConnection.models.Loan || dbConnection.model('Loan', loanSchema),
    FixedAsset: dbConnection.models.FixedAsset || dbConnection.model('FixedAsset', fixedAssetSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    SupplierInvoice: dbConnection.models.SupplierInvoice || dbConnection.model('SupplierInvoice', supplierInvoiceSchema),
    JournalVoucher: dbConnection.models.JournalVoucher || dbConnection.model('JournalVoucher', journalVoucherSchema),
    AccountMaster: dbConnection.models.AccountMaster || dbConnection.model('AccountMaster', accountMasterSchema)
  };
};

// ─── helpers ────────────────────────────────────────────────────────────────

const pct = (val, total) => (total > 0 ? ((val / total) * 100).toFixed(2) : '0.00');

/**
 * Weighted-average purchase cost per product from all GRNs up to reportDate.
 * Returns Map<productId_string, avgCost>
 */
async function buildWeightedAvgCost(reportDate, dbConnection) {
  const { GRN } = getModels(dbConnection);
  const grns = await GRN.find({
    grnDate: { $lte: reportDate },
    status: { $nin: ['Cancelled'] }
  }).lean();

  const map = {}; // productId -> { totalQty, totalCost }
  for (const grn of grns) {
    for (const item of grn.items) {
      const pid = item.productId.toString();
      if (!map[pid]) map[pid] = { totalQty: 0, totalCost: 0 };
      map[pid].totalQty += item.acceptedQuantity || 0;
      map[pid].totalCost += (item.acceptedQuantity || 0) * (item.unitPrice || 0);
    }
  }

  const result = {};
  for (const [pid, v] of Object.entries(map)) {
    result[pid] = v.totalQty > 0 ? v.totalCost / v.totalQty : 0;
  }
  return result;
}

/**
 * Aggregate journal voucher entries by accountGroup up to reportDate.
 * Returns { [accountGroup]: { debit, credit } }
 */
async function aggregateJournalEntries(reportDate, dbConnection) {
  const { JournalVoucher } = getModels(dbConnection);
  const vouchers = await JournalVoucher.find({
    voucherDate: { $lte: reportDate },
    status: 'Posted'
  }).lean();

  const result = {};
  for (const v of vouchers) {
    for (const e of v.entries) {
      const g = e.accountGroup;
      if (!result[g]) result[g] = { debit: 0, credit: 0 };
      result[g].debit += e.debit || 0;
      result[g].credit += e.credit || 0;
    }
  }
  return result;
}

// ─── main controller ─────────────────────────────────────────────────────────

export const generateBalanceSheet = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const { CashAccount, BankAccount, DealerLedger, SupplierLedger, StockMovement, 
            SupplierInvoice, DealerInvoice, Expense, Cheque, Capital, Loan, FixedAsset, AccountMaster } = models;
    const { asOfDate, financialYear } = req.query;
    const reportDate = asOfDate ? new Date(asOfDate) : new Date();

    // ── 1. CASH & BANK ────────────────────────────────────────────────────────
    const cashAccount = await CashAccount.getCashAccount();
    const cashInHand = cashAccount?.currentBalance || 0;

    const bankAccounts = await BankAccount.find({ isActive: true });
    const bankBalances = bankAccounts.reduce((s, a) => s + (a.currentBalance || 0), 0);
    const bankAccountDetails = bankAccounts.map(a => ({
      accountName: a.accountName,
      accountNumber: a.accountNumber,
      bankName: a.bankName,
      balance: a.currentBalance || 0
    }));

    // ── 2. ACCOUNTS RECEIVABLE ────────────────────────────────────────────────
    const arAgg = await DealerLedger.aggregate([
      { $match: { entryDate: { $lte: reportDate }, status: { $in: ['Active', 'Overdue'] } } },
      { $group: { _id: '$dealer', debit: { $sum: '$debitAmount' }, credit: { $sum: '$creditAmount' } } },
      { $project: { balance: { $subtract: ['$debit', '$credit'] } } },
      { $match: { balance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);
    const accountsReceivable = arAgg[0]?.total || 0;

    // ── 3. ADVANCE TO SUPPLIERS ───────────────────────────────────────────────
    const advSupAgg = await SupplierLedger.aggregate([
      { $match: { entryDate: { $lte: reportDate }, transactionType: 'Advance Payment', status: 'Active' } },
      { $group: { _id: null, total: { $sum: '$debitAmount' } } }
    ]);
    const advanceToSuppliers = advSupAgg[0]?.total || 0;

    // ── 4. INVENTORY — weighted average cost from GRNs ────────────────────────
    const avgCostMap = await buildWeightedAvgCost(reportDate, req.dbConnection);

    const stockAgg = await StockMovement.aggregate([
      { $match: { date: { $lte: reportDate } } },
      { $sort: { date: -1, createdAt: -1 } },
      { $group: { _id: { productId: '$productId', warehouseId: '$warehouseId' }, latestBalance: { $first: '$balance' } } },
      { $match: { latestBalance: { $gt: 0 } } },
      { $group: { _id: '$_id.productId', totalQty: { $sum: '$latestBalance' } } }
    ]);

    let inventoryValue = 0;
    let inventoryQuantity = 0;
    const inventoryBreakdown = [];
    for (const row of stockAgg) {
      const pid = row._id.toString();
      const qty = row.totalQty;
      const cost = avgCostMap[pid] || 0;
      const val = qty * cost;
      inventoryValue += val;
      inventoryQuantity += qty;
      inventoryBreakdown.push({ productId: pid, quantity: qty, avgCost: cost, value: val });
    }

    // ── 5. GST INPUT CREDIT (from supplier invoices) ──────────────────────────
    const gstInputAgg = await SupplierInvoice.aggregate([
      { $match: { invoiceDate: { $lte: reportDate }, status: { $nin: ['Cancelled'] } } },
      { $group: { _id: null, totalGst: { $sum: '$totalGst' } } }
    ]);
    const gstInputCredit = gstInputAgg[0]?.totalGst || 0;

    // ── 6. JOURNAL VOUCHER ADJUSTMENTS ────────────────────────────────────────
    const jvGroups = await aggregateJournalEntries(reportDate, req.dbConnection);

    // Journal entries that affect current assets (Dr = increase asset)
    const jvCurrentAssets = (jvGroups['Current Assets']?.debit || 0) - (jvGroups['Current Assets']?.credit || 0);
    // Opening stock from journal entries
    const jvOpeningStock = (jvGroups['Fixed Assets']?.debit || 0) - (jvGroups['Fixed Assets']?.credit || 0);

    // ── 7. FIXED ASSETS ───────────────────────────────────────────────────────
    const fixedAssets = await FixedAsset.find({ status: 'Active', purchaseDate: { $lte: reportDate } });
    const fixedAssetsGross = fixedAssets.reduce((s, a) => s + (a.currentValue || 0), 0);
    const accumulatedDepreciation = fixedAssets.reduce((s, a) => s + (a.accumulatedDepreciation || 0), 0);
    // Add journal depreciation entries
    const jvDepreciation = jvGroups['Depreciation']?.debit || 0;
    const netFixedAssets = fixedAssetsGross - accumulatedDepreciation - jvDepreciation + jvOpeningStock;

    const fixedAssetsByCategory = fixedAssets.reduce((acc, a) => {
      if (!acc[a.assetCategory]) acc[a.assetCategory] = { grossValue: 0, depreciation: 0, netValue: 0, count: 0 };
      acc[a.assetCategory].grossValue += a.currentValue || 0;
      acc[a.assetCategory].depreciation += a.accumulatedDepreciation || 0;
      acc[a.assetCategory].netValue += (a.currentValue || 0) - (a.accumulatedDepreciation || 0);
      acc[a.assetCategory].count += 1;
      return acc;
    }, {});

    // ── TOTAL ASSETS ──────────────────────────────────────────────────────────
    const totalCurrentAssets = cashInHand + bankBalances + accountsReceivable
      + advanceToSuppliers + inventoryValue + gstInputCredit + jvCurrentAssets;
    const totalAssets = totalCurrentAssets + netFixedAssets;

    // ── 8. ACCOUNTS PAYABLE ───────────────────────────────────────────────────
    const apAgg = await SupplierLedger.aggregate([
      { $match: { entryDate: { $lte: reportDate }, status: { $in: ['Active', 'Overdue'] } } },
      { $group: { _id: '$supplier', debit: { $sum: '$debitAmount' }, credit: { $sum: '$creditAmount' } } },
      { $project: { balance: { $subtract: ['$credit', '$debit'] } } },
      { $match: { balance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);
    const accountsPayable = apAgg[0]?.total || 0;

    // ── 9. ADVANCE FROM DEALERS ───────────────────────────────────────────────
    const advDealerAgg = await DealerLedger.aggregate([
      { $match: { entryDate: { $lte: reportDate }, transactionType: 'Advance Payment', status: 'Active' } },
      { $group: { _id: null, total: { $sum: '$creditAmount' } } }
    ]);
    const advanceFromDealers = advDealerAgg[0]?.total || 0;

    // ── 10. GST PAYABLE (collected on sales - input credit) ───────────────────
    const gstSalesAgg = await DealerInvoice.aggregate([
      { $match: {
        invoiceDate: { $lte: reportDate },
        status: { $nin: ['Cancelled', 'Draft'] },
        isDraft: false,
        isDeleted: { $ne: true }
      }},
      { $group: { _id: null, totalGst: { $sum: '$totalGst' } } }
    ]);
    const gstCollected = gstSalesAgg[0]?.totalGst || 0;
    // GST Payable = GST collected on sales - GST input credit from purchases
    // Also add any journal adjustments for GST
    const jvGstPayable = (jvGroups['GST Payable']?.credit || 0) - (jvGroups['GST Payable']?.debit || 0);
    const gstPayable = Math.max(0, gstCollected - gstInputCredit + jvGstPayable);

    // ── 11. OUTSTANDING EXPENSES ──────────────────────────────────────────────
    const pendingExpAgg = await Expense.aggregate([
      { $match: { date: { $lte: reportDate }, status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingExpenses = pendingExpAgg[0]?.total || 0;

    // ── 12. CHEQUES PAYABLE ───────────────────────────────────────────────────
    const chequesAgg = await Cheque.aggregate([
      { $match: { date: { $lte: reportDate }, status: { $in: ['Not Deposited', 'Deposited'] }, isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingCheques = chequesAgg[0]?.total || 0;

    // ── 13. JOURNAL LIABILITIES ───────────────────────────────────────────────
    const jvCurrentLiabilities = (jvGroups['Current Liabilities']?.credit || 0) - (jvGroups['Current Liabilities']?.debit || 0);
    const jvLoansLiabilities = (jvGroups['Loans & Liabilities']?.credit || 0) - (jvGroups['Loans & Liabilities']?.debit || 0);

    const totalCurrentLiabilities = accountsPayable + advanceFromDealers + gstPayable
      + pendingExpenses + pendingCheques + jvCurrentLiabilities;

    // ── 14. LOANS ─────────────────────────────────────────────────────────────
    const loans = await Loan.find({ status: { $in: ['Active', 'Overdue'] }, disbursementDate: { $lte: reportDate } });
    const totalLoans = loans.reduce((s, l) => s + (l.totalOutstanding || 0), 0) + jvLoansLiabilities;
    const loansByType = loans.reduce((acc, l) => {
      if (!acc[l.loanType]) acc[l.loanType] = { principal: 0, interest: 0, total: 0, count: 0 };
      acc[l.loanType].principal += l.outstandingPrincipal || 0;
      acc[l.loanType].interest += l.outstandingInterest || 0;
      acc[l.loanType].total += l.totalOutstanding || 0;
      acc[l.loanType].count += 1;
      return acc;
    }, {});

    const totalLiabilities = totalCurrentLiabilities + totalLoans;

    // ── 15. CAPITAL ───────────────────────────────────────────────────────────
    // From Capital model (existing)
    const capitalDocs = await Capital.find(financialYear ? { financialYear } : {});
    const capitalFromModel = capitalDocs.reduce((s, c) => s + (c.currentBalance || 0), 0);

    // From AccountMaster opening balances (Capital group)
    const capitalAccounts = await AccountMaster.find({ accountGroup: 'Capital', isActive: true });
    const capitalFromMaster = capitalAccounts.reduce((s, a) => {
      const bal = a.openingBalance || 0;
      return s + (a.openingBalanceType === 'Cr' ? bal : -bal);
    }, 0);

    // Journal entries affecting Capital
    const jvCapital = (jvGroups['Capital']?.credit || 0) - (jvGroups['Capital']?.debit || 0);
    const jvReserves = (jvGroups['Reserves & Surplus']?.credit || 0) - (jvGroups['Reserves & Surplus']?.debit || 0);

    const totalCapital = capitalFromModel + capitalFromMaster + jvCapital + jvReserves;

    // ── 16. PROFIT / LOSS ─────────────────────────────────────────────────────
    // Revenue = NET sales (excluding GST — GST goes to GST Payable liability)
    // Only count approved invoices (not drafts, not deleted, not cancelled)
    const revenueAgg = await DealerInvoice.aggregate([
      { $match: {
        invoiceDate: { $lte: reportDate },
        status: { $nin: ['Cancelled', 'Draft'] },
        isDraft: false,
        isDeleted: { $ne: true }
      }},
      { $group: { _id: null, subtotal: { $sum: '$subtotal' }, totalDiscount: { $sum: '$totalDiscount' } } }
    ]);
    const netSales = (revenueAgg[0]?.subtotal || 0) - (revenueAgg[0]?.totalDiscount || 0);

    // Cost of goods = supplier invoice net (excluding GST)
    const costAgg = await SupplierInvoice.aggregate([
      { $match: {
        invoiceDate: { $lte: reportDate },
        status: { $nin: ['Cancelled'] }
      }},
      { $group: { _id: null, subtotal: { $sum: '$subtotal' }, totalDiscount: { $sum: '$totalDiscount' } } }
    ]);
    const costOfGoods = (costAgg[0]?.subtotal || 0) - (costAgg[0]?.totalDiscount || 0);

    // Approved expenses
    const expAgg = await Expense.aggregate([
      { $match: { date: { $lte: reportDate }, status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalExpenses = expAgg[0]?.total || 0;

    // Journal income/expense adjustments
    const jvSales = (jvGroups['Sales']?.credit || 0) - (jvGroups['Sales']?.debit || 0);
    const jvPurchase = (jvGroups['Purchase']?.debit || 0) - (jvGroups['Purchase']?.credit || 0);
    const jvDirectExp = (jvGroups['Direct Expenses']?.debit || 0) - (jvGroups['Direct Expenses']?.credit || 0);
    const jvIndirectExp = (jvGroups['Indirect Expenses']?.debit || 0) - (jvGroups['Indirect Expenses']?.credit || 0);

    const totalRevenue = netSales + jvSales;
    const totalCost = costOfGoods + jvPurchase;
    const grossProfit = totalRevenue - totalCost;
    const profitLoss = grossProfit - totalExpenses - jvDirectExp - jvIndirectExp;

    const totalEquity = totalCapital + profitLoss;

    // ── BALANCE CHECK ─────────────────────────────────────────────────────────
    const balanceDifference = totalAssets - (totalLiabilities + totalEquity);
    const isBalanced = Math.abs(balanceDifference) < 1;

    // ── RESPONSE ──────────────────────────────────────────────────────────────
    res.status(200).json({
      success: true,
      message: 'Balance sheet generated successfully',
      data: {
        reportDate,
        financialYear: financialYear || 'Current',
        generatedAt: new Date(),
        generatedBy: req.user?._id,

        assets: {
          currentAssets: {
            cashInHand:          { amount: cashInHand,          pct: pct(cashInHand, totalAssets) },
            bankBalances:        { amount: bankBalances,         pct: pct(bankBalances, totalAssets), details: bankAccountDetails },
            accountsReceivable:  { amount: accountsReceivable,  pct: pct(accountsReceivable, totalAssets) },
            advanceToSuppliers:  { amount: advanceToSuppliers,  pct: pct(advanceToSuppliers, totalAssets) },
            inventory:           { amount: inventoryValue,       quantity: inventoryQuantity, pct: pct(inventoryValue, totalAssets), breakdown: inventoryBreakdown },
            gstInputCredit:      { amount: gstInputCredit,       pct: pct(gstInputCredit, totalAssets) },
            journalAdjustments:  { amount: jvCurrentAssets,      pct: pct(jvCurrentAssets, totalAssets) },
            total: totalCurrentAssets
          },
          fixedAssets: {
            grossValue: fixedAssetsGross,
            accumulatedDepreciation,
            journalDepreciation: jvDepreciation,
            netValue: netFixedAssets,
            pct: pct(netFixedAssets, totalAssets),
            byCategory: fixedAssetsByCategory
          },
          totalAssets
        },

        liabilities: {
          currentLiabilities: {
            accountsPayable:     { amount: accountsPayable,     pct: pct(accountsPayable, totalLiabilities) },
            advanceFromDealers:  { amount: advanceFromDealers,  pct: pct(advanceFromDealers, totalLiabilities) },
            gstPayable:          { amount: gstPayable,           pct: pct(gstPayable, totalLiabilities), gstCollected, gstInputCredit },
            outstandingExpenses: { amount: pendingExpenses,      pct: pct(pendingExpenses, totalLiabilities) },
            chequesPayable:      { amount: pendingCheques,       pct: pct(pendingCheques, totalLiabilities) },
            journalAdjustments:  { amount: jvCurrentLiabilities, pct: pct(jvCurrentLiabilities, totalLiabilities) },
            total: totalCurrentLiabilities
          },
          longTermLiabilities: {
            loans: { amount: totalLoans, pct: pct(totalLoans, totalLiabilities), byType: loansByType },
            total: totalLoans
          },
          totalLiabilities
        },

        equity: {
          capital: {
            amount: totalCapital,
            fromCapitalModel: capitalFromModel,
            fromAccountMaster: capitalFromMaster,
            journalAdjustments: jvCapital + jvReserves,
            accounts: capitalDocs.map(c => ({ ownerName: c.ownerName, type: c.capitalType, balance: c.currentBalance }))
          },
          profitLoss: {
            amount: profitLoss,
            netSales: totalRevenue,
            costOfGoods: totalCost,
            grossProfit,
            expenses: totalExpenses + jvDirectExp + jvIndirectExp,
            breakdown: {
              salesRevenue: netSales,
              journalSalesAdj: jvSales,
              purchaseCost: costOfGoods,
              journalPurchaseAdj: jvPurchase,
              approvedExpenses: totalExpenses,
              directExpenses: jvDirectExp,
              indirectExpenses: jvIndirectExp
            }
          },
          totalEquity
        },

        summary: {
          totalAssets,
          totalLiabilities,
          totalEquity,
          balanceDifference,
          isBalanced
        },

        ratios: {
          currentRatio:       totalCurrentLiabilities > 0 ? (totalCurrentAssets / totalCurrentLiabilities).toFixed(2) : 'N/A',
          debtToEquityRatio:  totalEquity > 0 ? (totalLiabilities / totalEquity).toFixed(2) : 'N/A',
          debtToAssetRatio:   totalAssets > 0 ? (totalLiabilities / totalAssets * 100).toFixed(2) : '0.00',
          equityRatio:        totalAssets > 0 ? (totalEquity / totalAssets * 100).toFixed(2) : '0.00',
          grossProfitMargin:  totalRevenue > 0 ? (grossProfit / totalRevenue * 100).toFixed(2) : '0.00',
          netProfitMargin:    totalRevenue > 0 ? (profitLoss / totalRevenue * 100).toFixed(2) : '0.00'
        }
      }
    });

  } catch (error) {
    console.error('❌ Balance sheet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate balance sheet',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getBalanceSheetComparison = async (req, res) => {
  res.status(200).json({ success: true, message: 'Comparison not yet implemented', data: {} });
};

export const exportBalanceSheet = async (req, res) => {
  res.status(200).json({ success: true, message: 'Export not yet implemented', data: {} });
};
