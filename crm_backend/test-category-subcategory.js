import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const testCategorySubcategory = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // 1. List all categories
    console.log('📋 All Categories:');
    const categories = await Category.find({}).sort({ createdAt: -1 });
    
    if (categories.length === 0) {
      console.log('❌ No categories found');
      return;
    }
    
    categories.forEach((cat, index) => {
      console.log(`   ${index + 1}. ${cat.name} (ID: ${cat._id}) - Status: ${cat.status}`);
    });
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // 2. For each category, check subcategories
    for (const category of categories) {
      console.log(`🔍 Subcategories for "${category.name}" (${category._id}):`);
      
      const subcategories = await Subcategory.find({ 
        category: category._id 
      }).populate('category', 'name');
      
      if (subcategories.length === 0) {
        console.log('   ❌ No subcategories found');
      } else {
        console.log(`   ✅ Found ${subcategories.length} subcategory(ies):`);
        subcategories.forEach((sub, index) => {
          console.log(`      ${index + 1}. ${sub.name} (ID: ${sub._id}) - Status: ${sub.status}`);
          console.log(`         Category: ${sub.category?.name || 'N/A'}`);
        });
      }
      console.log('');
    }
    
    // 3. Test the specific category that was just added
    console.log('🔍 Looking for recently added categories...');
    const recentCategories = await Category.find({}).sort({ createdAt: -1 }).limit(3);
    
    console.log('Recent categories:');
    for (const cat of recentCategories) {
      console.log(`   - ${cat.name} (${cat._id}) - Created: ${cat.createdAt.toLocaleString()}`);
      
      // Check if this category has any subcategories
      const subCount = await Subcategory.countDocuments({ category: cat._id });
      console.log(`     Subcategories: ${subCount}`);
    }
    
    // 4. Check if there are any subcategories without proper category reference
    console.log('\n🔍 Checking for orphaned subcategories...');
    const allSubcategories = await Subcategory.find({}).populate('category');
    const orphanedSubs = allSubcategories.filter(sub => !sub.category);
    
    if (orphanedSubs.length > 0) {
      console.log(`❌ Found ${orphanedSubs.length} orphaned subcategories:`);
      orphanedSubs.forEach(sub => {
        console.log(`   - ${sub.name} (ID: ${sub._id}) - No category reference`);
      });
    } else {
      console.log('✅ No orphaned subcategories found');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testCategorySubcategory();