import axios from 'axios';

async function testAuthFlow() {
  try {
    console.log('🔍 TESTING AUTHENTICATION FLOW');
    console.log('='.repeat(50));

    const baseURL = 'http://localhost:5000/api';

    // Test without authentication first
    console.log('\n📋 Testing without authentication...');
    try {
      const response = await axios.get(`${baseURL}/brands`);
      console.log('❌ Unexpected: API worked without auth');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Expected: 401 Unauthorized without token');
      } else {
        console.log('❌ Unexpected error:', error.response?.status, error.response?.data?.message);
      }
    }

    // Test with a simple request to check if server is running
    console.log('\n📋 Testing server health...');
    try {
      const response = await axios.get(`${baseURL}/../health`);
      console.log('✅ Server is running');
    } catch (error) {
      console.log('Server health check failed:', error.message);
    }

    // Check if the issue is with the frontend making requests
    console.log('\n📋 Frontend should check:');
    console.log('1. Browser console for authentication errors');
    console.log('2. Network tab for 401/403 responses');
    console.log('3. Check if user is properly logged in');
    console.log('4. Verify token is being sent with requests');

    console.log('\n🔧 POTENTIAL FIXES:');
    console.log('1. User needs to log out and log back in');
    console.log('2. Clear browser cookies/localStorage');
    console.log('3. Check if session expired');
    console.log('4. Verify user has correct permissions');

  } catch (error) {
    console.error('❌ Test Error:', error.message);
  }
}

testAuthFlow();