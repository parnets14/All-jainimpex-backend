import axios from 'axios';
import mongoose from 'mongoose';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import User from './models/User.js';
import Region from './models/Region.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

async function testAPIIntegration() {
  try {
    console.log('🧪 Testing API Integration...');
    
    // Connect to get real data
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    const warehouse = await Warehouse.findOne();
    const product = await Product.findOne();
    const user = await User.findOne();
    
    console.log('📦 Using real data for API test:');
    console.log('- Warehouse:', warehouse.name);
    console.log('- Product:', product.itemName);
    console.log('- User:', user.name);
    
    await mongoose.disconnect();
    
    // Test data for API call
    const testAdjustment = {
      warehouseId: warehouse._id.toString(),
      adjustmentType: "ADD",
      reason: "Opening Stock",
      remarks: "API integration test",
      items: [
        {
          productId: product._id.toString(),
          quantity: 3,
          unitPrice: product.unitPrice || 100,
          remarks: "API test item"
        }
      ],
      createdBy: user._id.toString()
    };
    
    console.log('\n🚀 Testing API endpoints...');
    
    // Test 1: Check if server is running
    console.log('\n1. Testing server health...');
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/check-auth`);
      console.log('✅ Server is running');
    } catch (error) {
      console.log('❌ Server not running or not accessible');
      console.log('Please make sure the backend server is running on port 5000');
      return;
    }
    
    // Test 2: Test GET /api/stock-adjustments (without auth - should fail)
    console.log('\n2. Testing GET /api/stock-adjustments (without auth)...');
    try {
      const response = await axios.get(`${API_BASE_URL}/stock-adjustments`);
      console.log('⚠️ Unexpected success - should require auth');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly requires authentication');
      } else {
        console.log('❌ Unexpected error:', error.response?.status, error.message);
      }
    }
    
    // Test 3: Login to get token
    console.log('\n3. Testing login to get auth token...');
    let authToken = null;
    try {
      const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
        email: user.email,
        password: 'admin123' // Common default password
      });
      
      if (loginResponse.data.success && loginResponse.data.token) {
        authToken = loginResponse.data.token;
        console.log('✅ Login successful, got auth token');
      } else {
        console.log('❌ Login failed:', loginResponse.data.message);
        console.log('Note: You may need to use the correct password for the user');
        return;
      }
    } catch (error) {
      console.log('❌ Login failed:', error.response?.data?.message || error.message);
      console.log('Note: You may need to use the correct password for the user');
      return;
    }
    
    // Test 4: Test authenticated requests
    const authHeaders = {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    };
    
    console.log('\n4. Testing GET /api/stock-adjustments (with auth)...');
    try {
      const response = await axios.get(`${API_BASE_URL}/stock-adjustments`, {
        headers: authHeaders
      });
      console.log('✅ GET stock-adjustments successful');
      console.log(`📊 Found ${response.data.data?.length || 0} existing adjustments`);
    } catch (error) {
      console.log('❌ GET stock-adjustments failed:', error.response?.data?.message || error.message);
    }
    
    console.log('\n5. Testing POST /api/stock-adjustments (create new)...');
    try {
      const response = await axios.post(`${API_BASE_URL}/stock-adjustments`, testAdjustment, {
        headers: authHeaders
      });
      
      if (response.data.success) {
        console.log('✅ POST stock-adjustments successful!');
        console.log('📋 Created adjustment:', response.data.data.adjustmentNo);
        console.log('📋 Total value:', response.data.data.totalValue);
        
        // Clean up - delete the test adjustment
        try {
          await axios.delete(`${API_BASE_URL}/stock-adjustments/${response.data.data._id}`, {
            headers: authHeaders
          });
          console.log('🧹 Test adjustment cleaned up');
        } catch (cleanupError) {
          console.log('⚠️ Could not clean up test adjustment:', cleanupError.message);
        }
      } else {
        console.log('❌ POST failed:', response.data.message);
      }
    } catch (error) {
      console.log('❌ POST stock-adjustments failed:', error.response?.data?.message || error.message);
      if (error.response?.data?.error) {
        console.log('Error details:', error.response.data.error);
      }
    }
    
    console.log('\n6. Testing GET /api/stock-adjustments/stats...');
    try {
      const response = await axios.get(`${API_BASE_URL}/stock-adjustments/stats`, {
        headers: authHeaders
      });
      console.log('✅ GET stats successful');
      console.log('📊 Stats:', response.data.data);
    } catch (error) {
      console.log('❌ GET stats failed:', error.response?.data?.message || error.message);
    }
    
  } catch (error) {
    console.error('🚨 Unexpected error:', error.message);
  }
}

console.log('🔧 API Integration Test');
console.log('📝 This test requires the backend server to be running on port 5000');
console.log('📝 Run: npm start or node server.js in the backend directory');
console.log('');

testAPIIntegration();