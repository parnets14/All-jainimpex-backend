/**
 * Test Admin API Endpoints
 * 
 * This script tests the admin delivery endpoints to verify they return data correctly.
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

async function testAdminAPI() {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║  Test Admin API Endpoints                ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  try {
    // Test without authentication first (should fail with 401)
    console.log('📡 Testing pending-reschedules endpoint...');
    console.log('URL:', `${API_BASE_URL}/admin/deliveries/pending-reschedules`);
    
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/deliveries/pending-reschedules`);
      console.log('✅ Response Status:', response.status);
      console.log('📦 Response Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('⚠️  401 Unauthorized (expected - needs authentication)');
        console.log('💡 This is correct - the endpoint requires authentication');
      } else {
        console.log('❌ Error:', error.response?.status, error.response?.data?.message || error.message);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Test failed deliveries endpoint
    console.log('📡 Testing failed-deliveries endpoint...');
    console.log('URL:', `${API_BASE_URL}/admin/deliveries/failed-deliveries`);
    
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/deliveries/failed-deliveries`);
      console.log('✅ Response Status:', response.status);
      console.log('📦 Response Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('⚠️  401 Unauthorized (expected - needs authentication)');
        console.log('💡 This is correct - the endpoint requires authentication');
      } else {
        console.log('❌ Error:', error.response?.status, error.response?.data?.message || error.message);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 Next Steps:');
    console.log('1. The endpoints are protected and require authentication');
    console.log('2. Check browser console in web app for actual API responses');
    console.log('3. Make sure you are logged in as admin in the web app');
    console.log('4. Check Network tab in browser DevTools');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Unexpected Error:', error.message);
  }
}

testAdminAPI();
