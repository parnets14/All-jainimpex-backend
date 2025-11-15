import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

async function testCollectionRoutes() {
  console.log('🧪 Testing Collection Routes...\n');

  try {
    // Test 1: Check if collections endpoint exists
    console.log('1️⃣ Testing GET /api/collections...');
    try {
      const response = await axios.get(`${API_URL}/collections`, {
        headers: {
          'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token
        }
      });
      console.log('✅ Collections endpoint is working!');
      console.log('Response:', response.data);
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Endpoint exists but requires authentication (401)');
      } else if (error.response?.status === 404) {
        console.log('❌ Endpoint not found (404) - Server needs restart!');
      } else {
        console.log('⚠️ Error:', error.message);
      }
    }

    // Test 2: Check if SE collections endpoint exists
    console.log('\n2️⃣ Testing GET /api/se/collections...');
    try {
      const response = await axios.get(`${API_URL}/se/collections`, {
        headers: {
          'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token
        }
      });
      console.log('✅ SE Collections endpoint is working!');
      console.log('Response:', response.data);
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Endpoint exists but requires authentication (401)');
      } else if (error.response?.status === 404) {
        console.log('❌ Endpoint not found (404) - Server needs restart!');
      } else {
        console.log('⚠️ Error:', error.message);
      }
    }

    // Test 3: Check server health
    console.log('\n3️⃣ Testing server health...');
    try {
      const response = await axios.get(`${API_URL}/`);
      console.log('✅ Server is running!');
    } catch (error) {
      console.log('❌ Server is not responding!');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

console.log('='.repeat(50));
console.log('Collection Routes Test');
console.log('='.repeat(50));
testCollectionRoutes();
