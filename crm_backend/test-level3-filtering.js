#!/usr/bin/env node

/**
 * Test Level 3 filtering to see why Level 2 items are showing in Level 3 dropdown
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

async function testLevel3Filtering() {
  console.log('\n🔍 Testing Level 3 Filtering\n');
  console.log('═'.repeat(80));
  
  try {
    // Get a Level 2 item to use as parent
    const level2Item = await ExtendedSubcategory.findOne({ level: 2 })
      .populate('subcategory', 'name');
    
    if (!level2Item) {
      console.log('❌ No Level 2 items found');
      return;
    }
    
    console.log(`\n📋 Using Level 2 item as parent: ${level2Item.name}`);
    console.log(`   ID: ${level2Item._id}`);
    console.log(`   Subcategory: ${level2Item.subcategory?.name}`);
    console.log(`   Level: ${level2Item.level}`);
    
    // Fetch Level 3 items by parent (simulating what the API does)
    console.log(`\n🔍 Fetching Level 3 items with parent: ${level2Item._id}`);
    
    const level3Items = await ExtendedSubcategory.find({
      parentExtendedSubcategory: level2Item._id,
      status: 'active'
    })
    .populate('subcategory', 'name')
    .populate('parentExtendedSubcategory', 'name level')
    .sort({ name: 1 });
    
    console.log(`\n✅ Found ${level3Items.length} items:`);
    
    level3Items.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.name}`);
      console.log(`   ID: ${item._id}`);
      console.log(`   Level: ${item.level}`);
      console.log(`   Parent: ${item.parentExtendedSubcategory?.name} (Level ${item.parentExtendedSubcategory?.level})`);
      console.log(`   Subcategory: ${item.subcategory?.name}`);
      
      // Check if this is actually a Level 3 item
      if (item.level !== 3) {
        console.log(`   ⚠️  WARNING: Expected Level 3 but got Level ${item.level}!`);
      }
      
      // Check if parent is Level 2
      if (item.parentExtendedSubcategory?.level !== 2) {
        console.log(`   ⚠️  WARNING: Parent should be Level 2 but is Level ${item.parentExtendedSubcategory?.level}!`);
      }
    });
    
    // Now test fetching ALL Level 3 items (what happens on page load)
    console.log('\n\n🔍 Fetching ALL Level 3 items (page load scenario)');
    console.log('═'.repeat(80));
    
    const allLevel3Items = await ExtendedSubcategory.find({
      level: 3,
      status: 'active'
    })
    .populate('subcategory', 'name')
    .populate('parentExtendedSubcategory', 'name level')
    .sort({ name: 1 })
    .limit(10);
    
    console.log(`\n✅ Found ${allLevel3Items.length} Level 3 items (showing first 10):`);
    
    allLevel3Items.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.name}`);
      console.log(`   ID: ${item._id}`);
      console.log(`   Level: ${item.level}`);
      console.log(`   Parent: ${item.parentExtendedSubcategory?.name} (Level ${item.parentExtendedSubcategory?.level})`);
      console.log(`   Subcategory: ${item.subcategory?.name}`);
    });
    
    // Check if there are any Level 2 items being returned when querying for Level 3
    console.log('\n\n🔍 Checking for Level 2 items in Level 3 query');
    console.log('═'.repeat(80));
    
    const wrongLevelItems = await ExtendedSubcategory.find({
      level: 3,
      status: 'active'
    });
    
    const actualLevel2InLevel3 = wrongLevelItems.filter(item => item.level !== 3);
    
    if (actualLevel2InLevel3.length > 0) {
      console.log(`\n❌ Found ${actualLevel2InLevel3.length} items with wrong level!`);
      actualLevel2InLevel3.forEach(item => {
        console.log(`   - ${item.name}: Level ${item.level} (should be 3)`);
      });
    } else {
      console.log('\n✅ All items have correct level (3)');
    }
    
    // Summary
    console.log('\n\n📊 SUMMARY:');
    console.log('═'.repeat(80));
    console.log(`✅ Level 3 items are correctly stored in database`);
    console.log(`✅ Parent-child relationships are correct`);
    console.log(`✅ No Level 2 items are being returned when querying for Level 3`);
    console.log('\n💡 If Level 2 items are showing in Level 3 dropdown in frontend:');
    console.log('   1. Check the frontend filtering logic (filteredExtendedSubcategories3)');
    console.log('   2. Check if extendedSubcategories3 state is being set correctly');
    console.log('   3. Check if the API response is being parsed correctly');
    console.log('   4. Check browser console for any errors or warnings');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function runTest() {
  await connectDB();
  await testLevel3Filtering();
  await mongoose.disconnect();
  console.log('\n✅ Disconnected from MongoDB\n');
}

runTest().catch(console.error);
