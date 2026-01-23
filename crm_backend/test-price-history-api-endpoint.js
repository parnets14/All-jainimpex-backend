import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const testPriceHistoryAPIEndpoint = async () => {
  try {
    const baseURL = 'http://localhost:5000/api';
    
    console.log('🧪 Testing Price History API Endpoint...');
    console.log(`📡 Base URL: ${baseURL}`);

    // First, let's test if the server is running
    try {
      const healthCheck = await axios.get(`${baseURL}/auth/me`, {
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      console.log('✅ Server is running');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✅ Server is running (got 401 as expected without valid token)');
      } else {
        console.log('❌ Server might not be running:', error.message);
        return;
      }
    }

    // Test the price history endpoint with a known product ID
    // We know from our previous test that "vine angle cock" has ID: 696a223e92f73fb83d564b80
    const productId = '696a223e92f73fb83d564b80';
    
    console.log(`\n📦 Testing price history for product: ${productId}`);
    
    try {
      const response = await axios.get(`${baseURL}/dealer-pricing/price-history/${productId}`, {
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      console.log('✅ API call successful!');
      console.log('📊 Response status:', response.status);
      console.log('📊 Response data:', JSON.stringify(response.data, null, 2));
      
      if (response.data.success && response.data.data) {
        console.log(`📋 Found ${response.data.data.length} history records`);
        response.data.data.forEach((record, index) => {
          console.log(`  ${index + 1}. ₹${record.oldPrice} → ₹${record.newPrice}`);
          console.log(`     Type: ${record.changeType}, Method: ${record.changeMethod}`);
          console.log(`     Date: ${record.changeDate}`);
          console.log(`     Reason: ${record.reason}`);
          console.log('');
        });
      }
      
    } catch (apiError) {
      console.log('❌ API call failed:', apiError.response?.status, apiError.response?.statusText);
      console.log('📊 Error response:', apiError.response?.data);
      
      if (apiError.response?.status === 401) {
        console.log('💡 This is expected - we need a valid auth token');
        console.log('💡 The endpoint exists and is responding');
      }
    }

    // Test with a different approach - let's check what products exist
    console.log('\n🔍 Let\'s check what products are available...');
    
    try {
      const productsResponse = await axios.get(`${baseURL}/products`, {
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      if (productsResponse.data.success) {
        console.log(`📦 Found ${productsResponse.data.products.length} products`);
        const firstFewProducts = productsResponse.data.products.slice(0, 5);
        firstFewProducts.forEach((product, index) => {
          console.log(`  ${index + 1}. ${product.itemName} (${product._id})`);
        });
      }
    } catch (productsError) {
      console.log('❌ Products API failed:', productsError.response?.status);
    }

    // Test the dealer pricing endpoint
    console.log('\n💰 Testing dealer pricing endpoint...');
    
    try {
      const pricingResponse = await axios.get(`${baseURL}/dealer-pricing`, {
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      if (pricingResponse.data.success) {
        console.log(`💰 Found ${pricingResponse.data.data.length} pricing records`);
        const firstFewPricing = pricingResponse.data.data.slice(0, 3);
        firstFewPricing.forEach((pricing, index) => {
          console.log(`  ${index + 1}. ${pricing.product?.itemName} - ₹${pricing.sellingPrice} (${pricing.product?._id})`);
        });
        
        // Test price history for the first product
        if (firstFewPricing.length > 0) {
          const testProductId = firstFewPricing[0].product._id;
          console.log(`\n🧪 Testing price history for: ${firstFewPricing[0].product.itemName} (${testProductId})`);
          
          try {
            const historyResponse = await axios.get(`${baseURL}/dealer-pricing/price-history/${testProductId}`, {
              headers: {
                'Authorization': 'Bearer test-token'
              }
            });
            
            console.log('✅ Price history API working!');
            console.log('📊 History response:', JSON.stringify(historyResponse.data, null, 2));
            
          } catch (historyError) {
            console.log('❌ Price history API failed:', historyError.response?.status);
            console.log('📊 Error details:', historyError.response?.data);
          }
        }
      }
    } catch (pricingError) {
      console.log('❌ Pricing API failed:', pricingError.response?.status);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

// Run the test
testPriceHistoryAPIEndpoint();