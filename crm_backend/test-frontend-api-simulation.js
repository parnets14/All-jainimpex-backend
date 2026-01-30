import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getExtendedSubcategories } from './controllers/extendedSubcategoryController.js';

dotenv.config();

// Import models
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

async function testFrontendAPISimulation() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n=== TESTING FRONTEND API SIMULATION ===\n');

    // 1. Simulate the exact API call that frontend makes for Extended Subcategories
    console.log('1. SIMULATING FRONTEND API CALL: getExtendedSubcategories()');
    
    // Create mock request and response objects
    const mockReq = {
      query: {}, // No parameters, just like frontend
      user: { id: 'test-user' }
    };
    
    let mockResponseData = null;
    const mockRes = {
      json: (data) => {
        mockResponseData = data;
        console.log('   API Response:', JSON.stringify(data, null, 2));
      },
      status: (code) => ({
        json: (data) => {
          mockResponseData = data;
          console.log(`   API Response (${code}):`, JSON.stringify(data, null, 2));
        }
      })
    };

    // Call the actual controller
    await getExtendedSubcategories(mockReq, mockRes);
    
    // 2. Simulate frontend processing
    console.log('\n2. SIMULATING FRONTEND PROCESSING:');
    if (mockResponseData && mockResponseData.success) {
      const allExtendedData = mockResponseData.items || mockResponseData.data || [];
      console.log(`   Raw API data: ${allExtendedData.length} items`);
      
      allExtendedData.forEach(item => {
        console.log(`     - ${item.name} (Level ${item.level})`);
      });
      
      const level1Data = allExtendedData.filter(item => item.level === 1);
      console.log(`   After filtering (level === 1): ${level1Data.length} items`);
      
      level1Data.forEach(item => {
        console.log(`     - ${item.name} (Level ${item.level})`);
      });
      
      console.log(`   Frontend would log: "✅ Loaded extended subcategories (Level 1 only): ${level1Data.length}"`);
    } else {
      console.log('   ❌ API call failed or returned no data');
      console.log('   Frontend would log: "❌ Extended subcategories API error"');
    }

    // 3. Simulate Level 2 Options API call
    console.log('\n3. SIMULATING LEVEL 2 OPTIONS API CALL:');
    
    const mockReq2 = {
      query: { level: 2 }, // Level 2 parameter
      user: { id: 'test-user' }
    };
    
    let mockResponseData2 = null;
    const mockRes2 = {
      json: (data) => {
        mockResponseData2 = data;
        console.log('   Level 2 API Response:', JSON.stringify(data, null, 2));
      },
      status: (code) => ({
        json: (data) => {
          mockResponseData2 = data;
          console.log(`   Level 2 API Response (${code}):`, JSON.stringify(data, null, 2));
        }
      })
    };

    await getExtendedSubcategories(mockReq2, mockRes2);
    
    // Process Level 2 response
    if (mockResponseData2 && mockResponseData2.success) {
      const level2Data = mockResponseData2.items || mockResponseData2.data || [];
      console.log(`   Level 2 data: ${level2Data.length} items`);
      
      level2Data.forEach(item => {
        console.log(`     - ${item.name} (Level ${item.level})`);
      });
      
      console.log(`   Frontend would log: "✅ Loaded level 2 options: ${level2Data.length}"`);
    } else {
      console.log('   ❌ Level 2 API call failed or returned no data');
      console.log('   Frontend would log: "❌ Level 2 options API error"');
    }

    // 4. Check if there are any authentication or permission issues
    console.log('\n4. CHECKING FOR POTENTIAL ISSUES:');
    
    // Direct database query to verify data exists
    const directQuery = await ExtendedSubcategory.find({ status: 'active' });
    console.log(`   Direct DB query: ${directQuery.length} active extended subcategories`);
    
    if (directQuery.length > 0 && (!mockResponseData || !mockResponseData.success)) {
      console.log('   🚨 ISSUE: Data exists in DB but API is not returning it');
      console.log('   Possible causes:');
      console.log('     - Authentication/permission issues');
      console.log('     - Controller error handling');
      console.log('     - Database connection issues');
    }
    
    if (directQuery.length === 0) {
      console.log('   🚨 ISSUE: No active extended subcategories in database');
    }

    // 5. Summary
    console.log('\n5. SUMMARY:');
    const expectedLevel1 = directQuery.filter(item => item.level === 1).length;
    const expectedLevel2 = directQuery.filter(item => item.level === 2).length;
    const actualLevel1 = mockResponseData?.success ? (mockResponseData.items || []).filter(item => item.level === 1).length : 0;
    const actualLevel2 = mockResponseData2?.success ? (mockResponseData2.items || []).length : 0;
    
    console.log(`   Expected Level 1 items: ${expectedLevel1}`);
    console.log(`   Actual Level 1 items from API: ${actualLevel1}`);
    console.log(`   Expected Level 2 items: ${expectedLevel2}`);
    console.log(`   Actual Level 2 items from API: ${actualLevel2}`);
    
    if (expectedLevel1 === actualLevel1 && expectedLevel2 === actualLevel2) {
      console.log('   ✅ API is working correctly');
    } else {
      console.log('   ❌ API is not returning expected data');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testFrontendAPISimulation();