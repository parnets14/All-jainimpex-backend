import mongoose from 'mongoose';
import DealerPerformance from '../models/DealerPerformance.js';
import Dealer from '../models/Dealer.js';
import DealerInvoice from '../models/DealerInvoice.js';
import CreditNote from '../models/CreditNote.js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '..', '.env') });

async function testDealerPerformance() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    console.log('Starting dealer performance generation...');

    // Clear existing performance records
    await DealerPerformance.deleteMany({});
    console.log('Cleared existing performance records');

    // Get all dealers
    const dealers = await Dealer.find({ isActive: true });
    console.log(`Found ${dealers.length} active dealers`);

    const performanceRecords = [];

    for (const dealer of dealers) {
      console.log(`Processing dealer: ${dealer.name} (${dealer.code})`);

      // Get invoices for the dealer
      const invoices = await DealerInvoice.find({ dealer: dealer._id });
      const creditNotes = await CreditNote.find({ dealer: dealer._id });

      console.log(`  - Found ${invoices.length} invoices and ${creditNotes.length} credit notes`);

        // Calculate performance metrics
        const totalSales = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const totalCreditAmount = creditNotes.reduce((sum, cn) => sum + (cn.creditAmount || 0), 0);
        // Sales = Total Invoice Amount (credit notes are payments, not returns)
        const netSales = totalSales;
      
      const totalQuantity = invoices.reduce((sum, inv) => {
        return sum + (inv.items ? inv.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) : 0);
      }, 0);

      console.log(`  - Net Sales: ${netSales}, Quantity: ${totalQuantity}`);

      // Only create performance record if dealer has sales
      if (netSales > 0) {
        // Calculate scheme points (assuming 10% of sales as scheme)
        const schemeEarned = Math.round(totalSales * 0.1);

        // Determine discount level based on sales
        let discountLevel = "Level 1";
        if (netSales >= 2000000) discountLevel = "Level 2";
        if (netSales >= 3000000) discountLevel = "Level 3";
        if (netSales >= 4000000) discountLevel = "Level 4";
        if (netSales >= 5000000) discountLevel = "Level 5";

        // Calculate performance percentage (simplified calculation)
        const performance = Math.min(100, Math.round((netSales / 1000000) * 20));

        // Create product breakdown from invoices
        const products = [];
        const productMap = new Map();

        invoices.forEach(invoice => {
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

        // Calculate additional financial metrics
        // Paid amount should come from credit notes (payments), not invoice status
        const paid = creditNotes.reduce((sum, cn) => sum + (cn.creditAmount || 0), 0);
        
        const outstanding = netSales - paid;
        
        // Calculate growth percentage (comparing with previous period)
        const previousPeriodStart = new Date();
        previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);
        const previousInvoices = await DealerInvoice.find({
          dealer: dealer._id,
          invoiceDate: { $gte: previousPeriodStart, $lt: new Date() }
        });
        const previousSales = previousInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const growthPercentage = previousSales > 0 ? ((netSales - previousSales) / previousSales) * 100 : 0;
        
        // Calculate target achieved percentage
        const salesTarget = dealer.salesTarget || 1000000; // Default target
        const targetAchieved = Math.min(100, (netSales / salesTarget) * 100);
        
        // Calculate returns percentage (based on actual returns, not payments)
        // For now, we'll calculate this based on credit notes that are actual returns
        // This is a simplified calculation - in reality, you'd need to distinguish between payments and returns
        const returnsPercentage = netSales > 0 ? Math.min(100, (totalCreditAmount / netSales) * 100) : 0;
        
        // Calculate total points earned
        const totalPoints = invoices.reduce((sum, inv) => {
          return sum + (inv.items ? inv.items.reduce((itemSum, item) => itemSum + (item.pointsEarned || 0), 0) : 0);
        }, 0);
        
        // Calculate average discount availed
        const totalDiscountAmount = invoices.reduce((sum, inv) => sum + (inv.totalDiscount || 0), 0);
        const averageDiscountAvailed = netSales > 0 ? Math.min(100, (totalDiscountAmount / netSales) * 100) : 0;

        performanceRecords.push({
          dealer: dealer._id,
          dealerName: dealer.name,
          dealerCode: dealer.code,
          dealerType: dealer.dealerType,
          category: dealer.category || "Sanitary & Plumbing",
          quantity: totalQuantity,
          sales: netSales,
          schemeEarned,
          discountLevel,
          performance,
          rank: 0, // Will be calculated after sorting
          performanceDate: new Date(),
          period: "Monthly",
          products,
          totalProfit,
          averageProfitMargin,
          customerSatisfaction: Math.random() * 2 + 3, // Random between 3-5
          returnRate: Math.random() * 5, // Random between 0-5%
          // New comprehensive metrics
          paid,
          outstanding,
          growthPercentage: Math.round(growthPercentage * 100) / 100,
          targetAchieved: Math.round(targetAchieved * 100) / 100,
          returnsPercentage: Math.round(returnsPercentage * 100) / 100,
          totalPoints,
          averageDiscountAvailed: Math.round(averageDiscountAvailed * 100) / 100,
          createdBy: new mongoose.Types.ObjectId() // Dummy user ID
        });

        console.log(`  - Created performance record for ${dealer.name}`);
      } else {
        console.log(`  - Skipping ${dealer.name} (no sales)`);
      }
    }

    console.log(`Total performance records to create: ${performanceRecords.length}`);

    // Sort by sales and assign ranks
    performanceRecords.sort((a, b) => b.sales - a.sales);
    performanceRecords.forEach((record, index) => {
      record.rank = index + 1;
    });

    // Save performance records
    const savedRecords = await DealerPerformance.insertMany(performanceRecords);

    console.log(`Successfully created ${savedRecords.length} dealer performance records`);

    // Display the results
    console.log('\n=== DEALER PERFORMANCE RESULTS ===');
    savedRecords.forEach(record => {
      console.log(`#${record.rank} ${record.dealerName} (${record.dealerCode})`);
      console.log(`  Type: ${record.dealerType}`);
      console.log(`  Sales: ₹${record.sales.toLocaleString()}`);
      console.log(`  Quantity: ${record.quantity}`);
      console.log(`  Paid: ₹${record.paid.toLocaleString()}`);
      console.log(`  Outstanding: ₹${record.outstanding.toLocaleString()}`);
      console.log(`  Target Achieved: ${record.targetAchieved}%`);
      console.log(`  Growth: ${record.growthPercentage}%`);
      console.log(`  Returns: ${record.returnsPercentage}%`);
      console.log(`  Points: ${record.totalPoints}`);
      console.log(`  Avg Discount: ${record.averageDiscountAvailed}%`);
      console.log('---');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testDealerPerformance();
