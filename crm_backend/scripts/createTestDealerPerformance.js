import mongoose from 'mongoose';
import DealerPerformance from '../models/DealerPerformance.js';
import Dealer from '../models/Dealer.js';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function createTestDealerPerformance() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    // Find a user to use as createdBy
    let user = await User.findOne({ role: 'super_admin' });
    if (!user) {
      user = await User.findOne();
    }
    
    if (!user) {
      console.log('No users found. Creating a dummy user ID...');
      user = { _id: new mongoose.Types.ObjectId() };
    }

    // Get all dealers
    const dealers = await Dealer.find({ isActive: true });
    console.log(`Found ${dealers.length} dealers`);

    if (dealers.length === 0) {
      console.log('No dealers found. Please create dealers first.');
      return;
    }

    // Clear existing performance data
    await DealerPerformance.deleteMany({});
    console.log('Cleared existing performance data');

    const performanceRecords = [];

    // Generate performance data for each dealer
    dealers.forEach((dealer, index) => {
      const baseSales = Math.random() * 2000000 + 500000; // 500k to 2.5M
      const quantity = Math.floor(Math.random() * 200) + 50; // 50 to 250
      const schemeEarned = Math.round(baseSales * 0.1); // 10% of sales
      
      // Determine discount level based on sales
      let discountLevel = "Level 1";
      if (baseSales >= 2000000) discountLevel = "Level 2";
      if (baseSales >= 3000000) discountLevel = "Level 3";
      if (baseSales >= 4000000) discountLevel = "Level 4";
      if (baseSales >= 5000000) discountLevel = "Level 5";

      // Calculate performance percentage
      const performance = Math.min(100, Math.round((baseSales / 1000000) * 20));

      // Generate products
      const products = [
        {
          name: "Ceramic Wash Basin",
          category: "Sanitary",
          quantity: Math.floor(quantity * 0.3),
          amount: Math.round(baseSales * 0.3),
          points: Math.round(baseSales * 0.03),
          costPrice: Math.round(baseSales * 0.21),
          profit: Math.round(baseSales * 0.09),
          profitMargin: 30
        },
        {
          name: "PVC Pipes",
          category: "Plumbing",
          quantity: Math.floor(quantity * 0.4),
          amount: Math.round(baseSales * 0.4),
          points: Math.round(baseSales * 0.04),
          costPrice: Math.round(baseSales * 0.28),
          profit: Math.round(baseSales * 0.12),
          profitMargin: 30
        },
        {
          name: "Water Taps",
          category: "Sanitary",
          quantity: Math.floor(quantity * 0.2),
          amount: Math.round(baseSales * 0.2),
          points: Math.round(baseSales * 0.02),
          costPrice: Math.round(baseSales * 0.14),
          profit: Math.round(baseSales * 0.06),
          profitMargin: 30
        },
        {
          name: "Shower Set",
          category: "Plumbing",
          quantity: Math.floor(quantity * 0.1),
          amount: Math.round(baseSales * 0.1),
          points: Math.round(baseSales * 0.01),
          costPrice: Math.round(baseSales * 0.07),
          profit: Math.round(baseSales * 0.03),
          profitMargin: 30
        }
      ];

      const totalProfit = products.reduce((sum, product) => sum + product.profit, 0);

      performanceRecords.push({
        dealer: dealer._id,
        dealerName: dealer.name,
        dealerCode: dealer.code,
        dealerType: dealer.dealerType,
        category: dealer.category || "Sanitary & Plumbing",
        quantity,
        sales: baseSales,
        schemeEarned,
        discountLevel,
        performance,
        rank: index + 1, // Will be recalculated after sorting
        performanceDate: new Date(),
        period: "Monthly",
        products,
        totalProfit,
        averageProfitMargin: 30,
        customerSatisfaction: Math.random() * 2 + 3, // 3-5
        returnRate: Math.random() * 5, // 0-5%
        createdBy: user._id
      });
    });

    // Sort by sales and reassign ranks
    performanceRecords.sort((a, b) => b.sales - a.sales);
    performanceRecords.forEach((record, index) => {
      record.rank = index + 1;
    });

    // Insert performance records
    const savedRecords = await DealerPerformance.insertMany(performanceRecords);
    console.log(`Created ${savedRecords.length} dealer performance records`);

    // Display summary
    const totalSales = savedRecords.reduce((sum, record) => sum + record.sales, 0);
    const totalQuantity = savedRecords.reduce((sum, record) => sum + record.quantity, 0);
    const avgPerformance = savedRecords.reduce((sum, record) => sum + record.performance, 0) / savedRecords.length;

    console.log('\n=== Performance Summary ===');
    console.log(`Total Sales: ₹${totalSales.toLocaleString('en-IN')}`);
    console.log(`Total Quantity: ${totalQuantity}`);
    console.log(`Average Performance: ${avgPerformance.toFixed(1)}%`);
    console.log(`Records Created: ${savedRecords.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Error creating test dealer performance:', error);
    process.exit(1);
  }
}

createTestDealerPerformance();




