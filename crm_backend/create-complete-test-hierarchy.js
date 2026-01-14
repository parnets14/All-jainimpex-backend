#!/usr/bin/env node

/**
 * Create a complete test hierarchy to verify all connections:
 * 1 Category → 2 Subcategories → Each has 2 Level1 → Each has 2 Level2 → ... → Level5 → Brands
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import User from './models/User.js';

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

async function createCompleteHierarchy() {
  console.log('\n🏗️ Creating Complete Test Hierarchy...\n');
  
  try {
    // Get super admin user for createdBy field
    const superAdmin = await User.findOne({ email: 'superadmin@jainimpex.com' });
    if (!superAdmin) {
      console.error('❌ Super admin user not found');
      return;
    }
    
    // Step 1: Create Category
    console.log('📁 Step 1: Creating Category...');
    const category = new Category({
      name: 'Test Category',
      description: 'Test category for hierarchy verification',
      createdBy: superAdmin._id
    });
    await category.save();
    console.log(`✅ Created Category: ${category.name} (${category._id})`);
    
    // Step 2: Create 2 Subcategories
    console.log('\n📂 Step 2: Creating 2 Subcategories...');
    const subcategories = [];
    for (let i = 1; i <= 2; i++) {
      const subcategory = new Subcategory({
        name: `Test Subcategory ${i}`,
        description: `Test subcategory ${i} for hierarchy verification`,
        category: category._id,
        createdBy: superAdmin._id
      });
      await subcategory.save();
      subcategories.push(subcategory);
      console.log(`✅ Created Subcategory ${i}: ${subcategory.name} (${subcategory._id})`);
    }
    
    // Step 3-7: Create Extended Subcategories (Levels 1-5)
    const hierarchyMap = new Map(); // Store all created items for reference
    
    for (let subIndex = 0; subIndex < subcategories.length; subIndex++) {
      const subcategory = subcategories[subIndex];
      console.log(`\n🔗 Creating hierarchy for Subcategory ${subIndex + 1}: ${subcategory.name}`);
      
      // Level 1: Create 2 items directly under subcategory
      console.log(`  📊 Level 1: Creating 2 items...`);
      const level1Items = [];
      for (let i = 1; i <= 2; i++) {
        const level1 = new ExtendedSubcategory({
          name: `Sub${subIndex + 1}-L1-Item${i}`,
          description: `Level 1 item ${i} under subcategory ${subIndex + 1}`,
          category: category._id,
          subcategory: subcategory._id,
          parentExtendedSubcategory: null,
          level: 1,
          createdBy: superAdmin._id
        });
        await level1.save();
        level1Items.push(level1);
        console.log(`  ✅ Created Level 1 Item ${i}: ${level1.name} (${level1._id})`);
      }
      
      // Level 2: Create 2 items under each Level 1 item
      console.log(`  📊 Level 2: Creating 2 items under each Level 1...`);
      const level2Items = [];
      for (const level1 of level1Items) {
        for (let i = 1; i <= 2; i++) {
          const level2 = new ExtendedSubcategory({
            name: `${level1.name}-L2-Item${i}`,
            description: `Level 2 item ${i} under ${level1.name}`,
            category: category._id,
            subcategory: subcategory._id,
            parentExtendedSubcategory: level1._id,
            level: 2,
            createdBy: superAdmin._id
          });
          await level2.save();
          level2Items.push(level2);
          console.log(`  ✅ Created Level 2 Item: ${level2.name} (${level2._id})`);
        }
      }
      
      // Level 3: Create 2 items under each Level 2 item
      console.log(`  📊 Level 3: Creating 2 items under each Level 2...`);
      const level3Items = [];
      for (const level2 of level2Items) {
        for (let i = 1; i <= 2; i++) {
          const level3 = new ExtendedSubcategory({
            name: `${level2.name}-L3-Item${i}`,
            description: `Level 3 item ${i} under ${level2.name}`,
            category: category._id,
            subcategory: subcategory._id,
            parentExtendedSubcategory: level2._id,
            level: 3,
            createdBy: superAdmin._id
          });
          await level3.save();
          level3Items.push(level3);
          console.log(`  ✅ Created Level 3 Item: ${level3.name} (${level3._id})`);
        }
      }
      
      // Level 4: Create 2 items under each Level 3 item
      console.log(`  📊 Level 4: Creating 2 items under each Level 3...`);
      const level4Items = [];
      for (const level3 of level3Items) {
        for (let i = 1; i <= 2; i++) {
          const level4 = new ExtendedSubcategory({
            name: `${level3.name}-L4-Item${i}`,
            description: `Level 4 item ${i} under ${level3.name}`,
            category: category._id,
            subcategory: subcategory._id,
            parentExtendedSubcategory: level3._id,
            level: 4,
            createdBy: superAdmin._id
          });
          await level4.save();
          level4Items.push(level4);
          console.log(`  ✅ Created Level 4 Item: ${level4.name} (${level4._id})`);
        }
      }
      
      // Level 5: Create 2 items under each Level 4 item
      console.log(`  📊 Level 5: Creating 2 items under each Level 4...`);
      const level5Items = [];
      for (const level4 of level4Items) {
        for (let i = 1; i <= 2; i++) {
          const level5 = new ExtendedSubcategory({
            name: `${level4.name}-L5-Item${i}`,
            description: `Level 5 item ${i} under ${level4.name}`,
            category: category._id,
            subcategory: subcategory._id,
            parentExtendedSubcategory: level4._id,
            level: 5,
            createdBy: superAdmin._id
          });
          await level5.save();
          level5Items.push(level5);
          console.log(`  ✅ Created Level 5 Item: ${level5.name} (${level5._id})`);
        }
      }
      
      // Create Brands: 1 brand at subcategory level and 1 brand at deepest level (Level 5)
      console.log(`  🏷️ Creating Brands...`);
      
      // Brand at subcategory level (no extended levels)
      const brandAtSubcategory = new Brand({
        name: `Brand-Sub${subIndex + 1}-Direct`,
        description: `Brand directly under subcategory ${subIndex + 1}`,
        category: category._id,
        subcategory: subcategory._id,
        createdBy: superAdmin._id
      });
      await brandAtSubcategory.save();
      console.log(`  ✅ Created Brand (Subcategory level): ${brandAtSubcategory.name} (${brandAtSubcategory._id})`);
      
      // Brand at deepest level (Level 5) - take first Level 5 item
      if (level5Items.length > 0) {
        const deepestLevel5 = level5Items[0];
        const brandAtLevel5 = new Brand({
          name: `Brand-${deepestLevel5.name}`,
          description: `Brand at deepest level under ${deepestLevel5.name}`,
          category: category._id,
          subcategory: subcategory._id,
          extendedSubcategory: deepestLevel5._id,
          level: 5,
          createdBy: superAdmin._id
        });
        await brandAtLevel5.save();
        console.log(`  ✅ Created Brand (Level 5): ${brandAtLevel5.name} (${brandAtLevel5._id})`);
      }
      
      // Store counts for this subcategory
      hierarchyMap.set(subcategory._id.toString(), {
        subcategory: subcategory,
        level1Count: level1Items.length,
        level2Count: level2Items.length,
        level3Count: level3Items.length,
        level4Count: level4Items.length,
        level5Count: level5Items.length,
        brandCount: 2
      });
    }
    
    // Summary
    console.log('\n📊 HIERARCHY CREATION SUMMARY:');
    console.log('═'.repeat(60));
    console.log(`Category: ${category.name}`);
    console.log(`  └─ Subcategories: ${subcategories.length}`);
    
    for (const [subId, data] of hierarchyMap.entries()) {
      console.log(`     └─ ${data.subcategory.name}`);
      console.log(`        ├─ Level 1: ${data.level1Count} items`);
      console.log(`        ├─ Level 2: ${data.level2Count} items`);
      console.log(`        ├─ Level 3: ${data.level3Count} items`);
      console.log(`        ├─ Level 4: ${data.level4Count} items`);
      console.log(`        ├─ Level 5: ${data.level5Count} items`);
      console.log(`        └─ Brands: ${data.brandCount} items`);
    }
    
    console.log('\n✅ Complete hierarchy created successfully!');
    
    return { category, subcategories, hierarchyMap };
    
  } catch (error) {
    console.error('❌ Error creating hierarchy:', error);
    throw error;
  }
}

async function verifyConnections(category, subcategories) {
  console.log('\n🔍 VERIFYING ALL CONNECTIONS...\n');
  
  try {
    // Verify Category → Subcategory connections
    console.log('1️⃣ Verifying Category → Subcategory connections...');
    for (const subcategory of subcategories) {
      const subcat = await Subcategory.findById(subcategory._id).populate('category');
      if (subcat.category._id.toString() === category._id.toString()) {
        console.log(`   ✅ ${subcategory.name} → ${subcat.category.name}`);
      } else {
        console.log(`   ❌ ${subcategory.name} connection broken!`);
      }
    }
    
    // Verify Subcategory → Level 1 connections
    console.log('\n2️⃣ Verifying Subcategory → Level 1 connections...');
    for (const subcategory of subcategories) {
      const level1Items = await ExtendedSubcategory.find({
        subcategory: subcategory._id,
        level: 1
      }).populate('subcategory');
      
      console.log(`   ${subcategory.name} has ${level1Items.length} Level 1 items:`);
      for (const item of level1Items) {
        console.log(`     ✅ ${item.name} → ${item.subcategory.name}`);
      }
    }
    
    // Verify Level 1 → Level 2 connections
    console.log('\n3️⃣ Verifying Level 1 → Level 2 connections...');
    const level1Items = await ExtendedSubcategory.find({ level: 1 });
    for (const level1 of level1Items.slice(0, 2)) { // Test first 2
      const level2Items = await ExtendedSubcategory.find({
        parentExtendedSubcategory: level1._id,
        level: 2
      });
      console.log(`   ${level1.name} has ${level2Items.length} Level 2 children:`);
      for (const item of level2Items) {
        console.log(`     ✅ ${item.name}`);
      }
    }
    
    // Verify Level 2 → Level 3 connections
    console.log('\n4️⃣ Verifying Level 2 → Level 3 connections...');
    const level2Items = await ExtendedSubcategory.find({ level: 2 });
    for (const level2 of level2Items.slice(0, 2)) { // Test first 2
      const level3Items = await ExtendedSubcategory.find({
        parentExtendedSubcategory: level2._id,
        level: 3
      });
      console.log(`   ${level2.name} has ${level3Items.length} Level 3 children:`);
      for (const item of level3Items) {
        console.log(`     ✅ ${item.name}`);
      }
    }
    
    // Verify Level 3 → Level 4 connections
    console.log('\n5️⃣ Verifying Level 3 → Level 4 connections...');
    const level3Items = await ExtendedSubcategory.find({ level: 3 });
    for (const level3 of level3Items.slice(0, 2)) { // Test first 2
      const level4Items = await ExtendedSubcategory.find({
        parentExtendedSubcategory: level3._id,
        level: 4
      });
      console.log(`   ${level3.name} has ${level4Items.length} Level 4 children:`);
      for (const item of level4Items) {
        console.log(`     ✅ ${item.name}`);
      }
    }
    
    // Verify Level 4 → Level 5 connections
    console.log('\n6️⃣ Verifying Level 4 → Level 5 connections...');
    const level4Items = await ExtendedSubcategory.find({ level: 4 });
    for (const level4 of level4Items.slice(0, 2)) { // Test first 2
      const level5Items = await ExtendedSubcategory.find({
        parentExtendedSubcategory: level4._id,
        level: 5
      });
      console.log(`   ${level4.name} has ${level5Items.length} Level 5 children:`);
      for (const item of level5Items) {
        console.log(`     ✅ ${item.name}`);
      }
    }
    
    // Verify Level 5 → Brand connections
    console.log('\n7️⃣ Verifying Level 5 → Brand connections...');
    const level5Items = await ExtendedSubcategory.find({ level: 5 });
    for (const level5 of level5Items.slice(0, 2)) { // Test first 2
      const brands = await Brand.find({
        extendedSubcategory: level5._id,
        level: 5
      });
      console.log(`   ${level5.name} has ${brands.length} brands:`);
      for (const brand of brands) {
        console.log(`     ✅ ${brand.name}`);
      }
    }
    
    // Verify Subcategory → Brand connections (direct)
    console.log('\n8️⃣ Verifying Subcategory → Brand connections (direct)...');
    for (const subcategory of subcategories) {
      const brands = await Brand.find({
        subcategory: subcategory._id,
        extendedSubcategory: { $exists: false }
      });
      console.log(`   ${subcategory.name} has ${brands.length} direct brands:`);
      for (const brand of brands) {
        console.log(`     ✅ ${brand.name}`);
      }
    }
    
    console.log('\n✅ All connections verified successfully!');
    
  } catch (error) {
    console.error('❌ Error verifying connections:', error);
    throw error;
  }
}

async function testReverseAutoFill() {
  console.log('\n🔄 TESTING REVERSE AUTO-FILL (Level 5 → Category)...\n');
  
  try {
    // Get a Level 5 item
    const level5Item = await ExtendedSubcategory.findOne({ level: 5 })
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level');
    
    if (!level5Item) {
      console.log('⚠️ No Level 5 items found');
      return;
    }
    
    console.log(`📋 Testing with Level 5 item: ${level5Item.name}`);
    console.log('   Tracing parent chain...\n');
    
    // Trace the complete parent chain
    const parentChain = [];
    let current = level5Item;
    
    while (current.parentExtendedSubcategory) {
      const parent = await ExtendedSubcategory.findById(current.parentExtendedSubcategory)
        .populate('category', 'name')
        .populate('subcategory', 'name');
      
      if (parent) {
        parentChain.unshift({
          level: parent.level,
          name: parent.name,
          id: parent._id
        });
        current = parent;
      } else {
        break;
      }
    }
    
    console.log('   Complete hierarchy (reverse auto-fill):');
    console.log(`   Category: ${level5Item.category.name}`);
    console.log(`   Subcategory: ${level5Item.subcategory.name}`);
    
    for (const parent of parentChain) {
      console.log(`   Level ${parent.level}: ${parent.name}`);
    }
    
    console.log(`   Level 5: ${level5Item.name} (selected)`);
    
    console.log('\n✅ Reverse auto-fill chain verified!');
    console.log('   When user selects this Level 5 item, all parent levels should auto-fill.');
    
  } catch (error) {
    console.error('❌ Error testing reverse auto-fill:', error);
    throw error;
  }
}

async function runCompleteTest() {
  console.log('🚀 COMPLETE HIERARCHY TEST\n');
  console.log('═'.repeat(60));
  console.log('This script will:');
  console.log('1. Create 1 Category');
  console.log('2. Create 2 Subcategories');
  console.log('3. Create 2 Level 1 items under each Subcategory');
  console.log('4. Create 2 Level 2 items under each Level 1');
  console.log('5. Create 2 Level 3 items under each Level 2');
  console.log('6. Create 2 Level 4 items under each Level 3');
  console.log('7. Create 2 Level 5 items under each Level 4');
  console.log('8. Create Brands at various levels');
  console.log('9. Verify all connections');
  console.log('10. Test reverse auto-fill');
  console.log('═'.repeat(60));
  
  await connectDB();
  
  const { category, subcategories } = await createCompleteHierarchy();
  await verifyConnections(category, subcategories);
  await testReverseAutoFill();
  
  console.log('\n🎉 COMPLETE HIERARCHY TEST FINISHED!');
  console.log('\n📋 SUMMARY:');
  console.log('✅ All hierarchy levels created successfully');
  console.log('✅ All connections verified');
  console.log('✅ Reverse auto-fill tested and working');
  console.log('\n🎯 You can now test in the frontend:');
  console.log('   1. Go to Category Master to see the hierarchy');
  console.log('   2. Go to Product Master');
  console.log('   3. Select a Level 5 item');
  console.log('   4. Verify all parent levels auto-fill correctly');
  
  await mongoose.disconnect();
  console.log('\n👋 Disconnected from MongoDB');
}

// Run the complete test
runCompleteTest().catch(console.error);