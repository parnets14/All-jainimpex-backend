import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricingHistory from './models/DealerPricingHistory.js';
import DealerPricing from './models/DealerPricing.js';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

const testPriceHistory = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Check if there are any price history records
    const totalHistoryRecords = await DealerPricingHistory.countDocuments();
    console.log(`📊 Total price history records: ${totalHistoryRecords}`);

    if (totalHistoryRecords === 0) {
      console.log('❌ No price history records found!');
      console.log('🔍 This explains why price history is not showing.');
      
      // Check if there are any pricing records
      const totalPricingRecords = await DealerPricing.countDocuments();
      console.log(`📊 Total pricing records: ${totalPricingRecords}`);
      
      if (totalPricingRecords > 0) {
        console.log('\n💡 Solution: Price history records need to be created when prices are updated.');
        console.log('   The system has pricing records but no history tracking.');
        
        // Get a sample pricing record
        const samplePricing = await DealerPricing.findOne().populate('product', 'itemName productCode');
        if (samplePricing) {
          console.log(`\n📦 Sample pricing record: ${samplePricing.product.itemName}`);
          console.log(`   Current Price: ₹${samplePricing.sellingPrice}`);
          console.log(`   Product ID: ${samplePricing.product._id}`);
          
          // Test creating a history record
          console.log('\n🧪 Testing history record creation...');
          const testHistory = await DealerPricingHistory.logPriceChange({
            product: samplePricing.product._id,
            oldPrice: samplePricing.sellingPrice - 10,
            newPrice: samplePricing.sellingPrice,
            changeType: 'manual',
            changeMethod: 'direct_update',
            reason: 'Test history record creation',
            changedBy: samplePricing.updatedBy || samplePricing.createdBy
          });
          
          console.log('✅ Test history record created:', testHistory._id);
          
          // Test the getProductPriceHistory method
          const history = await DealerPricingHistory.getProductPriceHistory(samplePricing.product._id, 5);
          console.log(`📋 Retrieved ${history.length} history records for this product`);
          
          if (history.length > 0) {
            console.log('✅ Price history retrieval is working!');
            console.log('   Sample history record:');
            console.log(`   - Old Price: ₹${history[0].oldPrice}`);
            console.log(`   - New Price: ₹${history[0].newPrice}`);
            console.log(`   - Change Date: ${history[0].changeDate}`);
            console.log(`   - Changed By: ${history[0].changedBy?.name || 'Unknown'}`);
          }
        }
      }
    } else {
      console.log('✅ Price history records exist!');
      
      // Get some sample history records
      const sampleHistory = await DealerPricingHistory.find()
        .populate('product', 'itemName productCode')
        .populate('changedBy', 'name email')
        .sort({ changeDate: -1 })
        .limit(5);
      
      console.log(`\n📋 Sample history records (${sampleHistory.length}):`);
      sampleHistory.forEach((record, index) => {
        console.log(`  ${index + 1}. ${record.product.itemName} (${record.product.productCode})`);
        console.log(`     ₹${record.oldPrice} → ₹${record.newPrice}`);
        console.log(`     Type: ${record.changeType}, Method: ${record.changeMethod}`);
        console.log(`     Date: ${record.changeDate.toISOString()}`);
        console.log(`     Changed by: ${record.changedBy?.name || 'Unknown'}`);
        console.log('');
      });
      
      // Test the API method for a specific product
      if (sampleHistory.length > 0) {
        const productId = sampleHistory[0].product._id;
        console.log(`🧪 Testing getProductPriceHistory for product: ${sampleHistory[0].product.itemName}`);
        
        const productHistory = await DealerPricingHistory.getProductPriceHistory(productId, 10);
        console.log(`📊 Found ${productHistory.length} history records for this product`);
        
        if (productHistory.length > 0) {
          console.log('✅ Product-specific history retrieval is working!');
        } else {
          console.log('❌ Product-specific history retrieval failed!');
        }
      }
    }

    // Check if price updates are creating history records
    console.log('\n🔍 Checking if price updates create history records...');
    
    // Find a pricing record to test with
    const testPricing = await DealerPricing.findOne().populate('product', 'itemName productCode');
    if (testPricing) {
      console.log(`📦 Testing with product: ${testPricing.product.itemName}`);
      
      const originalPrice = testPricing.sellingPrice;
      const newPrice = originalPrice + 1; // Small increase for testing
      
      console.log(`💰 Original price: ₹${originalPrice}`);
      console.log(`💰 New price: ₹${newPrice}`);
      
      // Count history records before update
      const historyBefore = await DealerPricingHistory.countDocuments({ product: testPricing.product._id });
      console.log(`📊 History records before update: ${historyBefore}`);
      
      // Update the price
      testPricing.sellingPrice = newPrice;
      await testPricing.save();
      
      // Count history records after update
      const historyAfter = await DealerPricingHistory.countDocuments({ product: testPricing.product._id });
      console.log(`📊 History records after update: ${historyAfter}`);
      
      if (historyAfter > historyBefore) {
        console.log('✅ Price update automatically created history record!');
      } else {
        console.log('❌ Price update did NOT create history record!');
        console.log('💡 This is the issue - price updates need to create history records.');
      }
      
      // Revert the price change
      testPricing.sellingPrice = originalPrice;
      await testPricing.save();
      console.log('🔄 Reverted price change for testing');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testPriceHistory();