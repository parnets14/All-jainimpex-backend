// Test comprehensive API with proper imports to find celeb 3d black
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricing from './models/DealerPricing.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import DealerPricingHistory from './models/DealerPricingHistory.js';
import DealerPricingSchedule from './models/DealerPricingSchedule.js';

dotenv.config();

const testComprehensiveAPIWithCeleb3dBlack = async () => {
  try {
    console.log('🧪 Testing Comprehensive API with proper imports...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Test the exact same query as the comprehensive API (simplified)
    console.log('📊 Testing comprehensive pricing API query...');
    
    const pricingRecords = await DealerPricing.find({ isActive: true })
      .populate({
        path: 'product',
        select: 'itemName productCode brand category subcategory',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' }
        ]
      })
      .sort({ updatedAt: -1 })
      .limit(50);

    console.log(`Found ${pricingRecords.length} pricing records\n`);

    // Filter out records with null products and enhance records
    const validRecords = pricingRecords.filter(pricing => pricing.product != null);
    console.log(`Valid records (with products): ${validRecords.length}\n`);

    // Look specifically for celeb 3d black
    const celeb3dBlack = validRecords.find(pricing => 
      pricing.product?.itemName?.toLowerCase().includes('celeb') &&
      pricing.product?.itemName?.toLowerCase().includes('3d') &&
      pricing.product?.itemName?.toLowerCase().includes('black')
    );

    if (celeb3dBlack) {
      console.log('🎯 FOUND CELEB 3D BLACK:');
      console.log(`- Product Name: ${celeb3dBlack.product.itemName}`);
      console.log(`- Product Code: ${celeb3dBlack.product.productCode}`);
      console.log(`- Brand: ${celeb3dBlack.product.brand?.name}`);
      console.log(`- Category: ${celeb3dBlack.product.category?.name}`);
      console.log(`- Purchase Price: ₹${celeb3dBlack.purchasePrice}`);
      console.log(`- Selling Price: ₹${celeb3dBlack.sellingPrice}`);
      console.log(`- Gross Margin: ${celeb3dBlack.grossMargin?.toFixed(2)}%`);
      console.log(`- Net Margin: ${celeb3dBlack.netMargin?.toFixed(2)}%`);
      console.log(`- Effective Purchase Price: ₹${celeb3dBlack.effectivePurchasePrice}`);
      console.log(`- Has Sales Discount: ${celeb3dBlack.hasDirectDiscount}`);
      console.log(`- Sales Discount %: ${celeb3dBlack.directDiscountPercentage}%`);
      console.log(`- Has Purchase Discount: ${celeb3dBlack.purchaseDiscountInfo?.hasDirectDiscount || false}`);
      console.log(`- Purchase Discount %: ${celeb3dBlack.purchaseDiscountInfo?.directDiscountPercentage || 0}%`);
    } else {
      console.log('❌ Celeb 3D Black not found in comprehensive results');
    }

    // Show all products for comparison
    console.log('\n📋 All products in comprehensive API results:');
    
    validRecords.forEach((pricing, index) => {
      const pricingObj = {
        _id: pricing._id,
        productId: pricing.product._id,
        productName: pricing.product.itemName,
        productCode: pricing.product.productCode,
        brandId: pricing.product.brand?._id,
        brandName: pricing.product.brand?.name,
        categoryId: pricing.product.category?._id,
        categoryName: pricing.product.category?.name,
        subcategoryId: pricing.product.subcategory?._id,
        subcategoryName: pricing.product.subcategory?.name,
        purchasePrice: pricing.purchasePrice,
        sellingPrice: pricing.sellingPrice,
        grossMargin: pricing.grossMargin,
        netMargin: pricing.netMargin,
        effectivePurchasePrice: pricing.effectivePurchasePrice,
        effectiveSellingPrice: pricing.effectiveSellingPrice,
        hasDirectDiscount: pricing.hasDirectDiscount,
        directDiscountPercentage: pricing.directDiscountPercentage,
        maxDiscountPercentage: pricing.maxDiscountPercentage,
        salesDiscountSource: pricing.salesDiscountSource,
        salesDiscountSourceName: pricing.salesDiscountSourceName,
        purchaseDiscountInfo: pricing.purchaseDiscountInfo,
        hasScheduledChange: pricing.hasScheduledChange,
        nextScheduledPrice: pricing.nextScheduledPrice,
        nextScheduledDate: pricing.nextScheduledDate,
        purchasePriceSource: pricing.purchasePriceSource,
        marginRange: pricing.marginRange
      };

      console.log(`\n${index + 1}. ${pricingObj.productName} (${pricingObj.productCode})`);
      console.log(`   - Brand: ${pricingObj.brandName}`);
      console.log(`   - Category: ${pricingObj.categoryName}`);
      console.log(`   - Purchase: ₹${pricingObj.purchasePrice} → Selling: ₹${pricingObj.sellingPrice}`);
      console.log(`   - Margin: ${pricingObj.grossMargin?.toFixed(2)}%`);
      console.log(`   - Sales Discount: ${pricingObj.hasDirectDiscount ? pricingObj.directDiscountPercentage + '%' : 'None'}`);
      console.log(`   - Purchase Discount: ${pricingObj.purchaseDiscountInfo?.hasDirectDiscount ? pricingObj.purchaseDiscountInfo.directDiscountPercentage + '%' : 'None'}`);
      
      // Highlight if this is celeb 3d black
      if (pricingObj.productName?.toLowerCase().includes('celeb')) {
        console.log(`   🎯 *** THIS IS THE CELEB PRODUCT! ***`);
      }
    });

    // Test what the Enhanced Component would receive
    console.log('\n🚀 What Enhanced Component would receive:');
    console.log(`Total records: ${validRecords.length}`);
    console.log(`Celeb 3D Black found: ${celeb3dBlack ? 'YES' : 'NO'}`);
    
    if (celeb3dBlack) {
      console.log('\n✅ Enhanced Component SHOULD show:');
      console.log(`- Product: ${celeb3dBlack.product.itemName} (${celeb3dBlack.product.productCode})`);
      console.log(`- Brand: ${celeb3dBlack.product.brand?.name}`);
      console.log(`- Purchase Info: ₹${celeb3dBlack.purchasePrice} (${celeb3dBlack.purchaseDiscountInfo?.hasDirectDiscount ? celeb3dBlack.purchaseDiscountInfo.directDiscountPercentage + '% discount' : 'no discount'})`);
      console.log(`- Sales Info: ₹${celeb3dBlack.sellingPrice} (${celeb3dBlack.hasDirectDiscount ? celeb3dBlack.directDiscountPercentage + '% discount' : 'no discount'})`);
      console.log(`- Effective Prices: P: ₹${celeb3dBlack.effectivePurchasePrice}, S: ₹${celeb3dBlack.effectiveSellingPrice}`);
      console.log(`- Margin Analysis: Gross: ${celeb3dBlack.grossMargin?.toFixed(2)}%, Net: ${celeb3dBlack.netMargin?.toFixed(2)}%`);
    }

    console.log('\n✅ Comprehensive API test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the test
testComprehensiveAPIWithCeleb3dBlack();