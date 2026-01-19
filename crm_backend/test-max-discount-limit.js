import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DiscountMapping from './models/DiscountMapping.js';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testMaxDiscountLimit = async () => {
  try {
    console.log('🧪 Testing Max Discount Limit Retrieval...\n');
    
    // Find the "ok" discount mapping
    const okDiscount = await DiscountMapping.findOne({ discountName: 'ok' });
    
    if (!okDiscount) {
      console.log('❌ "ok" discount mapping not found');
      return;
    }
    
    console.log('📋 Found "ok" discount mapping:');
    console.log(`   - ID: ${okDiscount._id}`);
    console.log(`   - Name: ${okDiscount.discountName}`);
    console.log(`   - Type: ${okDiscount.discountType}`);
    console.log(`   - Max Discount Percentage: ${okDiscount.maxDiscountPercentage}%`);
    console.log(`   - Direct Discount: ${okDiscount.directDiscountPercentage}%`);
    console.log(`   - Levels: ${okDiscount.levels?.length || 0}`);
    console.log(`   - Target Type: ${okDiscount.targetType}`);
    console.log(`   - Status: ${okDiscount.status}`);
    console.log(`   - Active: ${okDiscount.isActive}`);
    
    // Test the findApplicableDiscounts method
    console.log('\n🔍 Testing findApplicableDiscounts method...');
    
    // Find a product that should match this discount
    const product = await Product.findOne().populate('brand category subcategory extendedSubcategory1');
    
    if (!product) {
      console.log('❌ No product found for testing');
      return;
    }
    
    console.log(`\n📦 Testing with product: ${product.itemName}`);
    console.log(`   - Brand: ${product.brand?.name || 'N/A'}`);
    console.log(`   - Category: ${product.category?.name || 'N/A'}`);
    console.log(`   - Subcategory: ${product.subcategory?.name || 'N/A'}`);
    console.log(`   - Extended Subcategory 1: ${product.extendedSubcategory1?.name || 'N/A'}`);
    
    const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
      product._id,
      'sales',
      'Retailer'
    );
    
    console.log(`\n📊 Found ${applicableDiscounts.length} applicable discount(s):`);
    
    applicableDiscounts.forEach((discount, index) => {
      console.log(`\n   ${index + 1}. ${discount.discountName}:`);
      console.log(`      - Type: ${discount.discountType}`);
      console.log(`      - Max Discount Percentage: ${discount.maxDiscountPercentage}%`);
      console.log(`      - Direct Discount: ${discount.directDiscountPercentage}%`);
      console.log(`      - Levels: ${discount.levels?.length || 0}`);
      console.log(`      - Target Type: ${discount.targetType}`);
      
      if (discount.levels && discount.levels.length > 0) {
        console.log(`      - Available Levels:`);
        discount.levels.forEach(level => {
          console.log(`        * ${level.levelName}: ${level.discountPercentage}%`);
        });
      }
    });
    
    // Check if the "ok" discount is in the applicable discounts
    const okDiscountFound = applicableDiscounts.find(d => d.discountName === 'ok');
    
    if (okDiscountFound) {
      console.log(`\n✅ "ok" discount found in applicable discounts with ${okDiscountFound.maxDiscountPercentage}% max limit`);
    } else {
      console.log(`\n❌ "ok" discount not found in applicable discounts for this product`);
      console.log(`   This might be because the product doesn't match the discount's target criteria`);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
};

const main = async () => {
  await connectDB();
  await testMaxDiscountLimit();
  await mongoose.disconnect();
  console.log('\n🔌 Disconnected from MongoDB');
};

main().catch(console.error);