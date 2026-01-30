import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

// Test the sales analytics API endpoints
async function testSalesAnalyticsAPI() {
  try {
    console.log('🧪 Testing Sales Analytics API...\n');

    // You'll need to replace this with a valid JWT token
    const token = 'your-jwt-token-here';
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Test 1: Get product sales analytics for multiple products
    console.log('📊 Test 1: Get 30-day sales for multiple products');
    try {
      const response1 = await axios.get(`${API_BASE_URL}/sales-analytics/products`, {
        headers,
        params: {
          productIds: ['product1', 'product2', 'product3'],
          period: '30days'
        }
      });
      
      console.log('✅ Success:', response1.data);
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 2: Get detailed sales analytics for a single product
    console.log('📈 Test 2: Get detailed sales analytics for a product');
    try {
      const response2 = await axios.get(`${API_BASE_URL}/sales-analytics/product-details`, {
        headers,
        params: {
          productId: 'product1',
          warehouseId: 'warehouse1' // optional
        }
      });
      
      console.log('✅ Success:', response2.data);
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }

    console.log('\n🎉 Sales Analytics API testing completed!');

  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

// Instructions for running the test
console.log(`
📋 INSTRUCTIONS TO TEST:

1. Make sure your backend server is running on http://localhost:5000
2. Get a valid JWT token by logging in through the frontend or API
3. Replace 'your-jwt-token-here' in this file with the actual token
4. Replace the productIds and warehouseId with actual IDs from your database
5. Run this test with: node test-sales-analytics-api.js

🔧 To get a token quickly:
   - Use Postman or curl to POST to /api/auth/login with valid credentials
   - Copy the token from the response
   - Paste it in this file

📝 Example product and warehouse IDs can be found by:
   - GET /api/products (to get product IDs)
   - GET /api/warehouses (to get warehouse IDs)
`);

// Uncomment the line below to run the test
// testSalesAnalyticsAPI();

export default testSalesAnalyticsAPI;