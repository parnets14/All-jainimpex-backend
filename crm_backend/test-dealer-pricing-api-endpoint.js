import axios from 'axios';

async function testDealerPricingAPI() {
  try {
    console.log('🧪 Testing Dealer Pricing API endpoint...');
    
    const baseURL = 'http://localhost:5000/api';
    
    // Test 1: Health check
    console.log('\n📊 Test 1: Health check');
    try {
      const healthResponse = await axios.get(`${baseURL}/`);
      console.log('✅ Health check:', healthResponse.data.message);
    } catch (error) {
      console.log('❌ Health check failed:', error.message);
      console.log('🚨 Make sure the backend server is running on port 5000');
      return;
    }
    
    // Test 2: Get dealer pricing (the endpoint causing 500 error)
    console.log('\n📊 Test 2: Get dealer pricing');
    try {
      const pricingResponse = await axios.get(`${baseURL}/dealer-pricing?limit=10`);
      console.log('✅ Dealer pricing API successful!');
      console.log('📊 Response:', {
        success: pricingResponse.data.success,
        dataCount: pricingResponse.data.data?.length || 0,
        totalRecords: pricingResponse.data.pagination?.totalRecords || 0
      });
      
      if (pricingResponse.data.data && pricingResponse.data.data.length > 0) {
        console.log('\n📦 Sample records:');
        pricingResponse.data.data.slice(0, 3).forEach((record, index) => {
          console.log(`${index + 1}. ${record.product?.itemName || 'Unknown'}: ₹${record.sellingPrice}`);
        });
      }
      
    } catch (error) {
      console.log('❌ Dealer pricing API failed:', error.response?.status, error.response?.statusText);
      console.log('Error details:', error.response?.data || error.message);
    }
    
    // Test 3: Get filter options
    console.log('\n📊 Test 3: Get filter options');
    try {
      const filterResponse = await axios.get(`${baseURL}/dealer-pricing/filter-options`);
      console.log('✅ Filter options API successful!');
      console.log('📊 Filter data:', {
        brands: filterResponse.data.data?.brands?.length || 0,
        categories: filterResponse.data.data?.categories?.length || 0,
        subcategories: filterResponse.data.data?.subcategories?.length || 0
      });
    } catch (error) {
      console.log('❌ Filter options API failed:', error.response?.status, error.response?.statusText);
      console.log('Error details:', error.response?.data || error.message);
    }
    
    // Test 4: Get products (for comparison)
    console.log('\n📊 Test 4: Get products');
    try {
      const productsResponse = await axios.get(`${baseURL}/products?limit=10`);
      console.log('✅ Products API successful!');
      console.log('📊 Products:', {
        success: productsResponse.data.success,
        count: productsResponse.data.products?.length || 0
      });
    } catch (error) {
      console.log('❌ Products API failed:', error.response?.status, error.response?.statusText);
    }
    
    console.log('\n🎉 API testing complete!');
    
  } catch (error) {
    console.error('❌ Test script failed:', error.message);
  }
}

testDealerPricingAPI();