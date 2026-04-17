import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { productSchema } from '../models/Product.js';
import { dealerPricingSchema } from '../models/DealerPricing.js';

dotenv.config();

// For Shree Jain Impex company
const MONGO_BASE_URI = process.env.MONGO_BASE_URI || 'mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net';
const MONGO_DB_SHREEJAIN = process.env.MONGO_DB_SHREEJAIN || 'shreejain_crm';
const MONGO_OPTIONS = process.env.MONGO_OPTIONS || '?retryWrites=true&w=majority&appName=JainImpexCRM';
const MONGODB_URI = `${MONGO_BASE_URI}/${MONGO_DB_SHREEJAIN}${MONGO_OPTIONS}`;

console.log(`📊 Connecting to Shree Jain database: ${MONGO_DB_SHREEJAIN}`);

async function fixMissingProductPrices() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get the database name from the connection
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Working with database: ${dbName}`);

    // Get models
    const Product = mongoose.connection.models.Product || mongoose.connection.model('Product', productSchema);
    const DealerPricing = mongoose.connection.models.DealerPricing || mongoose.connection.model('DealerPricing', dealerPricingSchema);

    // Find products with missing or zero prices
    console.log('\n🔍 Finding products with missing prices...');
    const products = await Product.find({});
    
    let productsWithoutPrice = [];
    let productsWithPrice = [];
    
    for (const product of products) {
      const hasPrice = product.rateSlabs && 
                      product.rateSlabs.length > 0 && 
                      product.rateSlabs[0].rate > 0;
      
      if (!hasPrice) {
        productsWithoutPrice.push(product);
      } else {
        productsWithPrice.push(product);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total products: ${products.length}`);
    console.log(`   Products with price: ${productsWithPrice.length}`);
    console.log(`   Products without price: ${productsWithoutPrice.length}`);

    if (productsWithoutPrice.length > 0) {
      console.log(`\n❌ Products without price:`);
      for (const product of productsWithoutPrice) {
        console.log(`   - ${product.itemName} (${product.productCode})`);
        console.log(`     Rate Slabs: ${JSON.stringify(product.rateSlabs)}`);
      }
    }

    // Check DealerPricing records
    console.log(`\n🔍 Checking DealerPricing records...`);
    const pricingRecords = await DealerPricing.find({})
      .populate('product', 'itemName productCode');
    
    let pricingWithoutPrice = [];
    let pricingWithPrice = [];
    
    for (const pricing of pricingRecords) {
      if (!pricing.product) {
        console.log(`   ⚠️ Pricing record ${pricing._id} has no product reference`);
        continue;
      }
      
      if (pricing.sellingPrice > 0) {
        pricingWithPrice.push(pricing);
      } else {
        pricingWithoutPrice.push(pricing);
      }
    }

    console.log(`\n📊 DealerPricing Summary:`);
    console.log(`   Total pricing records: ${pricingRecords.length}`);
    console.log(`   Records with price: ${pricingWithPrice.length}`);
    console.log(`   Records without price: ${pricingWithoutPrice.length}`);

    if (pricingWithoutPrice.length > 0) {
      console.log(`\n❌ DealerPricing records without price:`);
      for (const pricing of pricingWithoutPrice) {
        console.log(`   - ${pricing.product.itemName} (${pricing.product.productCode})`);
        console.log(`     Purchase Price: ₹${pricing.purchasePrice}`);
        console.log(`     Selling Price: ₹${pricing.sellingPrice}`);
        console.log(`     Source: ${pricing.purchasePriceSource}`);
      }
    }

    // Specific check for TTT001
    console.log(`\n🔍 Checking product TTT001...`);
    const ttt001 = await Product.findOne({ productCode: 'TTT001' });
    if (ttt001) {
      console.log(`   ✅ Found product TTT001:`);
      console.log(`      Name: ${ttt001.itemName}`);
      console.log(`      Code: ${ttt001.productCode}`);
      console.log(`      Rate Slabs: ${JSON.stringify(ttt001.rateSlabs)}`);
      
      const ttt001Pricing = await DealerPricing.findOne({ product: ttt001._id });
      if (ttt001Pricing) {
        console.log(`   ✅ Found DealerPricing for TTT001:`);
        console.log(`      Purchase Price: ₹${ttt001Pricing.purchasePrice}`);
        console.log(`      Selling Price: ₹${ttt001Pricing.sellingPrice}`);
        console.log(`      Source: ${ttt001Pricing.purchasePriceSource}`);
      } else {
        console.log(`   ❌ No DealerPricing record found for TTT001`);
      }
    } else {
      console.log(`   ❌ Product TTT001 not found`);
    }

    console.log('\n✅ Analysis complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
fixMissingProductPrices();
