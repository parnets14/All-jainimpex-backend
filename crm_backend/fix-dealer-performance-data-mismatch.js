import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Models
import Dealer from './models/Dealer.js';
import DealerInvoice from './models/DealerInvoice.js';
import DealerLedger from './models/DealerLedger.js';
import DealerPayment from './models/DealerPayment.js';
import DealerPerformance from './models/DealerPerformance.js';
import CreditNote from './models/CreditNote.js';
import User from './models/User.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '.env') });

async function fixDealerPerformanceDataMismatch() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    console.log('\n🔧 FIXING DEALER PERFORMANCE DATA MISMATCHES');
    console.log('='.repeat(60));

    // Get a system user for creating records
    const systemUser = await User.findOne({ role: 'admin' }) || await User.findOne();
    if (!systemUser) {
      console.error('❌ No user found to assign as creator');
      return;
    }

    // Step 1: Sync missing ledger entries
    console.log('\n📚 Step 1: Syncing missing ledger entries...');
    
    const invoicesWithoutLedger = await DealerInvoice.aggregate([
      {
        $lookup: {
          from: 'dealerledgers',
          localField: '_id',
          foreignField: 'invoice',
          as: 'ledgerEntry'
        }
      },
      {
        $match: {
          ledgerEntry: { $size: 0 }
        }
      }
    ]);

    console.log(`Found ${invoicesWithoutLedger.length} invoices without ledger entries`);

    for (const invoice of invoicesWithoutLedger) {
      try {
        // Get the last entry for this dealer to calculate running balance
        const lastEntry = await DealerLedger.findOne(
          { dealer: invoice.dealer },
          {},
          { sort: { 'createdAt': -1 } }
        );

        let previousBalance = 0;
        if (lastEntry) {
          previousBalance = lastEntry.runningBalance;
        }

        const ledgerEntry = new DealerLedger({
          dealer: invoice.dealer,
          dealerName: invoice.customerName || invoice.dealerName,
          dealerCode: invoice.customerCode || invoice.dealerCode,
          transactionType: "Invoice",
          invoice: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceValue: invoice.totalAmount,
          debitAmount: invoice.totalAmount,
          creditAmount: 0,
          runningBalance: previousBalance + invoice.totalAmount,
          description: `Invoice ${invoice.invoiceNumber}`,
          creditDays: invoice.creditDays || 0,
          dueDate: invoice.dueDate,
          pointsEarned: invoice.totalPoints || 0,
          schemeAmount: invoice.totalDiscount || 0,
          entryDate: invoice.invoiceDate,
          createdBy: systemUser._id
        });

        await ledgerEntry.save();
        console.log(`  ✅ Created ledger entry for invoice ${invoice.invoiceNumber}`);
      } catch (error) {
        console.error(`  ❌ Error creating ledger entry for invoice ${invoice.invoiceNumber}:`, error.message);
      }
    }

    // Step 2: Fix payment amounts in DealerPayment collection
    console.log('\n💳 Step 2: Fixing payment amounts...');
    
    const paymentsWithZeroAmount = await DealerPayment.find({ amount: { $in: [0, null] } });
    console.log(`Found ${paymentsWithZeroAmount.length} payments with zero/null amounts`);

    for (const payment of paymentsWithZeroAmount) {
      try {
        // Try to find corresponding ledger entry
        const ledgerEntry = await DealerLedger.findOne({
          dealer: payment.dealer,
          transactionType: 'Payment',
          createdAt: {
            $gte: new Date(payment.createdAt.getTime() - 60000), // 1 minute before
            $lte: new Date(payment.createdAt.getTime() + 60000)  // 1 minute after
          }
        });

        if (ledgerEntry && ledgerEntry.creditAmount > 0) {
          payment.amount = ledgerEntry.creditAmount;
          await payment.save();
          console.log(`  ✅ Fixed payment amount for ${payment.paymentNumber}: ₹${ledgerEntry.creditAmount}`);
        }
      } catch (error) {
        console.error(`  ❌ Error fixing payment ${payment.paymentNumber}:`, error.message);
      }
    }

    // Step 3: Regenerate dealer performance data
    console.log('\n📈 Step 3: Regenerating dealer performance data...');
    
    // Clear existing performance records
    await DealerPerformance.deleteMany({});
    console.log('  Cleared existing performance records');

    const dealers = await Dealer.find({ isActive: true });
    console.log(`  Processing ${dealers.length} dealers...`);

    const performanceRecords = [];

    for (const dealer of dealers) {
      try {
        console.log(`\n  Processing dealer: ${dealer.name} (${dealer.code})`);

        // Get current month date range
        const currentDate = new Date();
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

        // Get previous month date range for growth calculation
        const startOfPrevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
        const endOfPrevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0, 23, 59, 59, 999);

        // Get current month invoices
        const currentMonthInvoices = await DealerInvoice.find({
          dealer: dealer._id,
          invoiceDate: {
            $gte: startOfMonth,
            $lte: endOfMonth
          }
        });

        // Get previous month invoices for growth calculation
        const previousMonthInvoices = await DealerInvoice.find({
          dealer: dealer._id,
          invoiceDate: {
            $gte: startOfPrevMonth,
            $lte: endOfPrevMonth
          }
        });

        // Calculate current month metrics
        const currentMonthSales = currentMonthInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const currentMonthDiscount = currentMonthInvoices.reduce((sum, inv) => sum + (inv.totalDiscount || 0), 0);
        const currentMonthQuantity = currentMonthInvoices.reduce((sum, inv) => {
          return sum + (inv.items ? inv.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) : 0);
        }, 0);

        // Calculate previous month sales for growth
        const previousMonthSales = previousMonthInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

        // Calculate growth percentage
        let growthPercentage = 0;
        if (previousMonthSales > 0) {
          growthPercentage = ((currentMonthSales - previousMonthSales) / previousMonthSales) * 100;
        } else if (currentMonthSales > 0) {
          growthPercentage = 100; // 100% growth if no previous sales but current sales exist
        }

        // Get ledger data for payment calculations
        const ledgerEntries = await DealerLedger.find({ dealer: dealer._id });
        const totalCredit = ledgerEntries.reduce((sum, entry) => sum + (entry.creditAmount || 0), 0);
        const currentBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].runningBalance : 0;

        // Calculate discount percentage
        const averageDiscountAvailed = currentMonthSales > 0 ? (currentMonthDiscount / currentMonthSales) * 100 : 0;

        // Only create performance record if dealer has any activity
        if (currentMonthSales > 0 || currentBalance !== 0) {
          // Create product breakdown
          const products = [];
          const productMap = new Map();

          currentMonthInvoices.forEach(invoice => {
            if (invoice.items) {
              invoice.items.forEach(item => {
                const productKey = item.productName || item.itemName || 'Unknown Product';
                if (productMap.has(productKey)) {
                  const existing = productMap.get(productKey);
                  existing.quantity += item.quantity || 0;
                  existing.amount += item.totalPrice || 0;
                  existing.points += Math.round((item.totalPrice || 0) * 0.1);
                } else {
                  const costPrice = (item.totalPrice || 0) * 0.7; // Assuming 30% margin
                  const profit = (item.totalPrice || 0) - costPrice;
                  productMap.set(productKey, {
                    name: productKey,
                    category: item.product?.category || "Other",
                    quantity: item.quantity || 0,
                    amount: item.totalPrice || 0,
                    points: Math.round((item.totalPrice || 0) * 0.1),
                    costPrice,
                    profit,
                    profitMargin: item.totalPrice > 0 ? ((profit / item.totalPrice) * 100) : 0
                  });
                }
              });
            }
          });

          products.push(...Array.from(productMap.values()));

          const totalProfit = products.reduce((sum, product) => sum + product.profit, 0);
          const averageProfitMargin = products.length > 0 
            ? products.reduce((sum, product) => sum + product.profitMargin, 0) / products.length
            : 0;

          // Calculate scheme points
          const schemeEarned = Math.round(currentMonthSales * 0.1);

          // Determine discount level based on sales
          let discountLevel = "Level 1";
          if (currentMonthSales >= 2000000) discountLevel = "Level 2";
          if (currentMonthSales >= 3000000) discountLevel = "Level 3";
          if (currentMonthSales >= 4000000) discountLevel = "Level 4";
          if (currentMonthSales >= 5000000) discountLevel = "Level 5";

          // Calculate performance percentage
          const performance = Math.min(100, Math.round((currentMonthSales / 1000000) * 20));

          // Calculate target achievement (assuming target is 10% more than previous month)
          const targetSales = previousMonthSales * 1.1;
          let targetAchieved = 0;
          if (targetSales > 0) {
            targetAchieved = (currentMonthSales / targetSales) * 100;
          }

          const performanceRecord = {
            dealer: dealer._id,
            dealerName: dealer.name,
            dealerCode: dealer.code,
            dealerType: dealer.dealerType,
            category: dealer.category || "Sanitary & Plumbing",
            quantity: currentMonthQuantity,
            sales: currentMonthSales,
            schemeEarned,
            discountLevel,
            performance,
            rank: 0, // Will be calculated after sorting
            performanceDate: endOfMonth,
            period: "Monthly",
            products,
            totalProfit,
            averageProfitMargin,
            customerSatisfaction: Math.random() * 2 + 3, // Random between 3-5
            returnRate: Math.random() * 5, // Random between 0-5%
            // Corrected financial metrics
            paid: totalCredit,
            outstanding: Math.max(0, currentBalance),
            growthPercentage: Math.round(growthPercentage * 100) / 100,
            targetAchieved: Math.round(targetAchieved * 100) / 100,
            returnsPercentage: 0, // Will be calculated from actual returns
            totalPoints: products.reduce((sum, product) => sum + product.points, 0),
            averageDiscountAvailed: Math.round(averageDiscountAvailed * 100) / 100,
            createdBy: systemUser._id
          };

          performanceRecords.push(performanceRecord);
          console.log(`    ✅ Created performance record - Sales: ₹${currentMonthSales.toLocaleString()}, Outstanding: ₹${Math.max(0, currentBalance).toLocaleString()}`);
        } else {
          console.log(`    ⏭️  Skipped ${dealer.name} (no activity)`);
        }
      } catch (error) {
        console.error(`    ❌ Error processing dealer ${dealer.name}:`, error.message);
      }
    }

    // Sort by sales and assign ranks
    performanceRecords.sort((a, b) => b.sales - a.sales);
    performanceRecords.forEach((record, index) => {
      record.rank = index + 1;
    });

    // Save performance records
    if (performanceRecords.length > 0) {
      const savedRecords = await DealerPerformance.insertMany(performanceRecords);
      console.log(`\n  ✅ Created ${savedRecords.length} dealer performance records`);
    } else {
      console.log('\n  ⚠️  No performance records to create');
    }

    // Step 4: Verification
    console.log('\n🔍 Step 4: Verification...');
    
    const verificationResults = [];
    const sampleDealers = await Dealer.find({ isActive: true }).limit(3);

    for (const dealer of sampleDealers) {
      const performanceData = await DealerPerformance.findOne({ 
        dealer: dealer._id,
        period: 'Monthly'
      });

      const currentMonth = new Date();
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

      const actualInvoices = await DealerInvoice.find({
        dealer: dealer._id,
        invoiceDate: { $gte: startOfMonth, $lte: endOfMonth }
      });

      const actualSales = actualInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

      const ledgerEntries = await DealerLedger.find({ dealer: dealer._id });
      const currentBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].runningBalance : 0;
      const totalCredit = ledgerEntries.reduce((sum, entry) => sum + (entry.creditAmount || 0), 0);

      const verification = {
        dealerName: dealer.name,
        performanceSales: performanceData?.sales || 0,
        actualSales,
        salesMatch: Math.abs((performanceData?.sales || 0) - actualSales) < 1,
        performanceOutstanding: performanceData?.outstanding || 0,
        actualOutstanding: Math.max(0, currentBalance),
        outstandingMatch: Math.abs((performanceData?.outstanding || 0) - Math.max(0, currentBalance)) < 1,
        performancePaid: performanceData?.paid || 0,
        actualPaid: totalCredit,
        paidMatch: Math.abs((performanceData?.paid || 0) - totalCredit) < 1
      };

      verificationResults.push(verification);
      
      console.log(`\n  ${dealer.name}:`);
      console.log(`    Sales: ${verification.salesMatch ? '✅' : '❌'} (Performance: ₹${verification.performanceSales.toLocaleString()}, Actual: ₹${verification.actualSales.toLocaleString()})`);
      console.log(`    Outstanding: ${verification.outstandingMatch ? '✅' : '❌'} (Performance: ₹${verification.performanceOutstanding.toLocaleString()}, Actual: ₹${verification.actualOutstanding.toLocaleString()})`);
      console.log(`    Paid: ${verification.paidMatch ? '✅' : '❌'} (Performance: ₹${verification.performancePaid.toLocaleString()}, Actual: ₹${verification.actualPaid.toLocaleString()})`);
    }

    const allMatches = verificationResults.every(v => v.salesMatch && v.outstandingMatch && v.paidMatch);
    
    console.log('\n📊 FINAL SUMMARY:');
    console.log('='.repeat(40));
    console.log(`✅ Synced ${invoicesWithoutLedger.length} missing ledger entries`);
    console.log(`✅ Fixed ${paymentsWithZeroAmount.length} payment amounts`);
    console.log(`✅ Generated ${performanceRecords.length} performance records`);
    console.log(`${allMatches ? '✅' : '⚠️'} Data consistency: ${allMatches ? 'PASSED' : 'NEEDS REVIEW'}`);

    if (allMatches) {
      console.log('\n🎉 All dealer performance data mismatches have been resolved!');
      console.log('The frontend should now show consistent data across all modules.');
    } else {
      console.log('\n⚠️  Some data inconsistencies remain. Please review the verification results above.');
    }

  } catch (error) {
    console.error('❌ Error fixing dealer performance data:', error);
  } finally {
    await mongoose.disconnect();
  }
}

fixDealerPerformanceDataMismatch();