// Data verification script for balance sheet
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BankAccount from './models/BankAccount.js';
import CashAccount from './models/CashAccount.js';
import DealerLedger from './models/DealerLedger.js';
import SupplierLedger from './models/SupplierLedger.js';
import StockMovement from './models/Stock.js';
import Product from './models/Product.js';
import Expense from './models/Expense.js';
import Cheque from './models/Cheque.js';
import Capital from './models/Capital.js';
import Loan from './models/Loan.js';
import FixedAsset from './models/FixedAsset.js';
import DealerInvoice from './models/DealerInvoice.js';
import SupplierInvoice from './models/SupplierInvoice.js';
import Dealer from './models/Dealer.js';
import Supplier from './models/Supplier.js';

dotenv.config();

async function verifyData() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const reportDate = new Date();
    console.log('📅 Report Date:', reportDate.toISOString().split('T')[0], '\n');

    // ============ ASSETS ============
    console.log('═══════════════════════════════════════');
    console.log('           ASSETS VERIFICATION          ');
    console.log('═══════════════════════════════════════\n');

    // 1. Cash Account
    console.log('💰 CASH IN HAND:');
    const cashAccount = await CashAccount.findOne();
    if (cashAccount) {
      console.log('   ✅ Cash Account exists');
      console.log('   Opening Balance:', cashAccount.openingBalance);
      console.log('   Current Balance:', cashAccount.currentBalance);
    } else {
      console.log('   ❌ No cash account found');
    }
    console.log('');

    // 2. Bank Accounts
    console.log('🏦 BANK ACCOUNTS:');
    const bankAccounts = await BankAccount.find({ isActive: true });
    console.log(`   Found ${bankAccounts.length} active bank accounts`);
    if (bankAccounts.length > 0) {
      bankAccounts.forEach((acc, idx) => {
        console.log(`   ${idx + 1}. ${acc.accountName} (${acc.bankName})`);
        console.log(`      Balance: ₹${acc.currentBalance || 0}`);
      });
      const totalBank = bankAccounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);
      console.log(`   Total Bank Balance: ₹${totalBank}`);
    }
    console.log('');

    // 3. Dealer Ledger (Accounts Receivable)
    console.log('👥 DEALER LEDGER (Accounts Receivable):');
    const dealerLedgerCount = await DealerLedger.countDocuments();
    console.log(`   Total ledger entries: ${dealerLedgerCount}`);
    
    const dealerLedgerActive = await DealerLedger.countDocuments({
      status: { $in: ['Active', 'Overdue'] }
    });
    console.log(`   Active/Overdue entries: ${dealerLedgerActive}`);
    
    // Sample aggregation
    const dealerOutstanding = await DealerLedger.aggregate([
      {
        $match: {
          entryDate: { $lte: reportDate },
          status: { $in: ['Active', 'Overdue'] }
        }
      },
      {
        $group: {
          _id: '$dealer',
          totalDebit: { $sum: '$debitAmount' },
          totalCredit: { $sum: '$creditAmount' }
        }
      },
      {
        $project: {
          balance: { $subtract: ['$totalDebit', '$totalCredit'] }
        }
      },
      {
        $match: {
          balance: { $gt: 0 }
        }
      }
    ]);
    
    console.log(`   Dealers with outstanding: ${dealerOutstanding.length}`);
    const totalReceivable = dealerOutstanding.reduce((sum, d) => sum + d.balance, 0);
    console.log(`   Total Accounts Receivable: ₹${totalReceivable}`);
    
    if (dealerOutstanding.length > 0 && dealerOutstanding.length <= 5) {
      console.log('   Top outstanding dealers:');
      for (const d of dealerOutstanding.slice(0, 5)) {
        const dealer = await Dealer.findById(d._id);
        console.log(`      ${dealer?.dealerName || 'Unknown'}: ₹${d.balance}`);
      }
    }
    console.log('');

    // 4. Inventory/Stock
    console.log('📦 INVENTORY (Stock):');
    const stockCount = await StockMovement.countDocuments();
    console.log(`   Total stock movements: ${stockCount}`);
    
    if (stockCount > 0) {
      const latestStock = await StockMovement.aggregate([
        {
          $match: {
            date: { $lte: reportDate }
          }
        },
        {
          $sort: { date: -1, createdAt: -1 }
        },
        {
          $group: {
            _id: { productId: '$productId', warehouseId: '$warehouseId' },
            latestBalance: { $first: '$balance' },
            latestDate: { $first: '$date' }
          }
        },
        {
          $match: {
            latestBalance: { $gt: 0 }
          }
        }
      ]);
      
      console.log(`   Products with stock: ${latestStock.length}`);
      
      // Calculate value
      let totalValue = 0;
      let totalQty = 0;
      for (const stock of latestStock) {
        const product = await Product.findById(stock._id.productId);
        if (product && product.purchasePrice) {
          const value = stock.latestBalance * product.purchasePrice;
          totalValue += value;
          totalQty += stock.latestBalance;
        }
      }
      
      console.log(`   Total Quantity: ${totalQty}`);
      console.log(`   Total Inventory Value: ₹${totalValue}`);
    }
    console.log('');

    // 5. Supplier Advances
    console.log('🏭 SUPPLIER ADVANCES:');
    const supplierAdvances = await SupplierLedger.find({
      entryDate: { $lte: reportDate },
      transactionType: 'Advance Payment',
      status: 'Active'
    });
    console.log(`   Advance payment entries: ${supplierAdvances.length}`);
    const totalAdvances = supplierAdvances.reduce((sum, adv) => sum + (adv.creditAmount || 0), 0);
    console.log(`   Total Advances to Suppliers: ₹${totalAdvances}`);
    console.log('');

    // 6. Fixed Assets
    console.log('🏢 FIXED ASSETS:');
    const fixedAssets = await FixedAsset.find({ status: 'Active' });
    console.log(`   Active fixed assets: ${fixedAssets.length}`);
    if (fixedAssets.length > 0) {
      const totalGross = fixedAssets.reduce((sum, a) => sum + (a.currentValue || 0), 0);
      const totalDep = fixedAssets.reduce((sum, a) => sum + (a.accumulatedDepreciation || 0), 0);
      console.log(`   Gross Value: ₹${totalGross}`);
      console.log(`   Accumulated Depreciation: ₹${totalDep}`);
      console.log(`   Net Value: ₹${totalGross - totalDep}`);
    }
    console.log('');

    // ============ LIABILITIES ============
    console.log('═══════════════════════════════════════');
    console.log('        LIABILITIES VERIFICATION        ');
    console.log('═══════════════════════════════════════\n');

    // 1. Supplier Ledger (Accounts Payable)
    console.log('🏭 SUPPLIER LEDGER (Accounts Payable):');
    const supplierLedgerCount = await SupplierLedger.countDocuments();
    console.log(`   Total ledger entries: ${supplierLedgerCount}`);
    
    const supplierOutstanding = await SupplierLedger.aggregate([
      {
        $match: {
          entryDate: { $lte: reportDate },
          status: { $in: ['Active', 'Overdue'] }
        }
      },
      {
        $group: {
          _id: '$supplier',
          totalDebit: { $sum: '$debitAmount' },
          totalCredit: { $sum: '$creditAmount' }
        }
      },
      {
        $project: {
          balance: { $subtract: ['$totalDebit', '$totalCredit'] }
        }
      },
      {
        $match: {
          balance: { $gt: 0 }
        }
      }
    ]);
    
    console.log(`   Suppliers with outstanding: ${supplierOutstanding.length}`);
    const totalPayable = supplierOutstanding.reduce((sum, s) => sum + s.balance, 0);
    console.log(`   Total Accounts Payable: ₹${totalPayable}`);
    console.log('');

    // 2. Dealer Advances
    console.log('👥 DEALER ADVANCES:');
    const dealerAdvances = await DealerLedger.find({
      entryDate: { $lte: reportDate },
      transactionType: 'Advance Payment',
      status: 'Active'
    });
    console.log(`   Advance payment entries: ${dealerAdvances.length}`);
    const totalDealerAdvances = dealerAdvances.reduce((sum, adv) => sum + (adv.creditAmount || 0), 0);
    console.log(`   Total Advances from Dealers: ₹${totalDealerAdvances}`);
    console.log('');

    // 3. Outstanding Expenses
    console.log('💸 OUTSTANDING EXPENSES:');
    const pendingExpenses = await Expense.find({
      date: { $lte: reportDate },
      status: 'pending'
    });
    console.log(`   Pending expense claims: ${pendingExpenses.length}`);
    const totalPendingExpenses = pendingExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    console.log(`   Total Outstanding Expenses: ₹${totalPendingExpenses}`);
    console.log('');

    // 4. Cheques Payable
    console.log('📝 CHEQUES PAYABLE:');
    const pendingCheques = await Cheque.find({
      date: { $lte: reportDate },
      status: { $in: ['Not Deposited', 'Deposited'] }
    });
    console.log(`   Pending cheques: ${pendingCheques.length}`);
    const totalCheques = pendingCheques.reduce((sum, chq) => sum + (chq.amount || 0), 0);
    console.log(`   Total Cheques Payable: ₹${totalCheques}`);
    console.log('');

    // 5. Loans
    console.log('💳 LOANS & BORROWINGS:');
    const activeLoans = await Loan.find({
      status: { $in: ['Active', 'Overdue'] }
    });
    console.log(`   Active loans: ${activeLoans.length}`);
    if (activeLoans.length > 0) {
      const totalLoans = activeLoans.reduce((sum, loan) => sum + (loan.totalOutstanding || 0), 0);
      console.log(`   Total Outstanding Loans: ₹${totalLoans}`);
    }
    console.log('');

    // ============ EQUITY ============
    console.log('═══════════════════════════════════════');
    console.log('          EQUITY VERIFICATION           ');
    console.log('═══════════════════════════════════════\n');

    // 1. Capital
    console.log('💰 CAPITAL:');
    const capitalAccounts = await Capital.find();
    console.log(`   Capital accounts: ${capitalAccounts.length}`);
    if (capitalAccounts.length > 0) {
      const totalCapital = capitalAccounts.reduce((sum, cap) => sum + (cap.currentBalance || 0), 0);
      console.log(`   Total Capital: ₹${totalCapital}`);
      capitalAccounts.forEach((cap, idx) => {
        console.log(`   ${idx + 1}. ${cap.ownerName} (${cap.capitalType}): ₹${cap.currentBalance}`);
      });
    } else {
      console.log('   ⚠️  No capital accounts found - Please add capital accounts!');
    }
    console.log('');

    // 2. Profit/Loss
    console.log('📊 PROFIT/LOSS CALCULATION:');
    
    // Revenue
    const dealerInvoices = await DealerInvoice.find({
      invoiceDate: { $lte: reportDate },
      status: { $nin: ['Cancelled', 'Draft'] }
    });
    const totalRevenue = dealerInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    console.log(`   Dealer Invoices: ${dealerInvoices.length}`);
    console.log(`   Total Revenue: ₹${totalRevenue}`);
    
    // Cost
    const supplierInvoices = await SupplierInvoice.find({
      invoiceDate: { $lte: reportDate },
      status: { $nin: ['Cancelled', 'Draft'] }
    });
    const totalCost = supplierInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    console.log(`   Supplier Invoices: ${supplierInvoices.length}`);
    console.log(`   Total Cost: ₹${totalCost}`);
    
    // Expenses
    const approvedExpenses = await Expense.find({
      date: { $lte: reportDate },
      status: 'approved'
    });
    const totalExpenses = approvedExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    console.log(`   Approved Expenses: ${approvedExpenses.length}`);
    console.log(`   Total Expenses: ₹${totalExpenses}`);
    
    const profitLoss = totalRevenue - totalCost - totalExpenses;
    console.log(`   Profit/Loss: ₹${profitLoss}`);
    console.log('');

    // ============ SUMMARY ============
    console.log('═══════════════════════════════════════');
    console.log('              SUMMARY                   ');
    console.log('═══════════════════════════════════════\n');

    const totalAssets = (cashAccount?.currentBalance || 0) + 
                       bankAccounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0) +
                       totalReceivable;
    
    const totalLiabilities = totalPayable + totalDealerAdvances + totalPendingExpenses + totalCheques;
    
    const totalEquity = capitalAccounts.reduce((sum, cap) => sum + (cap.currentBalance || 0), 0) + profitLoss;
    
    console.log(`Total Assets: ₹${totalAssets}`);
    console.log(`Total Liabilities: ₹${totalLiabilities}`);
    console.log(`Total Equity: ₹${totalEquity}`);
    console.log(`\nBalance Check: Assets (₹${totalAssets}) ${totalAssets === (totalLiabilities + totalEquity) ? '=' : '≠'} Liabilities + Equity (₹${totalLiabilities + totalEquity})`);
    console.log(`Difference: ₹${Math.abs(totalAssets - (totalLiabilities + totalEquity))}`);
    
    console.log('\n═══════════════════════════════════════');
    console.log('✅ Verification Complete!');
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

verifyData();
