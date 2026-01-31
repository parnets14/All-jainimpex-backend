import fetch from 'node-fetch';

const testActualEndpoint = async () => {
  try {
    console.log('🔍 TESTING ACTUAL API ENDPOINT');
    console.log('='.repeat(50));
    
    const baseUrl = 'http://localhost:5000';
    const productId = '6979b839be2f2eaac8767ccd';
    
    // First, let's test if the server is running
    console.log('📡 Testing server connection...');
    try {
      const healthCheck = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('Server response status:', healthCheck.status);
      if (healthCheck.status === 401) {
        console.log('✅ Server is running (401 expected without auth token)');
      }
    } catch (error) {
      console.log('❌ Server connection failed:', error.message);
      console.log('Please make sure the backend server is running on port 5000');
      return;
    }
    
    // Test the detailed analytics endpoint
    console.log('\n📊 Testing detailed analytics endpoint...');
    const url = `${baseUrl}/api/sales-analytics/product-details?productId=${productId}&period=30days`;
    console.log('URL:', url);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Note: In real usage, this would need a valid JWT token
          // 'Authorization': 'Bearer YOUR_JWT_TOKEN'
        }
      });
      
      console.log('Response Status:', response.status);
      console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.status === 401) {
        console.log('❌ Authentication required. This is expected without a valid JWT token.');
        console.log('The endpoint is protected and requires authentication.');
        console.log('In the browser, the request would include the auth token from localStorage.');
        return;
      }
      
      const data = await response.json();
      console.log('\n📋 Response Data:');
      console.log(JSON.stringify(data, null, 2));
      
    } catch (error) {
      console.error('❌ API request failed:', error.message);
    }
    
    // Test the bulk analytics endpoint for comparison
    console.log('\n📊 Testing bulk analytics endpoint for comparison...');
    const bulkUrl = `${baseUrl}/api/sales-analytics/products?productIds=${productId}&period=30days`;
    console.log('Bulk URL:', bulkUrl);
    
    try {
      const bulkResponse = await fetch(bulkUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Bulk Response Status:', bulkResponse.status);
      
      if (bulkResponse.status === 401) {
        console.log('❌ Authentication required for bulk endpoint too.');
        return;
      }
      
      const bulkData = await bulkResponse.json();
      console.log('\n📋 Bulk Response Data:');
      console.log(JSON.stringify(bulkData, null, 2));
      
    } catch (error) {
      console.error('❌ Bulk API request failed:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

console.log('🚀 Starting API endpoint test...');
console.log('Make sure the backend server is running on http://localhost:5000');
console.log('');

testActualEndpoint();