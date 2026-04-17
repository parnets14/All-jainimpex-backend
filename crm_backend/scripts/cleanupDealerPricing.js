import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net';

// Database names
const databases = {
  'jain-impex': 'JainImpexCRM',
  'ridhi-impex': 'ridhi_crm',
  'shree-jain-impex': 'shree_jain_crm'
};

async function cleanupDealerPricing() {
  try {
    console.log('🧹 Starting DealerPricing cleanup for all companies...\n');

    for (const [companyKey, dbName] of Object.entries(databases)) {
      console.log(`\n📊 Processing ${companyKey} (${dbName})...`);
      
      // Connect to the specific database
      const connection = await mongoose.createConnection(`${MONGODB_URI}/${dbName}`, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });

      console.log(`✅ Connected to ${dbName}`);

      // Get models
      const Product = connection.model('Product', (await import('../models/Product.js')).productSchema);
      const DealerPricing = connection.model('DealerPricing', (await import('../models/DealerPricing.js')).dealerPricingSchema);

      // Get all product IDs in this database
      const products = await Product.find({}).select('_id');
      const validProductIds = products.map(p => p._id.toString());
      
      console.log(`   Found ${validProductIds.length} products in ${dbName}`);

      // Get all pricing records
      const allPricingRecords = await DealerPricing.find({});
      console.log(`   Found ${allPricingRecords.length} pricing records in ${dbName}`);

      // Find invalid pricing records (products that don't exist in this database)
      const invalidRecords = allPricingRecords.filter(pricing => 
        !validProductIds.includes(pricing.product.toString())
      );

      console.log(`   Found ${invalidRecords.length} INVALID pricing records (products from other databases)`);

      if (invalidRecords.length > 0) {
        // Delete invalid records
        const invalidIds = invalidRecords.map(r => r._id);
        const deleteResult = await DealerPricing.deleteMany({ _id: { $in: invalidIds } });
        console.log(`   ✅ Deleted ${deleteResult.deletedCount} invalid pricing records`);
      } else {
        console.log(`   ✅ No cleanup needed - all pricing records are valid`);
      }

      // Close connection
      await connection.close();
      console.log(`   🔌 Closed connection to ${dbName}`);
    }

    console.log('\n\n✅ Cleanup completed for all companies!');
    console.log('\n📋 Summary:');
    console.log('   - Removed pricing records that reference products from other databases');
    console.log('   - Each company now only has pricing records for their own products');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    process.exit(0);
  }
}

// Run the cleanup
cleanupDealerPricing();
