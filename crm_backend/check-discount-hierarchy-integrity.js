import mongoose from 'mongoose';
import DiscountMapping from './models/DiscountMapping.js';
import Subcategory from './models/Subcategory.js';
import Category from './models/Category.js';
import Brand from './models/Brand.js';
import dotenv from 'dotenv';

dotenv.config();

const checkDiscountHierarchyIntegrity = async () => {
  try {
    console.log('🔧 Checking discount hierarchy integrity...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Find the specific discount that's causing issues
    const discount = await DiscountMapping.findById('696b3a50a6d83e228af10956')
      .populate('brand category subcategory extendedSubcategory1 extendedSubcategory2 product');
    
    if (!discount) {
      console.log('❌ Discount not found');
      return;
    }
    
    console.log('\n📊 Discount Details:');
    console.log(`   ID: ${discount._id}`);
    console.log(`   Name: ${discount.discountName}`);
    console.log(`   Target Type: ${discount.targetType}`);
    console.log(`   Brand: ${discount.brand?.name || 'NULL'} (ID: ${discount.brand?._id || 'NULL'})`);
    console.log(`   Category: ${discount.category?.name || 'NULL'} (ID: ${discount.category?._id || 'NULL'})`);
    console.log(`   Subcategory: ${discount.subcategory?.name || 'NULL'} (ID: ${discount.subcategory?._id || 'NULL'})`);
    
    // Check the subcategory's hierarchy
    if (discount.subcategory) {
      console.log('\n🔍 Checking subcategory hierarchy:');
      const subcategory = await Subcategory.findById(discount.subcategory._id)
        .populate('category brand');
      
      if (subcategory) {
        console.log(`   Subcategory Name: ${subcategory.name}`);
        console.log(`   Subcategory's Category: ${subcategory.category?.name || 'NULL'} (ID: ${subcategory.category?._id || 'NULL'})`);
        console.log(`   Subcategory's Brand: ${subcategory.brand?.name || 'NULL'} (ID: ${subcategory.brand?._id || 'NULL'})`);
        
        // Check if we can get the full hierarchy
        if (subcategory.category) {
          const category = await Category.findById(subcategory.category._id)
            .populate('brand');
          
          if (category) {
            console.log(`   Category Name: ${category.name}`);
            console.log(`   Category's Brand: ${category.brand?.name || 'NULL'} (ID: ${category.brand?._id || 'NULL'})`);
          }
        }
        
        // The issue: The discount should have been created with the full hierarchy
        console.log('\n🔧 What the discount SHOULD have:');
        console.log(`   discount.brand should be: ${subcategory.brand?._id || subcategory.category?.brand?._id || 'NULL'}`);
        console.log(`   discount.category should be: ${subcategory.category?._id || 'NULL'}`);
        console.log(`   discount.subcategory is: ${subcategory._id} ✅`);
        
        // Fix the discount by populating the missing hierarchy
        if (subcategory.brand || subcategory.category?.brand) {
          const brandId = subcategory.brand?._id || subcategory.category?.brand?._id;
          const categoryId = subcategory.category?._id;
          
          console.log('\n🔧 Fixing discount hierarchy...');
          
          const updateData = {};
          if (brandId && !discount.brand) {
            updateData.brand = brandId;
            console.log(`   Setting brand to: ${brandId}`);
          }
          if (categoryId && !discount.category) {
            updateData.category = categoryId;
            console.log(`   Setting category to: ${categoryId}`);
          }
          
          if (Object.keys(updateData).length > 0) {
            await DiscountMapping.findByIdAndUpdate(discount._id, updateData);
            console.log('   ✅ Discount hierarchy fixed!');
            
            // Verify the fix
            const fixedDiscount = await DiscountMapping.findById(discount._id)
              .populate('brand category subcategory');
            
            console.log('\n✅ Verification after fix:');
            console.log(`   Brand: ${fixedDiscount.brand?.name || 'NULL'}`);
            console.log(`   Category: ${fixedDiscount.category?.name || 'NULL'}`);
            console.log(`   Subcategory: ${fixedDiscount.subcategory?.name || 'NULL'}`);
          } else {
            console.log('   ⚠️  No hierarchy data available to fix');
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking discount hierarchy:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

checkDiscountHierarchyIntegrity();