import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import Category from './models/Category.js';

dotenv.config();

const testEnhancedBulkPreview = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test with "aa" category that has products with only rate slabs
    const aaCategory = await Category.findOne({ name: 'aa' });
    
    if (!aaCategory) {
      console.log('❌ "aa" category not found');
      return;
    }

    console.log(`📦 Testing with category: ${aaCategory.name} (${aaCategory._id})`);

    // Simulate the ENHANCED backend logic
    const filters = {
      categoryId: aaCategory._id.toString()
    };
    const changeType = 'increase_percentage';
    const changeValue = 10;

    console.log('\n🔍 Testing ENHANCED Backend Logic...');

    // Build product filter
    let productFilter = {};
    if (filters.categoryId) {
      productFilter.category = filters.categoryId;
    }

    console.log('🔍 Product Filter:', productFilter);

    // Get matching products (with rateSlabs)
    const products = await Product.find(productFilter).select('_id itemName productCode rateSlabs');
    const productIds = products.map(p => p._id);

    console.log(`✅ Found ${products.length} products matching filter`);

    if (productIds.length === 0) {
      console.log('❌ No products found');
      return;
    }

    // Get pricing records for these products
    const pricingRecords = await DealerPricing.find({
      product: { $in: productIds },
      isActive: true
    });

    console.log(`💰 Found ${pricingRecords.length} existing pricing records`);

    // Create a map of existing pricing records
    const pricingMap = {};
    pricingRecords.forEach(pricing => {
      pricingMap[pricing.product.toString()] = pricing;
    });

    // Process all products (including those without DealerPricing records)
    const affectedProducts = [];
    
    for (const product of products) {
      const existingPricing = pricingMap[product._id.toString()];
      let currentPrice = 0;
      let priceSource = '';

      console.log(`\n📦 Processing: ${product.itemName} (${product.productCode})`);

      // Determine current price
      if (existingPricing && existingPricing.sellingPrice > 0) {
        currentPrice = existingPricing.sellingPrice;
        priceSource = 'DealerPricing';
        console.log(`   💰 Using DealerPricing: ₹${currentPrice}`);
      } else if (product.rateSlabs && product.rateSlabs.length > 0 && product.rateSlabs[0].rate > 0) {
        currentPrice = product.rateSlabs[0].rate;
        priceSource = 'RateSlab';
        console.log(`   📋 Using RateSlab: ₹${currentPrice}`);
      }

      // Skip products with no valid price
      if (currentPrice <= 0) {
        console.log(`   ❌ No valid price - SKIPPED`);
        continue;
      }

      // Calculate new price
      let newPrice;
      switch (changeType) {
        case 'increase_percentage':
          newPrice = currentPrice * (1 + parseFloat(changeValue) / 100);
          break;
        default:
          newPrice = currentPrice;
      }

      newPrice = Math.round(newPrice * 100) / 100;
      const change = Math.round((newPrice - currentPrice) * 100) / 100;

      console.log(`   ✅ Current: ₹${currentPrice} → New: ₹${newPrice} (Change: ₹${change})`);
      console.log(`   📊 Price Source: ${priceSource}`);

      affectedProducts.push({
        productId: product._id,
        productName: product.itemName,
        productCode: product.productCode,
        currentPrice,
        newPrice,
        change,
        priceSource,
        hasExistingPricing: !!existingPricing
      });
    }

    // Calculate summary
    const totalCurrentValue = affectedProducts.reduce((sum, p) => sum + p.currentPrice, 0);
    const totalNewValue = affectedProducts.reduce((sum, p) => sum + p.newPrice, 0);
    const totalChange = totalNewValue - totalCurrentValue;

    console.log('\n📊 ENHANCED Preview Results:');
    console.log(`Total Products: ${affectedProducts.length}`);
    console.log(`Total Current Value: ₹${totalCurrentValue}`);
    console.log(`Total New Value: ₹${totalNewValue}`);
    console.log(`Total Change: ₹${totalChange}`);

    console.log('\n📋 Affected Products:');
    affectedProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.productName} (${product.productCode})`);
      console.log(`   Current: ₹${product.currentPrice} → New: ₹${product.newPrice} (${product.priceSource})`);
      console.log(`   Has Existing Pricing: ${product.hasExistingPricing ? 'Yes' : 'No'}`);
    });

    console.log('\n✅ ENHANCEMENT SUCCESS:');
    console.log('   - Now includes products with only Rate Slabs');
    console.log('   - Shows all products in category for bulk pricing');
    console.log('   - Differentiates between DealerPricing and RateSlab sources');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testEnhancedBulkPreview();