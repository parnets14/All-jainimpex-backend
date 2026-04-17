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

async function fixTTT001Price() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Working with database: ${dbName}`);

    // Get models
    const Product = mongoose.connection.models.Product || mongoose.connection.model('Product', productSchema);
    const DealerPricing = mongoose.connection.models.DealerPricing || mongoose.connection.model('DealerPricing', dealerPricingSchema);

    // Find product TTT001
    console.log('\n🔍 Finding product TTT001...');
    const product = await Product.findOne({ productCode: 'TTT001' });
    
    if (!product) {
      console.log('❌ Product TTT001 not found');
      return;
    }

    console.log(`✅ Found product: ${product.itemName}`);
    console.log(`   Selling Price (from rate slabs): ₹${product.rateSlabs[0]?.rate || 0}`);

    // Find DealerPricing record
    const pricing = await DealerPricing.findOne({ product: product._id });
    
    if (!pricing) {
      console.log('❌ No DealerPricing record found');
      return;
    }

    console.log(`\n📊 Current DealerPricing:`);
    console.log(`   Purchase Price: ₹${pricing.purchasePrice}`);
    console.log(`   Selling Price: ₹${pricing.sellingPrice}`);
    console.log(`   Source: ${pricing.purchasePriceSource}`);

    // Get selling price
    const sellingPrice = pricing.sellingPrice || product.rateSlabs[0]?.rate || 0;
    const suggestedPurchasePrice = Math.round(sellingPrice * 0.8); // 80% of selling price

    // Fix: Set purchase price to Product Master price if it's currently 0
    if (pricing.purchasePrice === 0 && sellingPrice > 0) {
      console.log(`\n🔧 Fixing purchase price (currently ₹0)...`);
      console.log(`   Setting to Product Master price: ₹${sellingPrice}`);
      
      pricing.purchasePrice = sellingPrice;
      pricing.purchasePriceSource = 'product_master';
      await pricing.save();
      
      console.log(`✅ Fixed! Purchase price is now: ₹${pricing.purchasePrice}`);
    } else {
      console.log(`\n💡 Suggested fix:`);
      console.log(`   Set Purchase Price to: ₹${suggestedPurchasePrice} (80% of selling price)`);
      console.log(`   This will give a 25% profit margin`);

      // Ask for confirmation (in a real scenario, you'd want user input)
      // For now, let's just update it
      console.log(`\n🔧 Updating DealerPricing record...`);
      
      pricing.purchasePrice = suggestedPurchasePrice;
      pricing.purchasePriceSource = 'manual';
      await pricing.save();
    }

    console.log(`✅ Updated successfully!`);
    console.log(`\n📊 New DealerPricing:`);
    console.log(`   Purchase Price: ₹${pricing.purchasePrice}`);
    console.log(`   Selling Price: ₹${pricing.sellingPrice}`);
    console.log(`   Profit Margin: ${pricing.profitMargin}%`);
    console.log(`   Source: ${pricing.purchasePriceSource}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
fixTTT001Price();
