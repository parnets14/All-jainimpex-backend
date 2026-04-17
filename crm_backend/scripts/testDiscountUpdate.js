import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGO_BASE_URI || 'mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net';
const DB_NAME = 'shreejain_crm';

async function testDiscountUpdate() {
  try {
    console.log(`🧪 Testing discount update in ${DB_NAME}...\n`);
    
    const connection = await mongoose.createConnection(`${MONGODB_URI}/${DB_NAME}`);
    console.log(`✅ Connected to ${DB_NAME}`);

    const DealerPricing = connection.model('DealerPricing', (await import('../models/DealerPricing.js')).dealerPricingSchema);
    const Product = connection.model('Product', (await import('../models/Product.js')).productSchema);
    const DiscountMapping = connection.model('DiscountMapping', (await import('../models/DiscountMapping.js')).discountMappingSchema);
    const PurchaseDiscountMapping = connection.model('PurchaseDiscountMapping', (await import('../models/PurchaseDiscountMapping.js')).purchaseDiscountMappingSchema);

    // Get first product
    const product = await Product.findOne({});
    console.log(`\n📦 Testing with product: ${product.itemName} (${product._id})`);

    // Test DiscountMapping.findApplicableDiscounts
    console.log(`\n🔍 Testing DiscountMapping.findApplicableDiscounts...`);
    const salesDiscounts = await DiscountMapping.findApplicableDiscounts(product._id, 'sales', null);
    console.log(`   Found ${salesDiscounts.length} sales discounts`);
    if (salesDiscounts.length > 0) {
      salesDiscounts.forEach(d => {
        console.log(`   - ${d.discountName}: ${d.directDiscountPercentage}%`);
      });
    }

    // Test PurchaseDiscountMapping.findApplicableDiscounts
    console.log(`\n🔍 Testing PurchaseDiscountMapping.findApplicableDiscounts...`);
    const purchaseDiscounts = await PurchaseDiscountMapping.findApplicableDiscounts(product._id);
    console.log(`   Found ${purchaseDiscounts.length} purchase discounts`);
    if (purchaseDiscounts.length > 0) {
      purchaseDiscounts.forEach(d => {
        console.log(`   - ${d.discountName}: ${d.directDiscountPercentage}%`);
      });
    }

    // Get or create pricing record
    let pricing = await DealerPricing.findOne({ product: product._id });
    if (!pricing) {
      console.log(`\n⚠️ No pricing record found, creating one...`);
      pricing = new DealerPricing({
        product: product._id,
        sellingPrice: 100,
        purchasePrice: 80,
        isActive: true
      });
    }

    console.log(`\n🔄 Updating discount info for pricing record...`);
    await pricing.updateAllDiscountInfo();
    await pricing.save();

    console.log(`\n✅ Updated pricing record:`);
    console.log(`   Sales Discount: ${pricing.hasDirectDiscount ? pricing.directDiscountPercentage + '%' : 'None'}`);
    console.log(`   Sales Discount Source: ${pricing.salesDiscountSource || 'None'}`);
    console.log(`   Purchase Discount: ${pricing.purchaseDiscountInfo?.hasDirectDiscount ? pricing.purchaseDiscountInfo.directDiscountPercentage + '%' : 'None'}`);
    console.log(`   Purchase Discount Source: ${pricing.purchaseDiscountInfo?.discountSource || 'None'}`);

    await connection.close();
    console.log(`\n✅ Test completed!`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

testDiscountUpdate();
