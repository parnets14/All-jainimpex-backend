import mongoose from 'mongoose';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jain_impex_crm');

async function debugExtendedSubcategoryAPI() {
  try {
    console.log('🔍 Debugging Extended Subcategory API Data\n');

    // Test 1: Check raw data in database
    console.log('📋 Test 1: Raw Database Data');
    
    const level1Raw = await ExtendedSubcategory.find({ level: 1 });
    console.log(`✅ Level 1 raw count: ${level1Raw.length}`);
    level1Raw.forEach(item => {
      console.log(`   - ${item.name} (ID: ${item._id})`);
      console.log(`     Category: ${item.category}`);
      console.log(`     Subcategory: ${item.subcategory}`);
      console.log(`     Status: ${item.status}`);
    });

    // Test 2: Check populated data
    console.log('\n📋 Test 2: Populated Database Data');
    
    const level1Populated = await ExtendedSubcategory.find({ level: 1 })
      .populate('category', 'name')
      .populate('subcategory', 'name');
    
    console.log(`✅ Level 1 populated count: ${level1Populated.length}`);
    level1Populated.forEach(item => {
      console.log(`   - ${item.name}`);
      console.log(`     Category: ${item.category?.name || 'NOT POPULATED'}`);
      console.log(`     Subcategory: ${item.subcategory?.name || 'NOT POPULATED'}`);
    });

    // Test 3: Simulate API query with different parameters
    console.log('\n📋 Test 3: API Query Simulation');
    
    // Query 1: Just level=1
    const query1 = await ExtendedSubcategory.find({ level: 1, status: 'active' })
      .populate('category', 'name')
      .populate('subcategory', 'name');
    console.log(`✅ Query level=1: ${query1.length} items`);

    // Query 2: Level=1 with specific category/subcategory
    if (level1Populated.length > 0) {
      const firstItem = level1Populated[0];
      const query2 = await ExtendedSubcategory.find({ 
        level: 1, 
        status: 'active',
        category: firstItem.category._id,
        subcategory: firstItem.subcategory._id
      }).populate('category', 'name').populate('subcategory', 'name');
      console.log(`✅ Query with category/subcategory filter: ${query2.length} items`);
    }

    // Test 4: Check what the API endpoint structure should return
    console.log('\n📋 Test 4: Expected API Response Structure');
    
    if (level1Populated.length > 0) {
      const sampleResponse = {
        success: true,
        items: level1Populated.map(item => ({
          _id: item._id,
          name: item.name,
          description: item.description,
          level: item.level,
          category: item.category,
          subcategory: item.subcategory,
          status: item.status
        })),
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalItems: level1Populated.length,
          itemsPerPage: 10
        }
      };
      
      console.log('✅ Sample API response structure:');
      console.log(JSON.stringify(sampleResponse, null, 2));
    }

    console.log('\n🎉 Debug Complete!');

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugExtendedSubcategoryAPI();