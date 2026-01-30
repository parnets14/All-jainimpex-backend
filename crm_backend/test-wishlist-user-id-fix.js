import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

// Test credentials - replace with actual credentials
const TEST_CREDENTIALS = {
  email: 'admin@jaininpex.com', // Replace with actual admin email
  password: 'admin123' // Replace with actual password
};

async function testUserIdFix() {
  try {
    console.log('🧪 Testing User ID Fix for Wishlist Visibility...\n');

    // Step 1: Login to get token
    console.log('1️⃣ Logging in...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, TEST_CREDENTIALS);
    
    if (!loginResponse.data.success) {
      console.log('❌ Login failed:', loginResponse.data.message);
      return;
    }

    const token = loginResponse.data.token;
    const user = loginResponse.data.user;
    console.log('✅ Login successful');
    console.log('   User ID:', user._id || user.id);
    console.log('   User Name:', user.name);

    // Set up axios with auth header
    const authAxios = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Step 2: Create a test wishlist
    console.log('\n2️⃣ Creating test wishlist...');
    const newWishlist = {
      name: `Test Fix Wishlist ${Date.now()}`,
      description: 'Testing user ID fix',
      items: [],
      tags: ['test', 'fix']
    };

    const createResponse = await authAxios.post('/purchase-wishlists', newWishlist);
    console.log('✅ Create response:', {
      success: createResponse.data.success,
      status: createResponse.status,
      wishlistId: createResponse.data.data?._id,
      createdBy: createResponse.data.data?.createdBy
    });

    // Step 3: Immediately fetch wishlists to see if it appears
    console.log('\n3️⃣ Fetching wishlists...');
    const getResponse = await authAxios.get('/purchase-wishlists');
    console.log('✅ Fetch response:', {
      success: getResponse.data.success,
      status: getResponse.status,
      count: getResponse.data.data?.length || 0,
      wishlists: getResponse.data.data?.map(w => ({
        id: w._id,
        name: w.name,
        createdBy: w.createdBy
      })) || []
    });

    if (getResponse.data.data?.length > 0) {
      console.log('🎉 SUCCESS: Wishlist is now visible after the fix!');
      
      // Clean up - delete the test wishlist
      const testWishlistId = getResponse.data.data[0]._id;
      console.log('\n4️⃣ Cleaning up test wishlist...');
      const deleteResponse = await authAxios.delete(`/purchase-wishlists/${testWishlistId}`);
      console.log('✅ Cleanup successful:', deleteResponse.data.success);
    } else {
      console.log('❌ ISSUE PERSISTS: Wishlist still not visible');
    }

  } catch (error) {
    console.error('❌ Test failed:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
}

testUserIdFix();

export default testUserIdFix;