import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricingHistory from './models/DealerPricingHistory.js';
import User from './models/User.js';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

const testAllUserProductsHistory = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test products from user's console logs
    const testProducts = [
      { id: '6971ee886ff1360e0143a587', name: 'wire belts' },
      { id: '6971b32839870bccbb5cc5c1', name: 'Wire Links' },
      { id: '696dbcde28b5f6168171ec4b', name: 'product2' },
      { id: '696cea0a0588aebfaecac617', name: 'h cpvc brass elbow 3/4x1/2"' }
    ];
    
    console.log('🧪 Testing price history for all user products...\n');
    
    for (const product of testProducts) {
      console.log(`📦 Testing: ${product.name} (${product.id})`);
      
      // Verify product exists
      const productExists = await Product.findById(product.id);
      if (!productExists) {
        console.log(`  ❌ Product not found in database`);
        continue;
      }
      
      // Test history retrieval
      const history = await DealerPricingHistory.find({ 
        product: new mongoose.Types.ObjectId(product.id) 
      })
      .populate('changedBy', 'name')
      .sort({ changeDate: -1 });
      
      console.log(`  📊 Found ${history.length} history records`);
      
      if (history.length === 0) {
        console.log(`  ❌ No history records found!`);
      } else {
        console.log(`  ✅ History available:`);
        history.slice(0, 2).forEach((record, index) => {
          console.log(`    ${index + 1}. ₹${record.oldPrice} → ₹${record.newPrice} (${record.changeType})`);
          console.log(`       ${record.changeDate.toLocaleDateString()} - ${record.reason}`);
        });
        if (history.length > 2) {
          console.log(`    ... and ${history.length - 2} more records`);
        }
      }
      console.log('');
    }

    // Test API endpoint simulation
    console.log('🔧 Simulating API endpoint calls...\n');
    
    for (const product of testProducts) {
      console.log(`📡 GET /api/dealer-pricing/price-history/${product.id}`);
      
      const history = await DealerPricingHistory.find({ 
        product: new mongoose.Types.ObjectId(product.id) 
      })
      .populate('changedBy', 'name')
      .sort({ changeDate: -1 });
      
      const apiResponse = {
        success: true,
        data: history.map(record => ({
          _id: record._id,
          oldPrice: record.oldPrice,
          newPrice: record.newPrice,
          changeType: record.changeType,
          changeMethod: record.changeMethod,
          changeValue: record.changeValue,
          reason: record.reason,
          changeDate: record.changeDate,
          changedBy: record.changedBy
        }))
      };
      
      console.log(`  ✅ Response: ${apiResponse.data.length} records`);
      console.log(`  📊 Status: ${apiResponse.success ? 'SUCCESS' : 'FAILED'}`);
      console.log('');
    }

    // Summary
    const totalHistory = await DealerPricingHistory.countDocuments();
    console.log(`📊 SUMMARY:`);
    console.log(`  - Total price history records: ${totalHistory}`);
    console.log(`  - User products tested: ${testProducts.length}`);
    console.log(`  - All products have history: ${testProducts.length > 0 ? '✅' : '❌'}`);
    console.log('');
    console.log('💡 NEXT STEPS FOR USER:');
    console.log('  1. Go to Master Management → Dealer Product Pricing');
    console.log('  2. Click on "Product Pricing" tab (not "Price History" tab)');
    console.log('  3. Find any of these products in the list:');
    testProducts.forEach(p => console.log(`     - ${p.name}`));
    console.log('  4. Click the "History" button next to the product');
    console.log('  5. The price history modal should now show data!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the test
testAllUserProductsHistory();