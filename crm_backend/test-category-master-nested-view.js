#!/usr/bin/env node

/**
 * Test Category Master "View Nested Levels" functionality
 * Issue: When clicking on Level 2 item and selecting "View Nested Levels",
 * it shows both Level 2 and Level 3 items instead of just Level 3 items (children)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URL || 'mongodb://localhost:27017/jain_impex_crm';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function testNestedViewFlow() {
  console.log('\n🔍 Testing Category Master "View Nested Levels" Flow\n');
  console.log('═'.repeat(80));
  
  try {
    // Simulate the user flow:
    // 1. User is at subcategory level
    // 2. User clicks on a subcategory
    // 3. User sees Level 1 items
    // 4. User clicks on a Level 1 item
    // 5. User clicks "View Nested Levels"
    // 6. Should see ONLY Level 2 items (children of Level 1)
    
    console.log('\n📋 STEP 1: Get a subcategory');
    const subcategory = await Subcategory.findOne({ name: /Test Subcategory/ });
    if (!subcategory) {
      console.log('❌ No test subcategory found');
      return;
    }
    console.log(`✅ Found subcategory: ${subcategory.name} (${subcategory._id})`);
    
    // Step 2: Get Level 1 items for this subcategory
    console.log('\n📋 STEP 2: Get Level 1 items for this subcategory');
    const level1Items = await ExtendedSubcategory.find({
      subcategory: subcategory._id,
      parentExtendedSubcategory: null,
      level: 1,
      status: 'active'
    });
    console.log(`✅ Found ${level1Items.length} Level 1 items`);
    level1Items.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.name} (${item._id})`);
    });
    
    if (level1Items.length === 0) {
      console.log('❌ No Level 1 items found');
      return;
    }
    
    // Step 3: User clicks on first Level 1 item and selects "View Nested Levels"
    const selectedLevel1 = level1Items[0];
    console.log(`\n📋 STEP 3: User clicks on Level 1 item: ${selectedLevel1.name}`);
    console.log(`   ID: ${selectedLevel1._id}`);
    
    // Step 4: Simulate the API call that happens when "View Nested Levels" is clicked
    console.log('\n📋 STEP 4: API call - getExtendedSubcategoriesByParent');
    console.log(`   Endpoint: GET /api/extended-subcategories/by-parent/${selectedLevel1._id}`);
    
    const level2Items = await ExtendedSubcategory.find({
      parentExtendedSubcategory: selectedLevel1._id,
      status: 'active'
    })
    .populate('subcategory', 'name')
    .populate('parentExtendedSubcategory', 'name level')
    .sort({ name: 1 });
    
    console.log(`\n✅ API returned ${level2Items.length} items:`);
    level2Items.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.name}`);
      console.log(`   ID: ${item._id}`);
      console.log(`   Level: ${item.level}`);
      console.log(`   Parent: ${item.parentExtendedSubcategory?.name} (Level ${item.parentExtendedSubcategory?.level})`);
      console.log(`   Subcategory: ${item.subcategory?.name}`);
      
      // Check if this is the correct level
      if (item.level !== 2) {
        console.log(`   ⚠️  WARNING: Expected Level 2 but got Level ${item.level}!`);
      }
      
      // Check if parent is correct
      if (item.parentExtendedSubcategory?._id.toString() !== selectedLevel1._id.toString()) {
        console.log(`   ⚠️  WARNING: Parent mismatch!`);
      }
    });
    
    // Now test clicking on a Level 2 item
    if (level2Items.length > 0) {
      const selectedLevel2 = level2Items[0];
      console.log(`\n\n📋 STEP 5: User clicks on Level 2 item: ${selectedLevel2.name}`);
      console.log(`   ID: ${selectedLevel2._id}`);
      console.log(`   Level: ${selectedLevel2.level}`);
      
      console.log('\n📋 STEP 6: User clicks "View Nested Levels" on Level 2 item');
      console.log(`   Endpoint: GET /api/extended-subcategories/by-parent/${selectedLevel2._id}`);
      
      const level3Items = await ExtendedSubcategory.find({
        parentExtendedSubcategory: selectedLevel2._id,
        status: 'active'
      })
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level')
      .sort({ name: 1 });
      
      console.log(`\n✅ API returned ${level3Items.length} items:`);
      
      if (level3Items.length === 0) {
        console.log('   ℹ️  No Level 3 items found (this is OK if none exist)');
      } else {
        level3Items.forEach((item, index) => {
          console.log(`\n${index + 1}. ${item.name}`);
          console.log(`   ID: ${item._id}`);
          console.log(`   Level: ${item.level}`);
          console.log(`   Parent: ${item.parentExtendedSubcategory?.name} (Level ${item.parentExtendedSubcategory?.level})`);
          
          // Check if this is the correct level
          if (item.level !== 3) {
            console.log(`   ❌ ERROR: Expected Level 3 but got Level ${item.level}!`);
          }
          
          // Check if parent is correct
          if (item.parentExtendedSubcategory?._id.toString() !== selectedLevel2._id.toString()) {
            console.log(`   ❌ ERROR: Parent should be ${selectedLevel2.name} but is ${item.parentExtendedSubcategory?.name}!`);
          }
        });
      }
      
      // Check if any Level 2 items are being returned (this would be the bug)
      const wrongLevelItems = level3Items.filter(item => item.level === 2);
      if (wrongLevelItems.length > 0) {
        console.log(`\n❌ BUG FOUND: ${wrongLevelItems.length} Level 2 items in Level 3 results!`);
        wrongLevelItems.forEach(item => {
          console.log(`   - ${item.name} (Level ${item.level})`);
        });
      } else {
        console.log('\n✅ No Level 2 items in Level 3 results (correct!)');
      }
    }
    
    // Summary
    console.log('\n\n📊 SUMMARY:');
    console.log('═'.repeat(80));
    console.log(`✅ Level 1 items: ${level1Items.length}`);
    console.log(`✅ Level 2 items (children of Level 1): ${level2Items.length}`);
    if (level2Items.length > 0) {
      const level3Count = await ExtendedSubcategory.countDocuments({
        parentExtendedSubcategory: level2Items[0]._id,
        status: 'active'
      });
      console.log(`✅ Level 3 items (children of first Level 2): ${level3Count}`);
    }
    
    console.log('\n💡 Expected Behavior:');
    console.log('   - Clicking "View Nested Levels" on Level 1 → Shows ONLY Level 2 items');
    console.log('   - Clicking "View Nested Levels" on Level 2 → Shows ONLY Level 3 items');
    console.log('   - Clicking "View Nested Levels" on Level 3 → Shows ONLY Level 4 items');
    console.log('   - And so on...');
    
    console.log('\n🐛 If you see Level 2 items when viewing Level 3:');
    console.log('   - Check the frontend fetchExtendedItems function');
    console.log('   - Verify the correct parent ID is being passed');
    console.log('   - Check if the API endpoint is being called correctly');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function runTest() {
  await connectDB();
  await testNestedViewFlow();
  await mongoose.disconnect();
  console.log('\n✅ Disconnected from MongoDB\n');
}

runTest().catch(console.error);
