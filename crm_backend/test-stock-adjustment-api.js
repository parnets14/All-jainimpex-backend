import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

// Test data
const testAdjustment = {
  warehouseId: "60f1b2b3c4d5e6f7a8b9c0d1", // Replace with actual warehouse ID
  adjustmentType: "ADD",
  reason: "Opening Stock",
  remarks: "Test adjustment for debugging",
  items: [
    {
      productId: "60f1b2b3c4d5e6f7a8b9c0d2", // Replace with actual product ID
      quantity: 10,
      unitPrice: 100,
      remarks: "Test item"
    }
  ],
  createdBy: "60f1b2b3c4d5e6f7a8b9c0d3" // Replace with actual user ID
};

async function testStockAdjustmentAPI() {
  try {
    console.log('🧪 Testing Stock Adjustment API...');
    
    // First, test if the server is running
    console.log('\n1. Testing server health...');
    try {
      const healthResponse = await axios.get(`${API_BASE_URL}/auth/check-auth`);
      console.log('✅ Server is running');
    } catch (error) {
      console.log('❌ Server health check failed:', error.message);
      return;
    }
    
    // Test GET /api/stock-adjustments (should work without auth for testing)
    console.log('\n2. Testing GET /api/stock-adjustments...');
    try {
      const getResponse = await axios.get(`${API_BASE_URL}/stock-adjustments`);
      console.log('✅ GET stock-adjustments successful');
      console.log('Response:', getResponse.data);
    } catch (error) {
      console.log('❌ GET stock-adjustments failed:');
      console.log('Status:', error.response?.status);
      console.log('Message:', error.response?.data?.message || error.message);
      console.log('Full error:', error.response?.data);
    }
    
    // Test POST /api/stock-adjustments
    console.log('\n3. Testing POST /api/stock-adjustments...');
    try {
      const postResponse = await axios.post(`${API_BASE_URL}/stock-adjustments`, testAdjustment);
      console.log('✅ POST stock-adjustments successful');
      console.log('Response:', postResponse.data);
    } catch (error) {
      console.log('❌ POST stock-adjustments failed:');
      console.log('Status:', error.response?.status);
      console.log('Message:', error.response?.data?.message || error.message);
      console.log('Full error:', error.response?.data);
      
      // If it's a validation error, show details
      if (error.response?.status === 400) {
        console.log('\n📋 This might be a validation error. Check:');
        console.log('- Warehouse ID exists in database');
        console.log('- Product ID exists in database');
        console.log('- User ID exists in database');
        console.log('- All required fields are provided');
      }
    }
    
    // Test GET stats
    console.log('\n4. Testing GET /api/stock-adjustments/stats...');
    try {
      const statsResponse = await axios.get(`${API_BASE_URL}/stock-adjustments/stats`);
      console.log('✅ GET stock-adjustments/stats successful');
      console.log('Response:', statsResponse.data);
    } catch (error) {
      console.log('❌ GET stock-adjustments/stats failed:');
      console.log('Status:', error.response?.status);
      console.log('Message:', error.response?.data?.message || error.message);
    }
    
  } catch (error) {
    console.error('🚨 Unexpected error:', error.message);
  }
}

// Helper function to get actual IDs from database
async function getTestIds() {
  try {
    console.log('\n🔍 Fetching actual IDs from database...');
    
    // Get warehouses
    try {
      const warehousesResponse = await axios.get(`${API_BASE_URL}/warehouses`);
      if (warehousesResponse.data?.data?.length > 0) {
        console.log('📦 Available Warehouse ID:', warehousesResponse.data.data[0]._id);
        testAdjustment.warehouseId = warehousesResponse.data.data[0]._id;
      }
    } catch (error) {
      console.log('⚠️ Could not fetch warehouses:', error.message);
    }
    
    // Get products
    try {
      const productsResponse = await axios.get(`${API_BASE_URL}/products`);
      if (productsResponse.data?.products?.length > 0) {
        console.log('📦 Available Product ID:', productsResponse.data.products[0]._id);
        testAdjustment.items[0].productId = productsResponse.data.products[0]._id;
      }
    } catch (error) {
      console.log('⚠️ Could not fetch products:', error.message);
    }
    
    // Get users
    try {
      const usersResponse = await axios.get(`${API_BASE_URL}/users`);
      if (usersResponse.data?.users?.length > 0) {
        console.log('👤 Available User ID:', usersResponse.data.users[0]._id);
        testAdjustment.createdBy = usersResponse.data.users[0]._id;
      }
    } catch (error) {
      console.log('⚠️ Could not fetch users:', error.message);
    }
    
  } catch (error) {
    console.log('⚠️ Error fetching test IDs:', error.message);
  }
}

// Run the test
async function runTest() {
  await getTestIds();
  await testStockAdjustmentAPI();
}

runTest();