import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGO_BASE_URI || 'mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net';
const DB_NAME = 'shreejain_crm';

async function checkDiscounts() {
  try {
    console.log(`🔍 Checking discount mappings in ${DB_NAME}...\n`);
    
    const connection = await mongoose.createConnection(`${MONGODB_URI}/${DB_NAME}`);
    console.log(`✅ Connected to ${DB_NAME}`);

    const DiscountMapping = connection.model('DiscountMapping', (await import('../models/DiscountMapping.js')).discountMappingSchema);
    const PurchaseDiscountMapping = connection.model('PurchaseDiscountMapping', (await import('../models/PurchaseDiscountMapping.js')).purchaseDiscountMappingSchema);

    // Check sales discounts
    const salesDiscounts = await DiscountMapping.find({}).limit(10);
    
    console.log(`\n💰 Sales Discount Mappings: ${await DiscountMapping.countDocuments({})}`);
    if (salesDiscounts.length > 0) {
      salesDiscounts.forEach((d, i) => {
        console.log(`   ${i + 1}. ${d.discountName} - ${d.directDiscountPercentage}% (Status: ${d.status})`);
        console.log(`      Valid: ${d.validFrom} to ${d.validTo || 'No end date'}`);
      });
    } else {
      console.log(`   No sales discount mappings found`);
    }

    // Check purchase discounts
    const purchaseDiscounts = await PurchaseDiscountMapping.find({}).limit(10);
    
    console.log(`\n🛒 Purchase Discount Mappings: ${await PurchaseDiscountMapping.countDocuments({})}`);
    if (purchaseDiscounts.length > 0) {
      purchaseDiscounts.forEach((d, i) => {
        console.log(`   ${i + 1}. ${d.discountName} - ${d.directDiscountPercentage}% (Status: ${d.status})`);
        console.log(`      Valid: ${d.validFrom} to ${d.validTo || 'No end date'}`);
      });
    } else {
      console.log(`   No purchase discount mappings found`);
    }

    await connection.close();
    console.log(`\n✅ Check completed!`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

checkDiscounts();
