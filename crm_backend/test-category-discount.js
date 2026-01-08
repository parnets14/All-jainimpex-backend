import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DiscountMapping from './models/DiscountMapping.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Brand from './models/Brand.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

dotenv.config();

const testCategoryDiscount = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // 1. Find "tea" product
    console.log('🔍 Searching for tea product...');
    const teaProducts = await Product.find({
      $or: [
        { itemName: { $regex: /tea/i } },
        { productCode: { $regex: /tea/i } }
      ]
    }).populate('category subcategory brand');

    if (teaProducts.length === 0) {
      console.log('❌ No tea products found');
    } else {
      console.log(`✅ Found ${teaProducts.length} tea product(s):\n`);
      
      for (const product of teaProducts) {
        console.log(`📦 Product: ${product.itemName}`);
        console.log(`   Code: ${product.productCode}`);
        console.log(`   ID: ${product._id}`);
        console.log(`   Category: ${product.category?.name || 'N/A'} (ID: ${product.category?._id})`);
        console.log(`   Subcategory: ${product.subcategory?.name || 'N/A'} (ID: ${product.subcategory?._id})`);
        console.log(`   Brand: ${product.brand?.name || 'N/A'} (ID: ${product.brand?._id})`);
        console.log('');

        // 2. Find all discounts for this product's category
        console.log('🎁 Searching for category discounts...\n');
        
        const now = new Date();
        
        if (product.category) {
          const categoryDiscounts = await DiscountMapping.find({
            targetType: 'category',
            category: product.category._id,
            mappingType: 'sales'
          }).populate('category');
          
          console.log(`   Total category discounts found: ${categoryDiscounts.length}`);
          
          categoryDiscounts.forEach(d => {
            console.log(`\n   📋 Discount: ${d.discountName}`);
            console.log(`      Category: ${d.category?.name}`);
            console.log(`      Type: ${d.discountType}`);
            console.log(`      Status: ${d.status}`);
            console.log(`      Active: ${d.isActive}`);
            console.log(`      Valid From: ${d.validFrom.toLocaleDateString()}`);
            console.log(`      Valid To: ${d.validTo.toLocaleDateString()}`);
            console.log(`      Currently Valid: ${d.validFrom <= now && d.validTo >= now}`);
            
            if (d.discountType === 'direct' || d.discountType === 'both') {
              console.log(`      Direct Discount: ${d.directDiscountPercentage}%`);
            }
            if (d.discountType === 'level_based' || d.discountType === 'both') {
              console.log(`      Levels: ${d.levels.map(l => `${l.levelName}:${l.discountPercentage}%`).join(', ')}`);
            }
            
            // Check if it's approved and active
            const isApplicable = d.status === 'Approved' && 
                                d.isActive && 
                                d.validFrom <= now && 
                                d.validTo >= now;
            console.log(`      ✓ Applicable: ${isApplicable ? 'YES' : 'NO'}`);
          });
        }
        
        // 3. Test the findApplicableDiscounts method
        console.log('\n\n🧪 Testing findApplicableDiscounts method...');
        const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
          product._id,
          'sales',
          null
        );
        
        console.log(`   Result: ${applicableDiscounts.length} applicable discount(s)`);
        if (applicableDiscounts.length > 0) {
          applicableDiscounts.forEach(d => {
            console.log(`\n      ✓ ${d.discountName}`);
            console.log(`        Type: ${d.discountType}`);
            console.log(`        Target: ${d.targetType}`);
            if (d.discountType === 'direct' || d.discountType === 'both') {
              console.log(`        Direct: ${d.directDiscountPercentage}%`);
            }
          });
        } else {
          console.log('      ❌ No applicable discounts found by the method');
          console.log('\n      🔍 Debugging why...');
          
          // Check if product has all required fields populated
          console.log(`      Product category populated: ${!!product.category}`);
          console.log(`      Product subcategory populated: ${!!product.subcategory}`);
          console.log(`      Product brand populated: ${!!product.brand}`);
        }
        
        console.log('\n' + '='.repeat(80) + '\n');
      }
    }

    // 4. List all active category discounts
    console.log('📊 All Active Category Discounts:\n');
    const allCategoryDiscounts = await DiscountMapping.find({
      targetType: 'category',
      mappingType: 'sales',
      status: 'Approved',
      isActive: true
    }).populate('category');
    
    console.log(`Total: ${allCategoryDiscounts.length} active category discounts\n`);
    allCategoryDiscounts.forEach(d => {
      console.log(`   ${d.discountName}`);
      console.log(`      Category: ${d.category?.name} (ID: ${d.category?._id})`);
      if (d.discountType === 'direct' || d.discountType === 'both') {
        console.log(`      Direct: ${d.directDiscountPercentage}%`);
      }
      console.log(`      Valid: ${d.validFrom.toLocaleDateString()} - ${d.validTo.toLocaleDateString()}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testCategoryDiscount();
