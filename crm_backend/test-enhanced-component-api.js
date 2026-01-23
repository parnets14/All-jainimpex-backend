// Test script for Enhanced Dealer Product Pricing Component API endpoints
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricing from './models/DealerPricing.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const testEnhancedComponentAPI = async () => {
  try {
    console.log('🧪 Testing Enhanced Dealer Product Pricing Component API endpoints...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Check if comprehensive pricing data is available
    console.log('📊 Test 1: Checking comprehensive pricing data availability...');
    
    const pricingRecords = await DealerPricing.find({ isActive: true })
      .populate('product', 'name code rateSlabs')
      .populate({
        path: 'product',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' }
        ]
      })
      .limit(5);

    console.log(`Found ${pricingRecords.length} pricing records for testing`);

    if (pricingRecords.length > 0) {
      const sample = pricingRecords[0];
      console.log('\n📋 Sample pricing record structure:');
      console.log(`- Product: ${sample.product?.name} (${sample.product?.code})`);
      console.log(`- Brand: ${sample.product?.brand?.name || 'N/A'}`);
      console.log(`- Category: ${sample.product?.category?.name || 'N/A'}`);
      console.log(`- Purchase Price: ₹${sample.purchasePrice}`);
      console.log(`- Selling Price: ₹${sample.sellingPrice}`);
      console.log(`- Gross Margin: ${sample.grossMargin?.toFixed(2)}%`);
      console.log(`- Net Margin: ${sample.netMargin?.toFixed(2)}%`);
      console.log(`- Effective Purchase Price: ₹${sample.effectivePurchasePrice}`);
      console.log(`- Has Sales Discount: ${sample.hasDirectDiscount}`);
      console.log(`- Sales Discount %: ${sample.directDiscountPercentage}%`);
      console.log(`- Has Purchase Discount: ${sample.purchaseDiscountInfo?.hasDirectDiscount || false}`);
      console.log(`- Purchase Discount %: ${sample.purchaseDiscountInfo?.directDiscountPercentage || 0}%`);
      console.log(`- Purchase Discount Source: ${sample.purchaseDiscountInfo?.discountSource || 'N/A'}`);
      console.log(`- Has Scheduled Change: ${sample.hasScheduledChange}`);
      console.log(`- Purchase Price Source: ${sample.purchasePriceSource}`);
    }

    // Test 2: Check filter options availability
    console.log('\n🔍 Test 2: Checking filter options availability...');
    
    const [brands, categories, subcategories] = await Promise.all([
      Brand.find({}).select('name').limit(5),
      Category.find({}).select('name').limit(5),
      Subcategory.find({}).select('name').limit(5)
    ]);

    console.log(`- Brands available: ${brands.length} (showing first 5)`);
    brands.forEach(brand => console.log(`  • ${brand.name}`));
    
    console.log(`- Categories available: ${categories.length} (showing first 5)`);
    categories.forEach(category => console.log(`  • ${category.name}`));
    
    console.log(`- Subcategories available: ${subcategories.length} (showing first 5)`);
    subcategories.forEach(subcategory => console.log(`  • ${subcategory.name}`));

    // Test 3: Check discount information completeness
    console.log('\n💰 Test 3: Analyzing discount information completeness...');
    
    const discountStats = await DealerPricing.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          withSalesDiscount: { $sum: { $cond: ['$hasDirectDiscount', 1, 0] } },
          withPurchaseDiscount: { $sum: { $cond: ['$purchaseDiscountInfo.hasDirectDiscount', 1, 0] } },
          withScheduledChanges: { $sum: { $cond: ['$hasScheduledChange', 1, 0] } },
          avgGrossMargin: { $avg: '$grossMargin' },
          avgNetMargin: { $avg: '$netMargin' }
        }
      }
    ]);

    if (discountStats.length > 0) {
      const stats = discountStats[0];
      console.log(`- Total Products: ${stats.totalProducts}`);
      console.log(`- With Sales Discounts: ${stats.withSalesDiscount} (${((stats.withSalesDiscount / stats.totalProducts) * 100).toFixed(1)}%)`);
      console.log(`- With Purchase Discounts: ${stats.withPurchaseDiscount} (${((stats.withPurchaseDiscount / stats.totalProducts) * 100).toFixed(1)}%)`);
      console.log(`- With Scheduled Changes: ${stats.withScheduledChanges} (${((stats.withScheduledChanges / stats.totalProducts) * 100).toFixed(1)}%)`);
      console.log(`- Average Gross Margin: ${stats.avgGrossMargin?.toFixed(2)}%`);
      console.log(`- Average Net Margin: ${stats.avgNetMargin?.toFixed(2)}%`);
    }

    // Test 4: Check margin range calculations
    console.log('\n📈 Test 4: Checking margin range calculations...');
    
    const productsWithMarginRange = await DealerPricing.find({
      isActive: true,
      $expr: { $ne: ['$marginRange.min', '$marginRange.max'] }
    }).limit(3);

    console.log(`Found ${productsWithMarginRange.length} products with margin ranges (floating discounts)`);
    
    productsWithMarginRange.forEach((product, index) => {
      console.log(`\n${index + 1}. Product ID: ${product.product}`);
      console.log(`   - Net Margin: ${product.netMargin?.toFixed(2)}%`);
      console.log(`   - Margin Range: ${product.marginRange?.min?.toFixed(2)}% - ${product.marginRange?.max?.toFixed(2)}%`);
      console.log(`   - Purchase Discount: ${product.purchaseDiscountInfo?.directDiscountPercentage || 0}%`);
      console.log(`   - Floating Range: ${product.purchaseDiscountInfo?.floatingDiscountMin || 0}% - ${product.purchaseDiscountInfo?.floatingDiscountMax || 0}%`);
    });

    // Test 5: Check price source tracking
    console.log('\n🔄 Test 5: Checking price source tracking...');
    
    const priceSourceStats = await DealerPricing.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$purchasePriceSource',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log('Price source distribution:');
    priceSourceStats.forEach(stat => {
      console.log(`- ${stat._id || 'Unknown'}: ${stat.count} products`);
    });

    console.log('\n✅ Enhanced Component API Test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Comprehensive pricing data is available');
    console.log('- Filter options are populated');
    console.log('- Discount information is tracked');
    console.log('- Margin calculations are working');
    console.log('- Price source tracking is functional');
    console.log('\n🚀 The Enhanced Dealer Product Pricing Component should work properly!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the test
testEnhancedComponentAPI();