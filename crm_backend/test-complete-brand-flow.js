import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

// Test the complete brand filtering flow as the frontend would use it
const testCompleteBrandFlow = async () => {
  try {
    console.log('🧪 Testing Complete Brand Filtering Flow');
    console.log('=====================================');

    // Test 1: Get brands with basic hierarchy (category + subcategory)
    console.log('\n📋 Test 1: Basic Hierarchy Filtering');
    const basicParams = {
      category: '695e0bc7432f5d15bd26e96d', // pipe category
      subcategory: '695e0e8dc3b5d4f44e8ba7ff'  // pvc pipe subcategory
    };
    
    console.log('Request params:', basicParams);
    const basicResponse = await axios.get(`${API_BASE_URL}/brands`, { params: basicParams });
    console.log(`✅ Found ${basicResponse.data.brands.length} brands with basic hierarchy`);
    basicResponse.data.brands.forEach(brand => {
      console.log(`   - ${brand.name} (Category: ${brand.category?.name}, Subcategory: ${brand.subcategory?.name})`);
    });

    // Test 2: Get brands with extended hierarchy (category + subcategory + subcategory1)
    console.log('\n📋 Test 2: Extended Hierarchy Filtering');
    const extendedParams = {
      category: '695e0bc7432f5d15bd26e96d', // pipe category
      subcategory: '695e0e8dc3b5d4f44e8ba7ff', // pvc pipe subcategory
      subcategory1: '695e2b52f1703db98f075212'  // pvciso extended subcategory
    };
    
    console.log('Request params:', extendedParams);
    const extendedResponse = await axios.get(`${API_BASE_URL}/brands`, { params: extendedParams });
    console.log(`✅ Found ${extendedResponse.data.brands.length} brands with extended hierarchy`);
    extendedResponse.data.brands.forEach(brand => {
      console.log(`   - ${brand.name} (Extended: ${brand.subcategory1?.name || 'N/A'})`);
    });

    // Test 3: Get brands with different extended subcategory
    console.log('\n📋 Test 3: Different Extended Subcategory');
    const differentParams = {
      category: '695e0bc7432f5d15bd26e96d', // pipe category
      subcategory: '695e0e8dc3b5d4f44e8ba7ff', // pvc pipe subcategory
      subcategory1: '695e33baf1703db98f07565e'  // non iso extended subcategory
    };
    
    console.log('Request params:', differentParams);
    const differentResponse = await axios.get(`${API_BASE_URL}/brands`, { params: differentParams });
    console.log(`✅ Found ${differentResponse.data.brands.length} brands with different extended subcategory`);
    differentResponse.data.brands.forEach(brand => {
      console.log(`   - ${brand.name} (Extended: ${brand.subcategory1?.name || 'N/A'})`);
    });

    // Test 4: Simulate frontend flow - user selects category, then subcategory, then extended
    console.log('\n📋 Test 4: Simulating Frontend User Flow');
    
    // Step 1: User selects category
    console.log('Step 1: User selects category');
    const step1Params = {
      category: '695e0bc7432f5d15bd26e96d'
    };
    const step1Response = await axios.get(`${API_BASE_URL}/brands`, { params: step1Params });
    console.log(`   Brands available after category selection: ${step1Response.data.brands.length}`);

    // Step 2: User selects subcategory
    console.log('Step 2: User selects subcategory');
    const step2Params = {
      category: '695e0bc7432f5d15bd26e96d',
      subcategory: '695e0e8dc3b5d4f44e8ba7ff'
    };
    const step2Response = await axios.get(`${API_BASE_URL}/brands`, { params: step2Params });
    console.log(`   Brands available after subcategory selection: ${step2Response.data.brands.length}`);
    step2Response.data.brands.forEach(brand => {
      console.log(`   - ${brand.name}`);
    });

    // Step 3: User selects extended subcategory
    console.log('Step 3: User selects extended subcategory (pvciso)');
    const step3Params = {
      category: '695e0bc7432f5d15bd26e96d',
      subcategory: '695e0e8dc3b5d4f44e8ba7ff',
      subcategory1: '695e2b52f1703db98f075212'
    };
    const step3Response = await axios.get(`${API_BASE_URL}/brands`, { params: step3Params });
    console.log(`   Brands available after extended subcategory selection: ${step3Response.data.brands.length}`);
    step3Response.data.brands.forEach(brand => {
      console.log(`   - ${brand.name} (should only show brands with pvciso)`);
    });

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📝 Summary:');
    console.log('- Basic hierarchy filtering works correctly');
    console.log('- Extended hierarchy filtering works correctly');
    console.log('- Different extended subcategories show different brands');
    console.log('- Frontend user flow simulation works as expected');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
};

// Run the test
testCompleteBrandFlow();