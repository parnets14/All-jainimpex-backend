import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricingHistory from './models/DealerPricingHistory.js';
import DealerPricing from './models/DealerPricing.js';
import Product from './models/Product.js';
import User from './models/User.js';

// Load environment variables
dotenv.config();

const createSamplePriceHistory = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find a test user
    const testUser = await User.findOne();
    if (!testUser) {
      console.log('❌ No users found');
      return;
    }

    console.log(`👤 Using user: ${testUser.name}`);

    // Get some pricing records with products
    const pricingRecords = await DealerPricing.find({ isActive: true })
      .populate('product')
      .limit(5);

    if (pricingRecords.length === 0) {
      console.log('❌ No pricing records found');
      return;
    }

    console.log(`📦 Found ${pricingRecords.length} pricing records`);

    // Create sample history records for each product
    for (const pricing of pricingRecords) {
      if (!pricing.product) continue;

      console.log(`\n📦 Creating history for: ${pricing.product.itemName}`);
      
      const currentPrice = pricing.sellingPrice;
      const historyRecords = [
        {
          product: pricing.product._id,
          oldPrice: currentPrice - 20,
          newPrice: currentPrice - 10,
          changeType: 'manual',
          changeMethod: 'increase_amount',
          changeValue: 10,
          reason: 'Market price adjustment',
          changedBy: testUser._id,
          changeDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
        },
        {
          product: pricing.product._id,
          oldPrice: currentPrice - 10,
          newPrice: currentPrice - 5,
          changeType: 'scheduled',
          changeMethod: 'increase_percentage',
          changeValue: 5,
          reason: 'Quarterly price review',
          changedBy: testUser._id,
          changeDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) // 15 days ago
        },
        {
          product: pricing.product._id,
          oldPrice: currentPrice - 5,
          newPrice: currentPrice,
          changeType: 'bulk_update',
          changeMethod: 'increase_amount',
          changeValue: 5,
          reason: 'Supplier cost increase',
          changedBy: testUser._id,
          changeDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
        }
      ];

      // Create history records
      for (const historyData of historyRecords) {
        try {
          const historyRecord = await DealerPricingHistory.logPriceChange(historyData);
          console.log(`  ✅ Created: ₹${historyData.oldPrice} → ₹${historyData.newPrice} (${historyData.changeType})`);
        } catch (error) {
          console.error(`  ❌ Error creating history:`, error.message);
        }
      }
    }

    // Test the price history retrieval
    console.log('\n🧪 Testing price history retrieval...');
    
    const firstProduct = pricingRecords[0].product;
    if (firstProduct) {
      console.log(`📋 Getting history for: ${firstProduct.itemName}`);
      
      const history = await DealerPricingHistory.getProductPriceHistory(firstProduct._id, 10);
      console.log(`📊 Found ${history.length} history records:`);
      
      history.forEach((record, index) => {
        console.log(`  ${index + 1}. ₹${record.oldPrice} → ₹${record.newPrice}`);
        console.log(`     ${record.changeType} (${record.changeMethod})`);
        console.log(`     ${record.changeDate.toLocaleDateString()}`);
        console.log(`     ${record.reason}`);
        console.log('');
      });

      if (history.length > 0) {
        console.log('✅ Price history is working correctly!');
        console.log('💡 The frontend should now be able to display price history.');
      }
    }

    // Show total history records created
    const totalHistory = await DealerPricingHistory.countDocuments();
    console.log(`\n📊 Total price history records in database: ${totalHistory}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the script
createSamplePriceHistory();