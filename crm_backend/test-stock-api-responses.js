import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import models
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

async function testStockAPIResponses() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n=== TESTING STOCK API RESPONSES ===\n');

    // 1. Test Extended Subcategories API (what frontend calls for Extended Level 1)
    console.log('1. TESTING EXTENDED SUBCATEGORIES API:');
    console.log('   Simulating: apiService.getExtendedSubcategories()');
    
    const extendedQuery = { status: 'active' };
    const extendedItems = await ExtendedSubcategory.find(extendedQuery)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level')
      .sort({ name: 1 });

    console.log(`   Raw API response would have ${extendedItems.length} items:`);
    extendedItems.forEach(item => {
      console.log(`     - ${item.name} (Level ${item.level}) - ID: ${item._id}`);
    });

    // Frontend filters for level 1 only
    const level1Filtered = extendedItems.filter(item => item.level === 1);
    console.log(`   After frontend filtering (level === 1): ${level1Filtered.length} items`);
    level1Filtered.forEach(item => {
      console.log(`     - ${item.name} (Level ${item.level}) - ID: ${item._id}`);
    });

    // 2. Test Level 2 Options API
    console.log('\n2. TESTING LEVEL 2 OPTIONS API:');
    console.log('   Simulating: apiService.getLevel2Options()');
    
    const level2Query = { status: 'active', level: 2 };
    const level2Items = await ExtendedSubcategory.find(level2Query)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level')
      .sort({ name: 1 });

    console.log(`   Level 2 API response would have ${level2Items.length} items:`);
    level2Items.forEach(item => {
      console.log(`     - ${item.name} (Level ${item.level}) - ID: ${item._id}`);
    });

    // 3. Test what the actual API controller returns
    console.log('\n3. TESTING ACTUAL API CONTROLLER LOGIC:');
    
    // Simulate getExtendedSubcategories controller
    const controllerQuery = { status: 'active' };
    const controllerItems = await ExtendedSubcategory.find(controllerQuery)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level')
      .sort({ name: 1 });

    // Add children count like the controller does
    const itemsWithCounts = await Promise.all(
      controllerItems.map(async (item) => {
        const childrenCount = await ExtendedSubcategory.countDocuments({
          parentExtendedSubcategory: item._id,
          status: 'active',
        });

        return {
          ...item.toObject(),
          childrenCount,
          canHaveChildren: item.level < 5,
        };
      })
    );

    console.log('   Controller response structure:');
    console.log('   {');
    console.log('     success: true,');
    console.log(`     items: [${itemsWithCounts.length} items],`);
    console.log('     pagination: { ... }');
    console.log('   }');
    
    console.log('\n   Items array contents:');
    itemsWithCounts.forEach(item => {
      console.log(`     - ${item.name} (Level ${item.level}, Children: ${item.childrenCount})`);
    });

    // 4. Check the response structure that frontend expects
    console.log('\n4. FRONTEND RESPONSE HANDLING:');
    console.log('   Frontend expects response.items or response.data');
    console.log('   Current controller returns: response.items ✅');
    console.log('   Frontend filtering: items.filter(item => item.level === 1)');
    
    const frontendFiltered = itemsWithCounts.filter(item => item.level === 1);
    console.log(`   Result: ${frontendFiltered.length} Level 1 items`);

    // 5. Test Level 2 controller response
    console.log('\n5. LEVEL 2 CONTROLLER RESPONSE:');
    const level2ControllerQuery = { status: 'active', level: 2 };
    const level2ControllerItems = await ExtendedSubcategory.find(level2ControllerQuery)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name level')
      .sort({ name: 1 });

    console.log('   Level 2 controller response:');
    console.log('   {');
    console.log('     success: true,');
    console.log(`     items: [${level2ControllerItems.length} items],`);
    console.log('     pagination: { ... }');
    console.log('   }');

    console.log('\n6. SUMMARY:');
    console.log(`   ✅ Extended Level 1 should show: ${frontendFiltered.length} items`);
    console.log(`   ✅ Extended Level 2 should show: ${level2ControllerItems.length} items`);
    
    if (frontendFiltered.length === 0) {
      console.log('   ⚠️  Issue: No Level 1 items to display in Extended Level 1 filter');
    }
    
    if (level2ControllerItems.length === 0) {
      console.log('   ⚠️  Issue: No Level 2 items to display in Extended Level 2 filter');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testStockAPIResponses();