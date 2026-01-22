import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import Category from './models/Category.js';

dotenv.config();

const debugPricingIssueSimple = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get the "Cera cp fittings" category
    const ceraCategory = await Category.findOne({ 
      name: { $regex: /cera.*cp.*fitting/i } 
    });
    
    if (!ceraCategory) {
      console.log('❌ Cera cp fittings category not found');
      return;
    }

    console.log(`📦 Found category: ${ceraCategory.name} (${ceraCategory._id})`);

    // Get ALL products in this category (without populate to avoid schema issues)
    const allProducts = await Product.find({ category: ceraCategory._id });

    console.log(`\n📊 Total products in category: ${allProducts.length}`);

    // Check each product's pricing situation
    console.log('\n🔍 Analyzing each product:');
    
    for (let i = 0; i < allProducts.length; i++) {
      const product = allProducts[i];
      console.log(`\n${i + 1}. ${product.itemName} (${product.productCode})`);
      
      // Check if it has DealerPricing record
      const dealerPricing = await DealerPricing.findOne({
        product: product._id,
        isActive: true
      });
      
      if (dealerPricing) {
        console.log(`   ✅ Has DealerPricing: ₹${dealerPricing.sellingPrice} (Purchase: ₹${dealerPricing.purchasePrice || 0})`);
      } else {
        console.log(`   ❌ No DealerPricing record`);
      }
      
      // Check rate slabs
      if (product.rateSlabs && product.rateSlabs.length > 0) {
        console.log(`   📋 Rate Slabs: ${product.rateSlabs.length}`);
        console.log(`      First Rate: ₹${product.rateSlabs[0].rate}`);
      } else {
        console.log(`   ❌ No Rate Slabs`);
      }
      
      // Determine what price would be used
      let availablePrice = null;
      let priceSource = null;
      
      if (dealerPricing && dealerPricing.sellingPrice > 0) {
        availablePrice = dealerPricing.sellingPrice;
        priceSource = 'DealerPricing';
      } else if (product.rateSlabs && product.rateSlabs.length > 0 && product.rateSlabs[0].rate > 0) {
        availablePrice = product.rateSlabs[0].rate;
        priceSource = 'RateSlab';
      }
      
      if (availablePrice) {
        console.log(`   💰 Available Price: ₹${availablePrice} (from ${priceSource})`);
        console.log(`   ✅ SHOULD BE INCLUDED in bulk pricing`);
      } else {
        console.log(`   ❌ No valid price available`);
        console.log(`   ❌ WOULD BE EXCLUDED from bulk pricing`);
      }
    }

    // Show current backend logic results
    console.log('\n🔍 Current Backend Logic Results:');
    
    // Get products that would be found by current backend logic (only those with DealerPricing)
    const productIds = allProducts.map(p => p._id);
    const pricingRecords = await DealerPricing.find({
      product: { $in: productIds },
      isActive: true
    });

    console.log(`📊 Products with DealerPricing records: ${pricingRecords.length}`);

    console.log('\n🎯 ISSUE SUMMARY:');
    console.log(`   - Total products in category: ${allProducts.length}`);
    console.log(`   - Products with DealerPricing: ${pricingRecords.length}`);
    console.log(`   - Products excluded: ${allProducts.length - pricingRecords.length}`);
    
    if (allProducts.length > pricingRecords.length) {
      console.log('\n❌ CONFIRMED ISSUE: Some products are excluded from bulk pricing');
      console.log('   Reason: They only have rate slabs but no DealerPricing records');
      console.log('   Impact: User sees fewer products in preview than expected');
      console.log('\n💡 SOLUTION NEEDED:');
      console.log('   - Modify backend to include products with rate slabs');
      console.log('   - Use rate slab price as fallback when no DealerPricing exists');
      console.log('   - Create DealerPricing records for products that only have rate slabs');
    } else {
      console.log('\n✅ All products have DealerPricing records');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

debugPricingIssueSimple();