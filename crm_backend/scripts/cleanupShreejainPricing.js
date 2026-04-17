import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGO_BASE_URI || 'mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net';
const DB_NAME = 'shreejain_crm';

async function cleanupShreejainPricing() {
  try {
    console.log(`🧹 Cleaning up DealerPricing in ${DB_NAME}...\n`);
    
    // Connect to shreejain_crm database
    const connection = await mongoose.createConnection(`${MONGODB_URI}/${DB_NAME}`);
    console.log(`✅ Connected to ${DB_NAME}`);

    // Get models
    const Product = connection.model('Product', (await import('../models/Product.js')).productSchema);
    const DealerPricing = connection.model('DealerPricing', (await import('../models/DealerPricing.js')).dealerPricingSchema);

    // Get all product IDs in shreejain_crm
    const products = await Product.find({}).select('_id itemName productCode');
    const validProductIds = products.map(p => p._id.toString());
    
    console.log(`📦 Found ${products.length} products in ${DB_NAME}:`);
    products.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.itemName} (${p.productCode})`);
    });

    // Get all pricing records
    const allPricingRecords = await DealerPricing.find({});
    console.log(`\n💰 Found ${allPricingRecords.length} pricing records in ${DB_NAME}`);

    // Find invalid pricing records
    const invalidRecords = [];
    const validRecords = [];
    
    for (const pricing of allPricingRecords) {
      if (validProductIds.includes(pricing.product.toString())) {
        validRecords.push(pricing);
      } else {
        invalidRecords.push(pricing);
      }
    }

    console.log(`\n📊 Analysis:`);
    console.log(`   ✅ Valid pricing records: ${validRecords.length}`);
    console.log(`   ❌ Invalid pricing records: ${invalidRecords.length} (products from other databases)`);

    if (invalidRecords.length > 0) {
      console.log(`\n🗑️  Deleting ${invalidRecords.length} invalid pricing records...`);
      
      const invalidIds = invalidRecords.map(r => r._id);
      const deleteResult = await DealerPricing.deleteMany({ _id: { $in: invalidIds } });
      
      console.log(`   ✅ Deleted ${deleteResult.deletedCount} invalid pricing records`);
      
      // Verify
      const remainingCount = await DealerPricing.countDocuments({});
      console.log(`   ✅ Remaining pricing records: ${remainingCount}`);
    } else {
      console.log(`\n✅ No cleanup needed - all pricing records are valid`);
    }

    await connection.close();
    console.log(`\n🔌 Closed connection to ${DB_NAME}`);
    console.log(`\n✅ Cleanup completed!`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    process.exit(0);
  }
}

cleanupShreejainPricing();
