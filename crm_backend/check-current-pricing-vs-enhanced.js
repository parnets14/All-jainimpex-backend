// Check current pricing records vs enhanced component data
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricing from './models/DealerPricing.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const checkCurrentPricingVsEnhanced = async () => {
  try {
    console.log('🔍 Checking current pricing records vs enhanced component...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // First, let's see what products we actually have
    console.log('📋 Checking all products in database...');
    
    const allProducts = await Product.find({})
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .limit(20);

    console.log(`Found ${allProducts.length} products in database:`);
    
    allProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} (${product.code})`);
      console.log(`   - Brand: ${product.brand?.name || 'N/A'}`);
      console.log(`   - Category: ${product.category?.name || 'N/A'}`);
      if (product.rateSlabs && product.rateSlabs.length > 0) {
        console.log(`   - Rate: ₹${product.rateSlabs[0].rate}`);
      }
    });

    // Now check what the regular dealer pricing API returns
    console.log('\n📊 Checking regular dealer pricing API...');
    
    const regularPricing = await DealerPricing.find({ isActive: true })
      .populate('product', 'name code rateSlabs')
      .populate({
        path: 'product',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' }
        ]
      });

    console.log(`Regular pricing API returns ${regularPricing.length} records:`);
    
    regularPricing.forEach((pricing, index) => {
      console.log(`\n${index + 1}. Product: ${pricing.product?.name || 'NULL'} (${pricing.product?.code || 'NULL'})`);
      console.log(`   - Product ID: ${pricing.product?._id || 'NULL'}`);
      console.log(`   - Brand: ${pricing.product?.brand?.name || 'NULL'}`);
      console.log(`   - Category: ${pricing.product?.category?.name || 'NULL'}`);
      console.log(`   - Purchase Price: ₹${pricing.purchasePrice}`);
      console.log(`   - Selling Price: ₹${pricing.sellingPrice}`);
      console.log(`   - Gross Margin: ${pricing.grossMargin?.toFixed(2)}%`);
    });

    // Check if there are products without pricing records
    console.log('\n🔍 Checking products without pricing records...');
    
    const pricingProductIds = regularPricing.map(p => p.product?._id?.toString()).filter(Boolean);
    const allProductIds = allProducts.map(p => p._id.toString());
    
    const productsWithoutPricing = allProducts.filter(product => 
      !pricingProductIds.includes(product._id.toString())
    );

    console.log(`\nFound ${productsWithoutPricing.length} products without pricing records:`);
    
    productsWithoutPricing.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} (${product.code})`);
      console.log(`   - Brand: ${product.brand?.name || 'N/A'}`);
      if (product.rateSlabs && product.rateSlabs.length > 0) {
        console.log(`   - Rate Slab: ₹${product.rateSlabs[0].rate}`);
      }
    });

    // Now test the comprehensive API endpoint simulation
    console.log('\n🚀 Testing comprehensive API endpoint simulation...');
    
    // This simulates what the comprehensive endpoint should return
    const comprehensiveData = [];
    
    for (const pricing of regularPricing) {
      if (pricing.product) {
        const pricingObj = {
          _id: pricing._id,
          productId: pricing.product._id,
          productName: pricing.product.name,
          productCode: pricing.product.code,
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
        
        comprehensiveData.push(pricingObj);
      }
    }

    console.log(`\nComprehensive API simulation returns ${comprehensiveData.length} records:`);
    
    comprehensiveData.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.productName} (${item.productCode})`);
      console.log(`   - Brand: ${item.brandName}`);
      console.log(`   - Category: ${item.categoryName}`);
      console.log(`   - Purchase: ₹${item.purchasePrice} → Selling: ₹${item.sellingPrice}`);
      console.log(`   - Margin: ${item.grossMargin?.toFixed(2)}%`);
      console.log(`   - Sales Discount: ${item.hasDirectDiscount ? item.directDiscountPercentage + '%' : 'None'}`);
      console.log(`   - Purchase Discount: ${item.purchaseDiscountInfo?.hasDirectDiscount ? item.purchaseDiscountInfo.directDiscountPercentage + '%' : 'None'}`);
    });

    // Search for specific products from the screenshot
    console.log('\n🔍 Searching for products from screenshot...');
    
    const screenshotProducts = [
      'brook rg sink cock',
      'coyal', 
      'canon',
      'brook rg pillar cock',
      'vibe sink cock',
      'celeb 3d black'
    ];

    for (const searchTerm of screenshotProducts) {
      console.log(`\n🔍 Searching for "${searchTerm}"...`);
      
      const foundProducts = allProducts.filter(product => 
        product.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      if (foundProducts.length > 0) {
        console.log(`   ✅ Found ${foundProducts.length} matches:`);
        foundProducts.forEach(product => {
          console.log(`   - ${product.name} (${product.code})`);
          
          // Check if it has pricing
          const hasPricing = regularPricing.find(p => p.product?._id?.toString() === product._id.toString());
          if (hasPricing) {
            console.log(`     ✅ Has pricing: ₹${hasPricing.purchasePrice} → ₹${hasPricing.sellingPrice}`);
          } else {
            console.log(`     ❌ No pricing record`);
          }
        });
      } else {
        console.log(`   ❌ No matches found`);
      }
    }

    console.log('\n✅ Current pricing vs enhanced component check completed!');

  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the check
checkCurrentPricingVsEnhanced();