import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function testDealerPricingAPI() {
  try {
    console.log('🧪 Testing Dealer Pricing API...');
    console.log(`Base URL: ${BASE_URL}`);

    // First, login to get authentication token
    console.log('\n1. Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'superadmin@jainimpex.com',
      password: 'superadmin123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Login failed: ' + loginResponse.data.message);
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful');

    // Set up axios with auth header
    const authAxios = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Test the main dealer pricing endpoint
    console.log('\n2. Testing GET /api/dealer-pricing...');
    
    try {
      const response = await authAxios.get('/api/dealer-pricing', {
        params: { limit: 5 }
      });

      console.log('✅ API Response:');
      console.log('Status:', response.status);
      console.log('Success:', response.data.success);
      console.log('Records count:', response.data.data?.length || 0);
      
      if (response.data.data && response.data.data.length > 0) {
        console.log('\n📊 Sample record:');
        const sample = response.data.data[0];
        console.log({
          productName: sample.product?.itemName || 'N/A',
          sellingPrice: sample.sellingPrice,
          purchasePrice: sample.purchasePrice,
          hasScheduledChange: sample.hasScheduledChange,
          hasDirectDiscount: sample.hasDirectDiscount
        });
      }
    } catch (error) {
      console.error('❌ GET /api/dealer-pricing failed:', error.response?.data || error.message);
    }

    // Test filter options endpoint
    console.log('\n3. Testing GET /api/dealer-pricing/filter-options...');
    
    try {
      const filterResponse = await authAxios.get('/api/dealer-pricing/filter-options');
      
      console.log('✅ Filter Options Response:');
      console.log('Success:', filterResponse.data.success);
      console.log('Brands count:', filterResponse.data.data?.brands?.length || 0);
      console.log('Categories count:', filterResponse.data.data?.categories?.length || 0);
      console.log('Subcategories count:', filterResponse.data.data?.subcategories?.length || 0);
    } catch (error) {
      console.error('❌ GET /api/dealer-pricing/filter-options failed:', error.response?.data || error.message);
    }

    // Test preview bulk changes endpoint
    console.log('\n4. Testing POST /api/dealer-pricing/preview-bulk-changes...');
    
    try {
      const previewResponse = await authAxios.post('/api/dealer-pricing/preview-bulk-changes', {
        filters: {},
        changeType: 'increase_percentage',
        changeValue: 5
      });
      
      console.log('✅ Preview Response:');
      console.log('Success:', previewResponse.data.success);
      console.log('Affected products:', previewResponse.data.data?.totalProducts || 0);
    } catch (error) {
      console.error('❌ POST /api/dealer-pricing/preview-bulk-changes failed:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('\n❌ Error testing API:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Response Data:', error.response.data);
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Run the test
testDealerPricingAPI();