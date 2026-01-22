import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricing from './models/DealerPricing.js';
import Product from './models/Product.js';

dotenv.config();

async function cleanupInvalidPricingRecords() {
  try {
    console.log('🧹 Cleaning up invalid pricing records...');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB Atlas');
    
    // Find all pricing records
    const allPricing = await DealerPricing.find({});
    console.log(`📊 Found ${allPricing.length} total pricing records`);
    
    // Check which ones have invalid product references
    const invalidRecords = [];
    const validRecords = [];
    
    for (const pricing of allPricing) {
      try {
        const product = await Product.findById(pricing.product);
        if (!product) {
          invalidRecords.push(pricing);
        } else {
          validRecords.push(pricing);
        }
      } catch (error) {
        invalidRecords.push(pricing);
      }
    }
    
    console.log(`✅ Valid records: ${validRecords.length}`);
    console.log(`❌ Invalid records: ${invalidRecords.length}`);
    
    if (invalidRecords.length > 0) {
      console.log('\n🗑️  Deactivating invalid records...');
      const deactivateResult = await DealerPricing.updateMany(
        { _id: { $in: invalidRecords.map(r => r._id) } },
        { isActive: false }
      );
      console.log(`✅ Deactivated ${deactivateResult.modifiedCount} invalid records`);
    }
    
    // Test the controller query again
    console.log('\n📊 Testing controller query after cleanup...');
    const filter = { isActive: true };
    const pricingRecords = await DealerPricing.find(filter)
      .populate({
        path: 'product',
        select: 'itemName productCode brand category subcategory',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' }
        ]
      })
      .sort({ updatedAt: -1 })
      .limit(50);

    console.log(`✅ Found ${pricingRecords.length} active records`);
    
    const validAfterCleanup = pricingRecords.filter(p => p.product != null);
    console.log(`✅ Valid after cleanup: ${validAfterCleanup.length}`);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

cleanupInvalidPricingRecords();