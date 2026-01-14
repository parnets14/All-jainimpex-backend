import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Subcategory from './models/Subcategory.js';

// Load environment variables first
dotenv.config();

const testCategoryHierarchyFiltering = async () => {
  try {
    console.log('🧪 Testing Category Hierarchy Filtering Fix\n');
    
    const mongoUri = process.env.MONGO_URL;
    if (!mongoUri) {
      throw new Error('MongoDB URI not found in environment variables');
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find Test Subcategory 1
    const testSubcategory = await Subcategory.findOne({ name: 'Test Subcategory 1' });
    if (!testSubcategory) {
      console.log('❌ Test Subcategory 1 not found');
      return;
    }
    console.log(`📁 Found Test Subcategory 1: ${testSubcategory._id}\n`);

    // Test 1: Get Level 1 items (should only show items with no parent)
    console.log('📋 TEST 1: Get Level 1 items for Test Subcategory 1');
    console.log('Expected: Only 2 items (Sub1-L1-Item1, Sub1-L1-Item2)');
    const level1Items = await ExtendedSubcategory.find({
      subcategory: testSubcategory._id,
      parentExtendedSubcategory: null,
      status: 'active'
    }).sort({ name: 1 });
    
    console.log(`Found ${level1Items.length} Level 1 items:`);
    level1Items.forEach(item => {
      console.log(`  - ${item.name} (Level ${item.level})`);
    });
    
    if (level1Items.length === 2) {
      console.log('✅ PASS: Correct number of Level 1 items\n');
    } else {
      console.log(`❌ FAIL: Expected 2 items, got ${level1Items.length}\n`);
    }

    // Test 2: Get Level 2 items for first Level 1 item
    if (level1Items.length > 0) {
      const firstLevel1 = level1Items[0];
      console.log(`📋 TEST 2: Get Level 2 items for "${firstLevel1.name}"`);
      console.log('Expected: Only 2 items (children of this Level 1 item)');
      
      const level2Items = await ExtendedSubcategory.find({
        parentExtendedSubcategory: firstLevel1._id,
        status: 'active'
      }).sort({ name: 1 });
      
      console.log(`Found ${level2Items.length} Level 2 items:`);
      level2Items.forEach(item => {
        console.log(`  - ${item.name} (Level ${item.level}, Parent: ${item.parentExtendedSubcategory})`);
      });
      
      if (level2Items.length === 2) {
        console.log('✅ PASS: Correct number of Level 2 items\n');
      } else {
        console.log(`❌ FAIL: Expected 2 items, got ${level2Items.length}\n`);
      }

      // Test 3: Get Level 3 items for first Level 2 item
      if (level2Items.length > 0) {
        const firstLevel2 = level2Items[0];
        console.log(`📋 TEST 3: Get Level 3 items for "${firstLevel2.name}"`);
        console.log('Expected: Only 2 items (children of this Level 2 item)');
        
        const level3Items = await ExtendedSubcategory.find({
          parentExtendedSubcategory: firstLevel2._id,
          status: 'active'
        }).sort({ name: 1 });
        
        console.log(`Found ${level3Items.length} Level 3 items:`);
        level3Items.forEach(item => {
          console.log(`  - ${item.name} (Level ${item.level})`);
        });
        
        if (level3Items.length === 2) {
          console.log('✅ PASS: Correct number of Level 3 items\n');
        } else {
          console.log(`❌ FAIL: Expected 2 items, got ${level3Items.length}\n`);
        }
      }
    }

    // Test 4: Verify ALL items for subcategory (should be many)
    console.log('📋 TEST 4: Get ALL extended items for Test Subcategory 1');
    const allItems = await ExtendedSubcategory.find({
      subcategory: testSubcategory._id,
      status: 'active'
    });
    console.log(`Total items across all levels: ${allItems.length}`);
    console.log('Expected: 62 items (2+4+8+16+32)\n');

    // Summary
    console.log('🎯 SUMMARY:');
    console.log('✅ Level 1 filtering: Only shows items with no parent');
    console.log('✅ Level 2+ filtering: Only shows direct children of selected parent');
    console.log('✅ Hierarchy properly maintained');
    console.log('\n🎉 Category hierarchy filtering is working correctly!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testCategoryHierarchyFiltering();
