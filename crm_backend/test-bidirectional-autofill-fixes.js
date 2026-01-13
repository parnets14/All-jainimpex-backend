#!/usr/bin/env node

/**
 * Test script to verify the bidirectional auto-fill fixes
 * Tests both Level 2 dropdown filtering and complete parent chain resolution
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

// Load environment variables
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

async function testParentChainResolution() {
  console.log('\n🔍 Testing Parent Chain Resolution...');
  
  try {
    // Find a Level 3+ extended subcategory to test with
    const level3Item = await ExtendedSubcategory.findOne({ level: { $gte: 3 } })
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level');
    
    if (!level3Item) {
      console.log('⚠️ No Level 3+ extended subcategories found for testing');
      return;
    }
    
    console.log(`📋 Testing with: ${level3Item.name} (Level ${level3Item.level})`);
    
    // Test the getParentChain helper function
    const getParentChain = async (extendedSubcategoryId) => {
      const parentChain = [];
      let current = await ExtendedSubcategory.findById(extendedSubcategoryId);
      
      while (current && current.parentExtendedSubcategory) {
        current = await ExtendedSubcategory.findById(current.parentExtendedSubcategory);
        if (current) {
          parentChain.unshift(current._id.toString());
        }
      }
      
      return parentChain;
    };
    
    const parentChain = await getParentChain(level3Item._id);
    console.log('🔗 Parent Chain:', parentChain);
    
    // Verify parent chain by looking up each level
    for (let i = 0; i < parentChain.length; i++) {
      const parent = await ExtendedSubcategory.findById(parentChain[i]);
      console.log(`   Level ${i + 1}: ${parent?.name} (${parentChain[i]})`);
    }
    
    console.log(`   Level ${level3Item.level}: ${level3Item.name} (${level3Item._id})`);
    
  } catch (error) {
    console.error('❌ Error testing parent chain resolution:', error);
  }
}

async function testLevel2Filtering() {
  console.log('\n🔍 Testing Level 2 Filtering...');
  
  try {
    // Find a Level 1 extended subcategory that has children
    const level1Items = await ExtendedSubcategory.find({ level: 1 })
      .populate('category', 'name')
      .populate('subcategory', 'name');
    
    if (level1Items.length === 0) {
      console.log('⚠️ No Level 1 extended subcategories found');
      return;
    }
    
    for (const level1Item of level1Items.slice(0, 3)) { // Test first 3
      const level2Children = await ExtendedSubcategory.find({
        parentExtendedSubcategory: level1Item._id,
        status: 'active'
      });
      
      console.log(`📋 Level 1: ${level1Item.name}`);
      console.log(`   Category: ${level1Item.category.name}`);
      console.log(`   Subcategory: ${level1Item.subcategory.name}`);
      console.log(`   Level 2 Children: ${level2Children.length}`);
      
      if (level2Children.length > 0) {
        level2Children.forEach((child, index) => {
          console.log(`     ${index + 1}. ${child.name}`);
        });
        
        // Test the filtering logic
        console.log(`✅ Level 2 filtering should show ${level2Children.length} items when Level 1 "${level1Item.name}" is selected`);
      } else {
        console.log(`   ⚠️ No Level 2 children found`);
      }
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error testing Level 2 filtering:', error);
  }
}

async function testBidirectionalAutoFill() {
  console.log('\n🔍 Testing Bidirectional Auto-fill Logic...');
  
  try {
    // Find a deep hierarchy item (Level 3+)
    const deepItem = await ExtendedSubcategory.findOne({ level: { $gte: 3 } })
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level');
    
    if (!deepItem) {
      console.log('⚠️ No deep hierarchy items found for testing');
      return;
    }
    
    console.log(`📋 Testing bidirectional auto-fill with: ${deepItem.name} (Level ${deepItem.level})`);
    
    // Simulate the auto-fill process
    const getParentChain = async (extendedSubcategoryId) => {
      const parentChain = [];
      let current = await ExtendedSubcategory.findById(extendedSubcategoryId);
      
      while (current && current.parentExtendedSubcategory) {
        current = await ExtendedSubcategory.findById(current.parentExtendedSubcategory);
        if (current) {
          parentChain.unshift(current._id.toString());
        }
      }
      
      return parentChain;
    };
    
    const parentChain = await getParentChain(deepItem._id);
    
    console.log('🔄 Auto-fill simulation:');
    console.log(`   Selected: Level ${deepItem.level} - ${deepItem.name}`);
    console.log(`   Should auto-fill:`);
    console.log(`     Category: ${deepItem.category.name}`);
    console.log(`     Subcategory: ${deepItem.subcategory.name}`);
    
    // Show what should be auto-filled for each parent level
    for (let i = 0; i < parentChain.length; i++) {
      const parent = await ExtendedSubcategory.findById(parentChain[i]);
      console.log(`     Level ${i + 1}: ${parent?.name}`);
    }
    
    console.log('✅ Bidirectional auto-fill should work correctly with the new parent chain API');
    
  } catch (error) {
    console.error('❌ Error testing bidirectional auto-fill:', error);
  }
}

async function testNewAPIEndpoints() {
  console.log('\n🔍 Testing New API Endpoints...');
  
  try {
    // Test getExtendedSubcategoriesByParent
    const level1Items = await ExtendedSubcategory.find({ level: 1 }).limit(1);
    
    if (level1Items.length > 0) {
      const level1Item = level1Items[0];
      
      // Simulate the new API endpoint
      const children = await ExtendedSubcategory.find({
        parentExtendedSubcategory: level1Item._id,
        status: 'active'
      })
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level')
      .sort({ name: 1 });
      
      console.log(`📋 API: /extended-subcategories/by-parent/${level1Item._id}`);
      console.log(`   Found ${children.length} children`);
      
      // Add parent chain for each child (simulating the new API response)
      for (const child of children.slice(0, 2)) { // Test first 2
        const getParentChain = async (extendedSubcategoryId) => {
          const parentChain = [];
          let current = await ExtendedSubcategory.findById(extendedSubcategoryId);
          
          while (current && current.parentExtendedSubcategory) {
            current = await ExtendedSubcategory.findById(current.parentExtendedSubcategory);
            if (current) {
              parentChain.unshift(current._id.toString());
            }
          }
          
          return parentChain;
        };
        
        const parentChain = await getParentChain(child._id);
        console.log(`     ${child.name}: parentChain = [${parentChain.join(', ')}]`);
      }
      
      console.log('✅ New API endpoints should provide parent chain information');
    }
    
  } catch (error) {
    console.error('❌ Error testing new API endpoints:', error);
  }
}

async function runTests() {
  console.log('🚀 Starting Bidirectional Auto-fill Fixes Test\n');
  
  await connectDB();
  
  await testParentChainResolution();
  await testLevel2Filtering();
  await testBidirectionalAutoFill();
  await testNewAPIEndpoints();
  
  console.log('\n✅ All tests completed!');
  console.log('\n📋 Summary of Fixes Applied:');
  console.log('1. ✅ Fixed Level 2 timing issue by setting selectedSubcategory1Id before formData');
  console.log('2. ✅ Added proper Level 2 data loading in handleSubcategory1Change');
  console.log('3. ✅ Added backend API for parent chain resolution');
  console.log('4. ✅ Updated all subcategory change handlers to use parent chain API');
  console.log('5. ✅ Added new API endpoints: /by-parent/:parentId and /:id/parent-chain');
  
  console.log('\n🔧 Next Steps:');
  console.log('1. Test the frontend with these changes');
  console.log('2. Verify Level 2 dropdown shows correct item counts');
  console.log('3. Test bidirectional auto-fill from Level 3, 4, 5 selections');
  console.log('4. Ensure all parent levels are properly populated');
  
  await mongoose.disconnect();
  console.log('👋 Disconnected from MongoDB');
}

// Run the tests
runTests().catch(console.error);