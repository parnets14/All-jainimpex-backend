import axios from 'axios';
import mongoose from 'mongoose';
import PurchaseWishlist from './models/PurchaseWishlist.js';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';
const MONGODB_URI = process.env.MONGO_URL || 'mongodb://localhost:27017/jain_inpex_crm';

// Test credentials - replace with actual credentials
const TEST_CREDENTIALS = {
  email:'superadmin@jainimpex.com', // Replace with actual admin email
  password: 'superadmin123' // Replace with actual password
};

async function debugFrontendWishlistMismatch() {
  try {
    console.log('🔍 Debugging Frontend-Backend Wishlist Mismatch...\n');

    // Step 1: Connect to database directly
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Step 2: Login via API to get user info
    console.log('1️⃣ Testing API Login...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, TEST_CREDENTIALS);
    
    if (!loginResponse.data.success) {
      console.log('❌ Login failed:', loginResponse.data.message);
      return;
    }

    const token = loginResponse.data.token;
    const apiUser = loginResponse.data.user;
    console.log('✅ API Login successful');
    console.log('   API User ID:', apiUser._id || apiUser.id);
    console.log('   API User Name:', apiUser.name);
    console.log('   API User Email:', apiUser.email);

    // Step 3: Find the same user in database directly
    console.log('\n2️⃣ Finding user in database...');
    const dbUser = await User.findOne({ email: TEST_CREDENTIALS.email });
    if (dbUser) {
      console.log('✅ Database User found');
      console.log('   DB User ID:', dbUser._id);
      console.log('   DB User Name:', dbUser.name);
      console.log('   DB User Email:', dbUser.email);
      console.log('   ID Match:', (apiUser._id || apiUser.id) === dbUser._id.toString());
    } else {
      console.log('❌ User not found in database');
      return;
    }

    // Step 4: Check all wishlists in database
    console.log('\n3️⃣ Checking all wishlists in database...');
    const allWishlists = await PurchaseWishlist.find({}).populate('createdBy', 'name email');
    console.log(`Found ${allWishlists.length} total wishlists:`);
    
    allWishlists.forEach((wishlist, index) => {
      console.log(`  ${index + 1}. "${wishlist.name}"`);
      console.log(`     ID: ${wishlist._id}`);
      console.log(`     CreatedBy: ${wishlist.createdBy?._id || wishlist.createdBy}`);
      console.log(`     CreatedBy Name: ${wishlist.createdBy?.name || 'Unknown'}`);
      console.log(`     IsActive: ${wishlist.isActive}`);
      console.log(`     Items: ${wishlist.items?.length || 0}`);
      console.log(`     Created: ${wishlist.createdAt}`);
      console.log('');
    });

    // Step 5: Check wishlists for our specific user
    console.log('4️⃣ Checking wishlists for our user...');
    const userWishlists = await PurchaseWishlist.find({ 
      createdBy: dbUser._id,
      isActive: true 
    }).populate('createdBy', 'name email');
    
    console.log(`Found ${userWishlists.length} active wishlists for user ${dbUser.name}:`);
    userWishlists.forEach((wishlist, index) => {
      console.log(`  ${index + 1}. "${wishlist.name}" (${wishlist._id})`);
    });

    // Step 6: Test API call to get wishlists
    console.log('\n5️⃣ Testing API call to get wishlists...');
    const authAxios = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const apiWishlistsResponse = await authAxios.get('/purchase-wishlists');
    console.log('✅ API Response:', {
      success: apiWishlistsResponse.data.success,
      status: apiWishlistsResponse.status,
      count: apiWishlistsResponse.data.data?.length || 0,
      wishlists: apiWishlistsResponse.data.data?.map(w => ({
        id: w._id,
        name: w.name,
        createdBy: w.createdBy
      })) || []
    });

    // Step 7: Compare results
    console.log('\n6️⃣ Analysis:');
    console.log(`Database shows ${userWishlists.length} wishlists for user`);
    console.log(`API returns ${apiWishlistsResponse.data.data?.length || 0} wishlists`);
    
    if (userWishlists.length > 0 && (apiWishlistsResponse.data.data?.length || 0) === 0) {
      console.log('❌ MISMATCH: Database has wishlists but API returns empty');
      console.log('   This suggests the query in getPurchaseWishlists is still incorrect');
      
      // Test the exact query used in the controller
      console.log('\n7️⃣ Testing exact controller query...');
      const controllerQuery = { 
        createdBy: dbUser._id,
        isActive: true
      };
      console.log('Controller query:', JSON.stringify(controllerQuery, null, 2));
      
      const controllerResult = await PurchaseWishlist.find(controllerQuery);
      console.log(`Controller query result: ${controllerResult.length} wishlists`);
      
      if (controllerResult.length === 0) {
        console.log('❌ Controller query returns empty - checking field types...');
        
        // Check field types
        const sampleWishlist = allWishlists[0];
        if (sampleWishlist) {
          console.log('Sample wishlist createdBy field:');
          console.log('  Type:', typeof sampleWishlist.createdBy);
          console.log('  Value:', sampleWishlist.createdBy);
          console.log('  String value:', sampleWishlist.createdBy.toString());
          
          console.log('Query user ID:');
          console.log('  Type:', typeof dbUser._id);
          console.log('  Value:', dbUser._id);
          console.log('  String value:', dbUser._id.toString());
          
          console.log('Match test:', sampleWishlist.createdBy.toString() === dbUser._id.toString());
        }
      }
    } else if (userWishlists.length === apiWishlistsResponse.data.data?.length) {
      console.log('✅ SUCCESS: Database and API results match');
    }

    // Step 8: Create a test wishlist via API and check immediately
    console.log('\n8️⃣ Creating test wishlist via API...');
    const testWishlist = {
      name: `Debug Test ${Date.now()}`,
      description: 'Testing frontend-backend sync',
      items: [],
      tags: ['debug']
    };

    const createResponse = await authAxios.post('/purchase-wishlists', testWishlist);
    console.log('Create response:', {
      success: createResponse.data.success,
      status: createResponse.status,
      wishlistId: createResponse.data.data?._id
    });

    // Immediately check if it appears in database
    if (createResponse.data.success) {
      const newWishlistId = createResponse.data.data._id;
      const dbCheck = await PurchaseWishlist.findById(newWishlistId);
      console.log('Database check after creation:', {
        found: !!dbCheck,
        createdBy: dbCheck?.createdBy,
        isActive: dbCheck?.isActive
      });

      // Immediately check via API
      const immediateApiCheck = await authAxios.get('/purchase-wishlists');
      console.log('Immediate API check:', {
        count: immediateApiCheck.data.data?.length || 0,
        containsNew: immediateApiCheck.data.data?.some(w => w._id === newWishlistId) || false
      });
    }

  } catch (error) {
    console.error('❌ Debug failed:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

debugFrontendWishlistMismatch();

export default debugFrontendWishlistMismatch;