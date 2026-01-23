import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricingHistory from './models/DealerPricingHistory.js';
import DealerPricing from './models/DealerPricing.js';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

const testPriceHistoryAPI = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Check total history records
    const totalHistory = await DealerPricingHistory.countDocuments();
    console.log(`📊 Total price history records: ${totalHistory}`);

    if (totalHistory === 0) {
      console.log('❌ No price history records found!');
      console.log('🔧 Creating some test records...');
      
      // Get a product to create history for
      const product = await Product.findOne();
      if (product) {
        console.log(`📦 Creating history for: ${product.itemName}`);
        
        // Create test history records
        const testRecords = [
          {
            product: product._id,
            oldPrice: 100,
            newPrice: 110,
            changeType: 'manual',
            changeMethod: 'increase_amount',
            changeValue: 10,
            reason: 'Test price increase',
            changedBy: new mongoose.Types.ObjectId(),
            changeDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
          },
          {
            product: product._id,
            oldPrice: 110,
            newPrice: 115,
            changeType: 'scheduled',
            changeMethod: 'increase_percentage',
            changeValue: 4.5,
            reason: 'Scheduled price adjustment',
            changedBy: new mongoose.Types.ObjectId(),
            changeDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
          },
          {
            product: product._id,
            oldPrice: 115,
            newPrice: 120,
            changeType: 'bulk_update',
            changeMethod: 'increase_amount',
            changeValue: 5,
            reason: 'Bulk price update',
            changedBy: new mongoose.Types.ObjectId(),
            changeDate: new Date() // Today
          }
        ];

        for (const record of testRecords) {
          await DealerPricingHistory.create(record);
          console.log(`  ✅ Created: ₹${record.oldPrice} → ₹${record.newPrice} (${record.changeType})`);
        }
      }
    }

    // Test the API method directly
    console.log('\n🧪 Testing API method directly...');
    
    // Get a product that has history
    const productWithHistory = await DealerPricingHistory.findOne().populate('product');
    if (productWithHistory) {
      const productId = productWithHistory.product._id;
      console.log(`📦 Testing with product: ${productWithHistory.product.itemName} (${productId})`);
      
      // Test the static method
      const history = await DealerPricingHistory.getProductPriceHistory(productId, 10);
      console.log(`📊 Found ${history.length} history records:`);
      
      history.forEach((record, index) => {
        console.log(`  ${index + 1}. ₹${record.oldPrice} → ₹${record.newPrice}`);
        console.log(`     Type: ${record.changeType}, Method: ${record.changeMethod}`);
        console.log(`     Date: ${record.changeDate.toISOString()}`);
        console.log(`     Reason: ${record.reason}`);
        console.log('');
      });

      // Test the API response format
      const apiResponse = {
        success: true,
        data: history
      };

      console.log('📡 API Response:');
      console.log(JSON.stringify(apiResponse, null, 2));

      // Check if the frontend can access this product
      const pricing = await DealerPricing.findOne({ product: productId }).populate('product');
      if (pricing) {
        console.log(`💰 Product pricing exists: ₹${pricing.sellingPrice}`);
        console.log(`📦 Product details: ${pricing.product.itemName} (${pricing.product.productCode})`);
        console.log('✅ This product should show up in the frontend pricing table');
      } else {
        console.log('❌ No pricing record found for this product');
      }

    } else {
      console.log('❌ No products with history found');
    }

    // List all products that have history
    console.log('\n📋 All products with price history:');
    const productsWithHistory = await DealerPricingHistory.aggregate([
      {
        $group: {
          _id: '$product',
          count: { $sum: 1 },
          latestChange: { $max: '$changeDate' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $sort: { count: -1 }
      }
    ]);

    productsWithHistory.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.product.itemName} (${item.product.productCode})`);
      console.log(`     History records: ${item.count}`);
      console.log(`     Latest change: ${item.latestChange.toISOString()}`);
      console.log('');
    });

    console.log(`\n📊 Total products with history: ${productsWithHistory.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testPriceHistoryAPI();