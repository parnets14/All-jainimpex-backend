import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net';

const databases = {
  'jain-impex': 'JainImpexCRM',
  'ridhi-impex': 'ridhi_crm',
  'shree-jain-impex': 'shree_jain_crm'
};

async function checkProducts() {
  try {
    console.log('🔍 Checking products in all databases...\n');

    for (const [companyKey, dbName] of Object.entries(databases)) {
      console.log(`\n📊 ${companyKey} (${dbName}):`);
      
      const connection = await mongoose.createConnection(`${MONGODB_URI}/${dbName}`);
      const Product = connection.model('Product', (await import('../models/Product.js')).productSchema);

      const products = await Product.find({}).select('itemName productCode _id').limit(10);
      
      console.log(`   Total products: ${await Product.countDocuments({})}`);
      
      if (products.length > 0) {
        console.log(`   Sample products:`);
        products.forEach((p, i) => {
          console.log(`     ${i + 1}. ${p.itemName} (${p.productCode}) - ID: ${p._id}`);
        });
      }

      await connection.close();
    }

    console.log('\n✅ Check completed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

checkProducts();
