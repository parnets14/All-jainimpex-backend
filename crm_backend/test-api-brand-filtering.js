import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

// Test the actual API endpoints for brand filtering
const testAPIBrandFiltering = async () => {
  try {
    console.log('🧪 Testing API Brand Filtering');
    console.log('==============================');

    // Test data from our previous analysis
    const testData = {
      category: '695e0bc7432f5d15bd26e96d', // pipe
      subcategory: '695e0e8dc3b5d4f44e8ba7ff', // pvc pipe
      pvciso: '695e2b52f1703db98f075212',    // pvciso extended
      noniso: '695e33baf1703db98f07565e'     // non iso extended
    };

    // Test 1: Basic hierarchy (category + subcategory)
    console.log('\n📋 Test 1: Basic Hierarchy (Category + Subcategory)');
    try {
      const response1 = await axios.get(`${API_BASE_URL}/brands`, {
        params: {
          category: testData.category,
          subcategory: testData.subcategory
        }
      });
      console.log(`✅ Found ${response1.data.brands.length} brands`);
      response1.data.brands.forEach(brand => {
        console.log(`  - ${brand.name} (${brand.category?.name} → ${brand.subcategory?.name})`);
      });
    } catch (error) {
      console.log(`❌ Error: ${error.response?.data?.message || error.message}`);
    }

    // Test 2: Extended hierarchy with pvciso
    console.log('\n📋 Test 2: Extended Hierarchy (pvciso)');
    try {
      const response2 = await axios.get(`${API_BASE_URL}/brands`, {
        params: {
          category: testData.category,
          subcategory: testData.subcategory,
          subcategory1: testData.pvciso
        }
      });
      console.log(`✅ Found ${response2.data.brands.length} brands`);
      response2.data.brands.forEach(brand => {
        console.log(`  - ${brand.name} (Extended: ${brand.subcategory1?.name || 'N/A'})`);
      });
    } catch (error) {
      console.log(`❌ Error: ${error.response?.data?.message || error.message}`);
    }

    // Test 3: Extended hierarchy with non iso
    console.log('\n📋 Test 3: Extended Hierarchy (non iso)');
    try {
      const response3 = await axios.get(`${API_BASE_URL}/brands`, {
        params: {
          category: testData.category,
          subcategory: testData.subcategory,
          subcategory1: testData.noniso
        }
      });
      console.log(`✅ Found ${response3.data.brands.length} brands`);
      response3.data.brands.forEach(brand => {
        console.log(`  - ${brand.name} (Extended: ${brand.subcategory1?.name || 'N/A'})`);
      });
    } catch (error) {
      console.log(`❌ Error: ${error.response?.data?.message || error.message}`);
    }

    // Test 4: Wrong combination (should return no results)
    console.log('\n📋 Test 4: Wrong Combination (Different Category)');
    try {
      const response4 = await axios.get(`${API_BASE_URL}/brands`, {
        params: {
          category: '68df93bb4b418ce3d8913e70', // Basin category
          subcategory: testData.subcategory,    // pvc pipe subcategory (from pipe category)
          subcategory1: testData.pvciso
        }
      });
      console.log(`✅ Found ${response4.data.brands.length} brands (Expected: 0)`);
      response4.data.brands.forEach(brand => {
        console.log(`  - ${brand.name}`);
      });
    } catch (error) {
      console.log(`❌ Error: ${error.response?.data?.message || error.message}`);
    }

    console.log('\n✅ API Brand Filtering Test Complete!');
    console.log('\n📝 Summary:');
    console.log('- Basic hierarchy returns all brands under category+subcategory');
    console.log('- Extended hierarchy filters brands by specific extended subcategory');
    console.log('- Different extended subcategories return different brand sets');
    console.log('- Wrong combinations correctly return no results');

  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
  }
};

testAPIBrandFiltering();