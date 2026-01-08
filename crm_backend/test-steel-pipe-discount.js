import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DiscountMapping from './models/DiscountMapping.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Brand from './models/Brand.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

dotenv.config();

const testSteelPipeDiscount = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // 1. Find Steel Pipe product
    console.log('🔍 Searching for Steel Pipe product...');
    const steelPipeProducts = await Product.find({
      itemName: { $regex: /steel.*pipe/i }
    }).populate('category subcategory brand');

    if (steelPipeProducts.length === 0) {
      console.log('❌ No Steel Pipe products found');
      console.log('\n📋 Searching for products with "pipe" in name:');
      const pipeProducts = await Product.find({
        itemName: { $regex: /pipe/i }
      }).limit(10);
      pipeProducts.forEach(p => {
        console.log(`   - ${p.itemName} (${p.productCode})`);
      });
    } else {
      console.log(`✅ Found ${steelPipeProducts.length} Steel Pipe product(s):\n`);
      
      for (const product of steelPipeProducts) {
        console.log(`📦 Product: ${product.itemName}`);
        console.log(`   Code: ${product.productCode}`);
        console.log(`   ID: ${product._id}`);
        console.log(`   Category: ${product.category?.name || 'N/A'}`);
        console.log(`   Subcategory: ${product.subcategory?.name || 'N/A'}`);
        console.log(`   Brand: ${product.brand?.name || 'N/A'}`);
        console.log('');

        // 2. Find all discounts for this product
        console.log('🎁 Searching for applicable discounts...\n');
        
        const now = new Date();
        
        // Check product-specific discounts
        const productDiscounts = await DiscountMapping.find({
          targetType: 'product',
          product: product._id,
          mappingType: 'sales',
          status: 'Approved',
          isActive: true,
          validFrom: { $lte: now },
          validTo: { $gte: now }
        });
        
        console.log(`   Product-specific discounts: ${productDiscounts.length}`);
        productDiscounts.forEach(d => {
          console.log(`      ✓ ${d.discountName} - ${d.discountType}`);
          if (d.discountType === 'direct' || d.discountType === 'both') {
            console.log(`        Direct: ${d.directDiscountPercentage}%`);
          }
          if (d.discountType === 'level_based' || d.discountType === 'both') {
            console.log(`        Levels: ${d.levels.map(l => `${l.levelName}:${l.discountPercentage}%`).join(', ')}`);
          }
          console.log(`        Status: ${d.status}, Active: ${d.isActive}`);
          console.log(`        Valid: ${d.validFrom.toLocaleDateString()} - ${d.validTo.toLocaleDateString()}`);
        });
        
        // Check brand discounts
        if (product.brand) {
          const brandDiscounts = await DiscountMapping.find({
            targetType: 'brand',
            brand: product.brand._id,
            mappingType: 'sales',
            status: 'Approved',
            isActive: true,
            validFrom: { $lte: now },
            validTo: { $gte: now }
          });
          
          console.log(`   Brand discounts: ${brandDiscounts.length}`);
          brandDiscounts.forEach(d => {
            console.log(`      ✓ ${d.discountName} - ${d.discountType}`);
            if (d.discountType === 'direct' || d.discountType === 'both') {
              console.log(`        Direct: ${d.directDiscountPercentage}%`);
            }
          });
        }
        
        // Check subcategory discounts
        if (product.subcategory) {
          const subcategoryDiscounts = await DiscountMapping.find({
            targetType: 'subcategory',
            subcategory: product.subcategory._id,
            mappingType: 'sales',
            status: 'Approved',
            isActive: true,
            validFrom: { $lte: now },
            validTo: { $gte: now }
          });
          
          console.log(`   Subcategory discounts: ${subcategoryDiscounts.length}`);
          subcategoryDiscounts.forEach(d => {
            console.log(`      ✓ ${d.discountName} - ${d.discountType}`);
            if (d.discountType === 'direct' || d.discountType === 'both') {
              console.log(`        Direct: ${d.directDiscountPercentage}%`);
            }
          });
        }
        
        // Check category discounts
        if (product.category) {
          const categoryDiscounts = await DiscountMapping.find({
            targetType: 'category',
            category: product.category._id,
            mappingType: 'sales',
            status: 'Approved',
            isActive: true,
            validFrom: { $lte: now },
            validTo: { $gte: now }
          });
          
          console.log(`   Category discounts: ${categoryDiscounts.length}`);
          categoryDiscounts.forEach(d => {
            console.log(`      ✓ ${d.discountName} - ${d.discountType}`);
            if (d.discountType === 'direct' || d.discountType === 'both') {
              console.log(`        Direct: ${d.directDiscountPercentage}%`);
            }
          });
        }
        
        // 3. Check for 4% discount specifically
        console.log('\n🔍 Searching for 4% discounts...');
        const fourPercentDiscounts = await DiscountMapping.find({
          $or: [
            { directDiscountPercentage: 4 },
            { 'levels.discountPercentage': 4 }
          ],
          mappingType: 'sales'
        }).populate('product brand category subcategory');
        
        console.log(`   Found ${fourPercentDiscounts.length} discount(s) with 4%:`);
        fourPercentDiscounts.forEach(d => {
          console.log(`      - ${d.discountName}`);
          console.log(`        Target: ${d.targetType}`);
          console.log(`        Status: ${d.status}, Active: ${d.isActive}`);
          console.log(`        Valid: ${d.validFrom.toLocaleDateString()} - ${d.validTo.toLocaleDateString()}`);
          if (d.product) console.log(`        Product: ${d.product.itemName}`);
          if (d.brand) console.log(`        Brand: ${d.brand.name}`);
          if (d.category) console.log(`        Category: ${d.category.name}`);
          if (d.subcategory) console.log(`        Subcategory: ${d.subcategory.name}`);
        });
        
        // 4. Test the findApplicableDiscounts method
        console.log('\n🧪 Testing findApplicableDiscounts method...');
        const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
          product._id,
          'sales',
          null
        );
        
        console.log(`   Result: ${applicableDiscounts.length} applicable discount(s)`);
        applicableDiscounts.forEach(d => {
          console.log(`      ✓ ${d.discountName}`);
          console.log(`        Type: ${d.discountType}`);
          console.log(`        Target: ${d.targetType} - ${d.targetInfo?.targetName}`);
          if (d.discountType === 'direct' || d.discountType === 'both') {
            console.log(`        Direct: ${d.directDiscountPercentage}%`);
          }
        });
        
        console.log('\n' + '='.repeat(80) + '\n');
      }
    }

    // 5. List all active sales discounts
    console.log('📊 All Active Sales Discounts:\n');
    const allDiscounts = await DiscountMapping.find({
      mappingType: 'sales',
      status: 'Approved',
      isActive: true
    }).populate('product brand category subcategory');
    
    console.log(`Total: ${allDiscounts.length} active sales discounts\n`);
    allDiscounts.forEach(d => {
      console.log(`   ${d.discountName}`);
      console.log(`      Target: ${d.targetType}`);
      if (d.product) console.log(`      Product: ${d.product.itemName}`);
      if (d.brand) console.log(`      Brand: ${d.brand.name}`);
      if (d.category) console.log(`      Category: ${d.category.name}`);
      if (d.subcategory) console.log(`      Subcategory: ${d.subcategory.name}`);
      if (d.discountType === 'direct' || d.discountType === 'both') {
        console.log(`      Direct: ${d.directDiscountPercentage}%`);
      }
      console.log(`      Valid: ${d.validFrom.toLocaleDateString()} - ${d.validTo.toLocaleDateString()}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testSteelPipeDiscount();
