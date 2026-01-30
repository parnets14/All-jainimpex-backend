import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import models
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

async function debugExtendedSubcategoryLevels() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n=== DEBUGGING EXTENDED SUBCATEGORY LEVELS ===\n');

    // 1. Check all extended subcategories and their levels
    console.log('1. CHECKING ALL EXTENDED SUBCATEGORIES:');
    const allExtended = await ExtendedSubcategory.find({})
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level');

    console.log(`   Total extended subcategories: ${allExtended.length}`);
    
    allExtended.forEach(item => {
      console.log(`   - ${item.name} (Level ${item.level})`);
      console.log(`     Brand: ${item.brand?.name || 'NO BRAND'}`);
      console.log(`     Category: ${item.category?.name || 'NO CATEGORY'}`);
      console.log(`     Subcategory: ${item.subcategory?.name || 'NO SUBCATEGORY'}`);
      console.log(`     Parent: ${item.parentExtendedSubcategory?.name || 'NO PARENT'}`);
      console.log(`     ID: ${item._id}`);
      console.log('');
    });

    // 2. Group by level
    console.log('2. GROUPING BY LEVEL:');
    const levelGroups = {};
    allExtended.forEach(item => {
      if (!levelGroups[item.level]) {
        levelGroups[item.level] = [];
      }
      levelGroups[item.level].push(item);
    });

    Object.keys(levelGroups).sort().forEach(level => {
      console.log(`   Level ${level}: ${levelGroups[level].length} items`);
      levelGroups[level].forEach(item => {
        console.log(`     - ${item.name} (ID: ${item._id})`);
      });
    });

    // 3. Test API query for level 1
    console.log('\n3. TESTING LEVEL 1 QUERY:');
    const level1Items = await ExtendedSubcategory.find({ level: 1 })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name');
    
    console.log(`   Level 1 items found: ${level1Items.length}`);
    level1Items.forEach(item => {
      console.log(`     - ${item.name} (ID: ${item._id})`);
    });

    // 4. Test API query for level 2
    console.log('\n4. TESTING LEVEL 2 QUERY:');
    const level2Items = await ExtendedSubcategory.find({ level: 2 })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name');
    
    console.log(`   Level 2 items found: ${level2Items.length}`);
    level2Items.forEach(item => {
      console.log(`     - ${item.name} (ID: ${item._id})`);
    });

    // 5. Test the exact API query that frontend is making
    console.log('\n5. TESTING FRONTEND API QUERIES:');
    
    // Extended subcategories (should return level 1 only)
    console.log('   Extended subcategories API query:');
    const extendedResponse = await ExtendedSubcategory.find({
      status: 'active'
    }).populate('brand', 'name').populate('category', 'name').populate('subcategory', 'name');
    
    console.log(`   All extended subcategories: ${extendedResponse.length}`);
    const level1Only = extendedResponse.filter(item => item.level === 1);
    console.log(`   Level 1 only (filtered): ${level1Only.length}`);
    
    // Level 2 options API query
    console.log('\n   Level 2 options API query:');
    const level2Response = await ExtendedSubcategory.find({
      status: 'active',
      level: 2
    }).populate('brand', 'name').populate('category', 'name').populate('subcategory', 'name');
    
    console.log(`   Level 2 items: ${level2Response.length}`);

    // 6. Check if we need to create test data
    console.log('\n6. DATA RECOMMENDATIONS:');
    if (level1Items.length === 0) {
      console.log('   ⚠️  No Level 1 extended subcategories found!');
      console.log('   📝 Recommendation: Create some Level 1 extended subcategories');
    }
    
    if (level2Items.length === 0) {
      console.log('   ⚠️  No Level 2 extended subcategories found!');
      console.log('   📝 Recommendation: Create some Level 2 extended subcategories under Level 1 items');
    }

    if (level1Items.length > 0 && level2Items.length === 0) {
      console.log('   💡 You can create Level 2 items by setting a Level 1 item as parent');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

debugExtendedSubcategoryLevels();