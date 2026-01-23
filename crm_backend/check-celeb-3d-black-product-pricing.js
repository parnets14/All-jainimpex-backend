// Check celeb 3d black product pricing in both regular and enhanced components
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricing from './models/DealerPricing.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const checkCeleb3dBlackPricing = async () => {
  try {
    console.log('🔍 Checking "celeb 3d black" product pricing...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Search for products with "celeb" and "3d" and "black" in the name
    console.log('📋 Searching for products matching "celeb 3d black"...');
    
    const products = await Product.find({
      $and: [
        { name: { $regex: 'celeb', $options: 'i' } },
        { name: { $regex: '3d', $options: 'i' } },
        { name: { $regex: 'black', $options: 'i' } }
      ]
    })
    .populate('brand', 'name')
    .populate('category', 'name')
    .populate('subcategory', 'name');

    console.log(`Found ${products.length} products matching "celeb 3d black"`);

    if (products.length === 0) {
      // Try broader search
      console.log('\n🔍 Trying broader search for "celeb" products...');
      const celebProducts = await Product.find({
        name: { $regex: 'celeb', $options: 'i' }
      })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .limit(10);

      console.log(`Found ${celebProducts.length} products with "celeb" in name:`);
      celebProducts.forEach((product, index) => {
        console.log(`${index + 1}. ${product.name} (${product.code})`);
        console.log(`   - Brand: ${product.brand?.name || 'N/A'}`);
        console.log(`   - Category: ${product.category?.name || 'N/A'}`);
        console.log(`   - Rate Slabs: ${product.rateSlabs?.length || 0} slabs`);
        if (product.rateSlabs && product.rateSlabs.length > 0) {
          console.log(`   - First Rate: ₹${product.rateSlabs[0].rate}`);
        }
      });

      // Check if any of these have pricing records
      if (celebProducts.length > 0) {
        console.log('\n💰 Checking pricing records for celeb products...');
        
        for (const product of celebProducts) {
          const pricing = await DealerPricing.findOne({ 
            product: product._id, 
            isActive: true 
          });

          console.log(`\n📊 ${product.name} (${product.code}):`);
          if (pricing) {
            console.log(`   ✅ Has pricing record:`);
            console.log(`   - Purchase Price: ₹${pricing.purchasePrice}`);
            console.log(`   - Selling Price: ₹${pricing.sellingPrice}`);
            console.log(`   - Gross Margin: ${pricing.grossMargin?.toFixed(2)}%`);
            console.log(`   - Net Margin: ${pricing.netMargin?.toFixed(2)}%`);
            console.log(`   - Effective Purchase Price: ₹${pricing.effectivePurchasePrice}`);
            console.log(`   - Has Sales Discount: ${pricing.hasDirectDiscount}`);
            console.log(`   - Sales Discount %: ${pricing.directDiscountPercentage}%`);
            console.log(`   - Has Purchase Discount: ${pricing.purchaseDiscountInfo?.hasDirectDiscount || false}`);
            console.log(`   - Purchase Discount %: ${pricing.purchaseDiscountInfo?.directDiscountPercentage || 0}%`);
            console.log(`   - Purchase Price Source: ${pricing.purchasePriceSource}`);
            console.log(`   - Has Scheduled Change: ${pricing.hasScheduledChange}`);
            if (pricing.hasScheduledChange) {
              console.log(`   - Next Scheduled Price: ₹${pricing.nextScheduledPrice}`);
              console.log(`   - Next Scheduled Date: ${pricing.nextScheduledDate}`);
            }
          } else {
            console.log(`   ❌ No pricing record found`);
            console.log(`   - Product Rate Slabs: ${product.rateSlabs?.length || 0}`);
            if (product.rateSlabs && product.rateSlabs.length > 0) {
              console.log(`   - Rate Slab Price: ₹${product.rateSlabs[0].rate}`);
            }
          }
        }
      }
    } else {
      // Found exact matches
      console.log('\n📊 Exact matches found:');
      
      for (const product of products) {
        console.log(`\n${product.name} (${product.code}):`);
        console.log(`- Brand: ${product.brand?.name || 'N/A'}`);
        console.log(`- Category: ${product.category?.name || 'N/A'}`);
        console.log(`- Subcategory: ${product.subcategory?.name || 'N/A'}`);
        
        // Check pricing record
        const pricing = await DealerPricing.findOne({ 
          product: product._id, 
          isActive: true 
        });

        if (pricing) {
          console.log(`✅ Pricing Record Found:`);
          console.log(`- Purchase Price: ₹${pricing.purchasePrice}`);
          console.log(`- Selling Price: ₹${pricing.sellingPrice}`);
          console.log(`- Gross Margin: ${pricing.grossMargin?.toFixed(2)}%`);
          console.log(`- Net Margin: ${pricing.netMargin?.toFixed(2)}%`);
          console.log(`- Effective Purchase Price: ₹${pricing.effectivePurchasePrice}`);
          console.log(`- Has Sales Discount: ${pricing.hasDirectDiscount}`);
          console.log(`- Sales Discount %: ${pricing.directDiscountPercentage}%`);
          console.log(`- Has Purchase Discount: ${pricing.purchaseDiscountInfo?.hasDirectDiscount || false}`);
          console.log(`- Purchase Discount %: ${pricing.purchaseDiscountInfo?.directDiscountPercentage || 0}%`);
        } else {
          console.log(`❌ No pricing record found`);
          if (product.rateSlabs && product.rateSlabs.length > 0) {
            console.log(`- Rate Slab Price: ₹${product.rateSlabs[0].rate}`);
          }
        }
      }
    }

    // Check what the comprehensive API would return
    console.log('\n🔍 Testing comprehensive pricing API response...');
    
    // Simulate the comprehensive API call
    const comprehensivePricing = await DealerPricing.find({ isActive: true })
      .populate('product', 'name code rateSlabs')
      .populate({
        path: 'product',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' }
        ]
      })
      .limit(20);

    console.log(`\n📊 Comprehensive API would return ${comprehensivePricing.length} pricing records:`);
    
    // Look for any celeb products in the comprehensive results
    const celebPricingRecords = comprehensivePricing.filter(pricing => 
      pricing.product?.name?.toLowerCase().includes('celeb')
    );

    if (celebPricingRecords.length > 0) {
      console.log(`\n🎯 Found ${celebPricingRecords.length} celeb products in comprehensive pricing:`);
      
      celebPricingRecords.forEach((pricing, index) => {
        console.log(`\n${index + 1}. ${pricing.product?.name} (${pricing.product?.code})`);
        console.log(`   - Brand: ${pricing.product?.brand?.name}`);
        console.log(`   - Category: ${pricing.product?.category?.name}`);
        console.log(`   - Purchase Price: ₹${pricing.purchasePrice}`);
        console.log(`   - Selling Price: ₹${pricing.sellingPrice}`);
        console.log(`   - Gross Margin: ${pricing.grossMargin?.toFixed(2)}%`);
        console.log(`   - Net Margin: ${pricing.netMargin?.toFixed(2)}%`);
        console.log(`   - Effective Purchase Price: ₹${pricing.effectivePurchasePrice}`);
        console.log(`   - Sales Discount: ${pricing.hasDirectDiscount ? pricing.directDiscountPercentage + '%' : 'None'}`);
        console.log(`   - Purchase Discount: ${pricing.purchaseDiscountInfo?.hasDirectDiscount ? pricing.purchaseDiscountInfo.directDiscountPercentage + '%' : 'None'}`);
      });
    } else {
      console.log('\n❌ No celeb products found in comprehensive pricing records');
      
      // Show first few records for comparison
      console.log('\n📋 First 5 comprehensive pricing records for reference:');
      comprehensivePricing.slice(0, 5).forEach((pricing, index) => {
        console.log(`${index + 1}. ${pricing.product?.name || 'Unknown'} (${pricing.product?.code || 'No Code'})`);
        console.log(`   - Purchase: ₹${pricing.purchasePrice} → Selling: ₹${pricing.sellingPrice}`);
        console.log(`   - Margin: ${pricing.grossMargin?.toFixed(2)}%`);
      });
    }

    console.log('\n✅ Celeb 3D Black product pricing check completed!');

  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the check
checkCeleb3dBlackPricing();