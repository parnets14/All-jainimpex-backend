import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

// Test credentials - you'll need to use actual credentials
const TEST_CREDENTIALS = {
  email: 'admin@jaininpex.com', // Replace with actual admin email
  password: 'admin123' // Replace with actual password
};

async function testWishlistAPI() {
  try {
    console.log('🧪 Testing Purchase Wishlist API Endpoints...\n');

    // Step 1: Login to get token
    console.log('1️⃣ Logging in...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, TEST_CREDENTIALS);
    
    if (!loginResponse.data.success) {
      console.log('❌ Login failed:', loginResponse.data.message);
      return;
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful');

    // Set up axios with auth header
    const authAxios = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Step 2: Test GET /api/purchase-wishlists (should return empty array initially)
    console.log('\n2️⃣ Testing GET /api/purchase-wishlists...');
    const getWishlistsResponse = await authAxios.get('/purchase-wishlists');
    console.log('✅ GET wishlists successful:', {
      success: getWishlistsResponse.data.success,
      count: getWishlistsResponse.data.data?.length || 0
    });

    // Step 3: Test POST /api/purchase-wishlists (create new wishlist)
    console.log('\n3️⃣ Testing POST /api/purchase-wishlists...');
    const newWishlist = {
      name: 'Test API Wishlist',
      description: 'Created via API test',
      items: [], // Empty for now since we don't have product IDs
      tags: ['test', 'api']
    };

    const createResponse = await authAxios.post('/purchase-wishlists', newWishlist);
    console.log('✅ POST wishlist successful:', {
      success: createResponse.data.success,
      id: createResponse.data.data?._id,
      name: createResponse.data.data?.name
    });

    const wishlistId = createResponse.data.data?._id;

    if (wishlistId) {
      // Step 4: Test GET /api/purchase-wishlists/:id
      console.log('\n4️⃣ Testing GET /api/purchase-wishlists/:id...');
      const getWishlistResponse = await authAxios.get(`/purchase-wishlists/${wishlistId}`);
      console.log('✅ GET single wishlist successful:', {
        success: getWishlistResponse.data.success,
        name: getWishlistResponse.data.data?.name
      });

      // Step 5: Test PUT /api/purchase-wishlists/:id (update wishlist)
      console.log('\n5️⃣ Testing PUT /api/purchase-wishlists/:id...');
      const updateData = {
        name: 'Updated Test API Wishlist',
        description: 'Updated via API test'
      };
      const updateResponse = await authAxios.put(`/purchase-wishlists/${wishlistId}`, updateData);
      console.log('✅ PUT wishlist successful:', {
        success: updateResponse.data.success,
        name: updateResponse.data.data?.name
      });

      // Step 6: Test DELETE /api/purchase-wishlists/:id (soft delete)
      console.log('\n6️⃣ Testing DELETE /api/purchase-wishlists/:id...');
      const deleteResponse = await authAxios.delete(`/purchase-wishlists/${wishlistId}`);
      console.log('✅ DELETE wishlist successful:', {
        success: deleteResponse.data.success,
        message: deleteResponse.data.message
      });

      // Step 7: Verify soft delete (should not appear in active wishlists)
      console.log('\n7️⃣ Verifying soft delete...');
      const verifyResponse = await authAxios.get('/purchase-wishlists');
      const deletedWishlistExists = verifyResponse.data.data?.some(w => w._id === wishlistId);
      console.log('✅ Soft delete verified:', {
        deletedWishlistInActiveList: deletedWishlistExists,
        message: deletedWishlistExists ? 'ERROR: Deleted wishlist still appears' : 'Correctly hidden from active list'
      });
    }

    console.log('\n🎉 All API endpoint tests completed successfully!');

  } catch (error) {
    console.error('❌ API test failed:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
}

// Run the test
testWishlistAPI();

export default testWishlistAPI;