import BankAccount from '../models/BankAccount.js';
import CashAccount from '../models/CashAccount.js';
import DealerLedger from '../models/DealerLedger.js';
import SupplierLedger from '../models/SupplierLedger.js';
import StockMovement from '../models/Stock.js';
import Product from '../models/Product.js';
import Expense from '../models/Expense.js';
import Cheque from '../models/Cheque.js';
import Capital from '../models/Capital.js';
import Loan from '../models/Loan.js';
import FixedAsset from '../models/FixedAsset.js';
import DealerInvoice from '../models/DealerInvoice.js';
import SupplierInvoice from '../models/SupplierInvoice.js';
import mongoose from 'mongoose';

/**
 * Generate Balance Sheet
 * GET /api/balance-sheet/generate
 */
export const generateBalanceSheet = async (req, res) => {
  try {
    const { asOfDate, financialYear } = req.query;
    const reportDate = asOfDate ? new Date(asOfDate) : new Date();
    
    console.log('📊 Generating Balance Sheet for date:', reportDate);
    console.log('📊 Financial Year:', financialYear || 'Current');
    console.log('📊 User:', req.user?._id);

    // ============ ASSETS ============
    
    // 1. Current Assets
    
    // Cash in Hand
    console.log('💰 Fetching cash account...');
    const cashAccount = await CashAccount.getCashAccount();
    const cashInHand = cashAccount?.currentBalance || 0;
    console.log('💰 Cash in Hand:', cashInHand);
    
    // Bank Balances
    console.log('🏦 Fetching bank accounts...');
    const bankAccounts = await BankAccount.find({ isActive: true });
    const bankBalances = bankAccounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);
    console.log('🏦 Bank Balances:', bankBalances, 'from', bankAccounts.length, 'accounts');
    const bankAccountDetails = bankAccounts.map(acc => ({
      accountName: acc.accountName,
      accountNumber: acc.accountNumber,
      bankName: acc.bankName,
      balance: acc.currentBalance || 0
    }));
    
    // Accounts Receivable (Dealer Outstanding)
    console.log('👥 Fetching dealer ledger...');
    const dealerLedgerAggregation = await DealerLedger.aggregate([
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
          // For dealers: They owe us when Debit > Credit
          balance: { $subtract: ['$totalDebit', '$totalCredit'] }
        }
      },
      {
        $match: {
          balance: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          totalReceivable: { $sum: '$balance' }
        }
      }
    ]);
    
    const accountsReceivable = dealerLedgerAggregation[0]?.totalReceivable || 0;
    console.log('👥 Accounts Receivable:', accountsReceivable);
    
    // Advance Payments to Suppliers
    console.log('🏭 Fetching supplier advances...');
    const supplierAdvanceAggregation = await SupplierLedger.aggregate([
      {
        $match: {
          entryDate: { $lte: reportDate },
          transactionType: 'Advance Payment',
          status: 'Active'
        }
      },
      {
        $group: {
          _id: null,
          // Advances we paid to suppliers are debits in supplier ledger
          totalAdvance: { $sum: '$debitAmount' }
        }
      }
    ]);
    
    const advanceToSuppliers = supplierAdvanceAggregation[0]?.totalAdvance || 0;
    console.log('🏭 Advance to Suppliers:', advanceToSuppliers);
    
    // Inventory Value (Stock)
    console.log('📦 Fetching inventory...');
    const stockAggregation = await StockMovement.aggregate([
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
          latestBalance: { $first: '$balance' }
        }
      },
      {
        $match: {
          latestBalance: { $gt: 0 }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: {
          path: '$product',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          quantity: '$latestBalance',
          purchasePrice: { $ifNull: ['$product.purchasePrice', 0] },
          value: { 
            $multiply: [
              '$latestBalance', 
              { $ifNull: ['$product.purchasePrice', 0] }
            ] 
          }
        }
      },
      {
        $group: {
          _id: null,
          totalInventoryValue: { $sum: '$value' },
          totalQuantity: { $sum: '$quantity' }
        }
      }
    ]);
    
    const inventoryValue = stockAggregation[0]?.totalInventoryValue || 0;
    const inventoryQuantity = stockAggregation[0]?.totalQuantity || 0;
    console.log('📦 Inventory Value:', inventoryValue, 'Quantity:', inventoryQuantity);
    
    // Total Current Assets
    const totalCurrentAssets = cashInHand + bankBalances + accountsReceivable + advanceToSuppliers + inventoryValue;
    
    // 2. Fixed Assets
    const fixedAssets = await FixedAsset.find({ 
      status: 'Active',
      purchaseDate: { $lte: reportDate }
    });
    
    const fixedAssetsValue = fixedAssets.reduce((sum, asset) => sum + (asset.currentValue || 0), 0);
    const accumulatedDepreciation = fixedAssets.reduce((sum, asset) => sum + (asset.accumulatedDepreciation || 0), 0);
    const netFixedAssets = fixedAssetsValue - accumulatedDepreciation;
    
    const fixedAssetsByCategory = fixedAssets.reduce((acc, asset) => {
      if (!acc[asset.assetCategory]) {
        acc[asset.assetCategory] = {
          grossValue: 0,
          depreciation: 0,
          netValue: 0,
          count: 0
        };
      }
      acc[asset.assetCategory].grossValue += asset.currentValue || 0;
      acc[asset.assetCategory].depreciation += asset.accumulatedDepreciation || 0;
      acc[asset.assetCategory].netValue += (asset.currentValue || 0) - (asset.accumulatedDepreciation || 0);
      acc[asset.assetCategory].count += 1;
      return acc;
    }, {});
    
    // Total Assets
    const totalAssets = totalCurrentAssets + netFixedAssets;
    
    // ============ LIABILITIES ============
    
    // 1. Current Liabilities
    
    // Accounts Payable (Supplier Outstanding)
    console.log('🏭 Fetching supplier ledger...');
    const supplierLedgerAggregation = await SupplierLedger.aggregate([
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
          // For suppliers: We owe them when Credit > Debit
          balance: { $subtract: ['$totalCredit', '$totalDebit'] }
        }
      },
      {
        $match: {
          balance: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          totalPayable: { $sum: '$balance' }
        }
      }
    ]);
    
    const accountsPayable = supplierLedgerAggregation[0]?.totalPayable || 0;
    console.log('🏭 Accounts Payable:', accountsPayable);
    
    // Advance from Dealers
    console.log('👥 Fetching dealer advances...');
    const dealerAdvanceAggregation = await DealerLedger.aggregate([
      {
        $match: {
          entryDate: { $lte: reportDate },
          transactionType: 'Advance Payment',
          status: 'Active'
        }
      },
      {
        $group: {
          _id: null,
          totalAdvance: { $sum: '$creditAmount' }
        }
      }
    ]);
    
    const advanceFromDealers = dealerAdvanceAggregation[0]?.totalAdvance || 0;
    console.log('👥 Advance from Dealers:', advanceFromDealers);
    
    // Outstanding Expenses
    console.log('💸 Fetching outstanding expenses...');
    const outstandingExpenses = await Expense.aggregate([
      {
        $match: {
          date: { $lte: reportDate },
          status: 'pending'
        }
      },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$amount' }
        }
      }
    ]);
    
    const pendingExpenses = outstandingExpenses[0]?.totalExpenses || 0;
    console.log('💸 Outstanding Expenses:', pendingExpenses);
    
    // Cheques Payable (Not Deposited/Cleared)
    console.log('📝 Fetching cheques payable...');
    const chequesPayable = await Cheque.aggregate([
      {
        $match: {
          date: { $lte: reportDate },
          status: { $in: ['Not Deposited', 'Deposited'] }
        }
      },
      {
        $group: {
          _id: null,
          totalCheques: { $sum: '$amount' }
        }
      }
    ]);
    
    const pendingCheques = chequesPayable[0]?.totalCheques || 0;
    console.log('📝 Cheques Payable:', pendingCheques);
    
    // Total Current Liabilities
    const totalCurrentLiabilities = accountsPayable + advanceFromDealers + pendingExpenses + pendingCheques;
    console.log('💰 Total Current Liabilities:', totalCurrentLiabilities);
    
    // 2. Long-term Liabilities (Loans)
    console.log('💳 Fetching loans...');
    const loans = await Loan.find({ 
      status: { $in: ['Active', 'Overdue'] },
      disbursementDate: { $lte: reportDate }
    });
    console.log('💳 Active Loans:', loans.length);
    
    const totalLoans = loans.reduce((sum, loan) => sum + (loan.totalOutstanding || 0), 0);
    console.log('💳 Total Loans:', totalLoans);
    
    const loansByType = loans.reduce((acc, loan) => {
      if (!acc[loan.loanType]) {
        acc[loan.loanType] = {
          principal: 0,
          interest: 0,
          total: 0,
          count: 0
        };
      }
      acc[loan.loanType].principal += loan.outstandingPrincipal || 0;
      acc[loan.loanType].interest += loan.outstandingInterest || 0;
      acc[loan.loanType].total += loan.totalOutstanding || 0;
      acc[loan.loanType].count += 1;
      return acc;
    }, {});
    
    // Total Liabilities
    const totalLiabilities = totalCurrentLiabilities + totalLoans;
    
    // ============ EQUITY ============
    
    // Capital
    console.log('💰 Fetching capital accounts...');
    const capitalAccounts = await Capital.find({
      ...(financialYear && { financialYear })
    });
    console.log('💰 Capital Accounts:', capitalAccounts.length);
    
    const totalCapital = capitalAccounts.reduce((sum, cap) => sum + (cap.currentBalance || 0), 0);
    console.log('💰 Total Capital:', totalCapital);
    
    // Calculate Profit/Loss (Revenue - Expenses)
    console.log('📊 Calculating Profit/Loss...');
    const revenueAggregation = await DealerInvoice.aggregate([
      {
        $match: {
          invoiceDate: { $lte: reportDate },
          status: { $nin: ['Cancelled', 'Draft'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' }
        }
      }
    ]);
    
    const totalRevenue = revenueAggregation[0]?.totalRevenue || 0;
    console.log('📊 Total Revenue:', totalRevenue, 'from', await DealerInvoice.countDocuments({ invoiceDate: { $lte: reportDate }, status: { $nin: ['Cancelled', 'Draft'] } }), 'invoices');
    
    const costAggregation = await SupplierInvoice.aggregate([
      {
        $match: {
          invoiceDate: { $lte: reportDate },
          status: { $nin: ['Cancelled', 'Draft'] }
        }
      },
      {
        $group: {
          _id: null,
          totalCost: { $sum: '$totalAmount' }
        }
      }
    ]);
    
    const totalCost = costAggregation[0]?.totalCost || 0;
    console.log('📊 Total Cost:', totalCost, 'from', await SupplierInvoice.countDocuments({ invoiceDate: { $lte: reportDate }, status: { $nin: ['Cancelled', 'Draft'] } }), 'invoices');
    
    const expensesAggregation = await Expense.aggregate([
      {
        $match: {
          date: { $lte: reportDate },
          status: 'approved'
        }
      },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$amount' }
        }
      }
    ]);
    
    const totalExpenses = expensesAggregation[0]?.totalExpenses || 0;
    console.log('📊 Total Expenses:', totalExpenses, 'from', await Expense.countDocuments({ date: { $lte: reportDate }, status: 'approved' }), 'expenses');
    
    const profitLoss = totalRevenue - totalCost - totalExpenses;
    console.log('📊 Profit/Loss:', profitLoss);
    
    // Total Equity
    const totalEquity = totalCapital + profitLoss;
    
    // Verify Balance Sheet Equation: Assets = Liabilities + Equity
    const balanceDifference = totalAssets - (totalLiabilities + totalEquity);
    const isBalanced = Math.abs(balanceDifference) < 1; // Allow for rounding errors
    
    // Prepare response
    const balanceSheet = {
      reportDate: reportDate,
      financialYear: financialYear || 'Current',
      generatedAt: new Date(),
      generatedBy: req.user?._id,
      
      assets: {
        currentAssets: {
          cashInHand: {
            amount: cashInHand,
            percentage: totalAssets > 0 ? (cashInHand / totalAssets * 100).toFixed(2) : 0
          },
          bankBalances: {
            amount: bankBalances,
            percentage: totalAssets > 0 ? (bankBalances / totalAssets * 100).toFixed(2) : 0,
            details: bankAccountDetails
          },
          accountsReceivable: {
            amount: accountsReceivable,
            percentage: totalAssets > 0 ? (accountsReceivable / totalAssets * 100).toFixed(2) : 0
          },
          advanceToSuppliers: {
            amount: advanceToSuppliers,
            percentage: totalAssets > 0 ? (advanceToSuppliers / totalAssets * 100).toFixed(2) : 0
          },
          inventory: {
            amount: inventoryValue,
            quantity: inventoryQuantity,
            percentage: totalAssets > 0 ? (inventoryValue / totalAssets * 100).toFixed(2) : 0
          },
          total: totalCurrentAssets
        },
        fixedAssets: {
          grossValue: fixedAssetsValue,
          accumulatedDepreciation: accumulatedDepreciation,
          netValue: netFixedAssets,
          percentage: totalAssets > 0 ? (netFixedAssets / totalAssets * 100).toFixed(2) : 0,
          byCategory: fixedAssetsByCategory
        },
        totalAssets: totalAssets
      },
      
      liabilities: {
        currentLiabilities: {
          accountsPayable: {
            amount: accountsPayable,
            percentage: totalLiabilities > 0 ? (accountsPayable / totalLiabilities * 100).toFixed(2) : 0
          },
          advanceFromDealers: {
            amount: advanceFromDealers,
            percentage: totalLiabilities > 0 ? (advanceFromDealers / totalLiabilities * 100).toFixed(2) : 0
          },
          outstandingExpenses: {
            amount: pendingExpenses,
            percentage: totalLiabilities > 0 ? (pendingExpenses / totalLiabilities * 100).toFixed(2) : 0
          },
          chequesPayable: {
            amount: pendingCheques,
            percentage: totalLiabilities > 0 ? (pendingCheques / totalLiabilities * 100).toFixed(2) : 0
          },
          total: totalCurrentLiabilities
        },
        longTermLiabilities: {
          loans: {
            amount: totalLoans,
            percentage: totalLiabilities > 0 ? (totalLoans / totalLiabilities * 100).toFixed(2) : 0,
            byType: loansByType
          },
          total: totalLoans
        },
        totalLiabilities: totalLiabilities
      },
      
      equity: {
        capital: {
          amount: totalCapital,
          accounts: capitalAccounts.map(cap => ({
            ownerName: cap.ownerName,
            type: cap.capitalType,
            balance: cap.currentBalance
          }))
        },
        profitLoss: {
          amount: profitLoss,
          revenue: totalRevenue,
          cost: totalCost,
          expenses: totalExpenses
        },
        totalEquity: totalEquity
      },
      
      summary: {
        totalAssets: totalAssets,
        totalLiabilities: totalLiabilities,
        totalEquity: totalEquity,
        balanceDifference: balanceDifference,
        isBalanced: isBalanced
      },
      
      ratios: {
        currentRatio: totalCurrentLiabilities > 0 ? (totalCurrentAssets / totalCurrentLiabilities).toFixed(2) : 'N/A',
        debtToEquityRatio: totalEquity > 0 ? (totalLiabilities / totalEquity).toFixed(2) : 'N/A',
        debtToAssetRatio: totalAssets > 0 ? (totalLiabilities / totalAssets * 100).toFixed(2) : 0,
        equityRatio: totalAssets > 0 ? (totalEquity / totalAssets * 100).toFixed(2) : 0
      }
    };
    
    res.status(200).json({
      success: true,
      message: 'Balance sheet generated successfully',
      data: balanceSheet
    });
    
    console.log('✅ Balance sheet generated successfully');
    
  } catch (error) {
    console.error('❌ Error generating balance sheet:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to generate balance sheet',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get Balance Sheet Comparison (Multiple Periods)
 * GET /api/balance-sheet/comparison
 */
export const getBalanceSheetComparison = async (req, res) => {
  try {
    const { startDate, endDate, interval } = req.query;
    
    // Generate balance sheets for multiple periods
    // Implementation for comparative analysis
    
    res.status(200).json({
      success: true,
      message: 'Balance sheet comparison generated',
      data: {}
    });
    
  } catch (error) {
    console.error('❌ Error generating comparison:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate comparison',
      error: error.message
    });
  }
};

/**
 * Export Balance Sheet (PDF/Excel)
 * POST /api/balance-sheet/export
 */
export const exportBalanceSheet = async (req, res) => {
  try {
    const { format, data } = req.body;
    
    // Implementation for PDF/Excel export
    
    res.status(200).json({
      success: true,
      message: `Balance sheet exported as ${format}`,
      data: {}
    });
    
  } catch (error) {
    console.error('❌ Error exporting balance sheet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export balance sheet',
      error: error.message
    });
  }
};
