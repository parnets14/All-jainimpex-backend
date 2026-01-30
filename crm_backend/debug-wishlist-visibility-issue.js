import mongoose from 'mongoose';
import PurchaseWishlist from './models/PurchaseWishlist.js';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_inpex_crm';

async function debugWishlistVisibility() {
  try {
    console.log('🔍 Debugging Wishlist Visibility Issue...\n');
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Check all wishlists in database (raw query)
    console.log('1️⃣ Checking all wishlists in database...');
    const allWishlists = await PurchaseWishlist.find({});
    console.log(`Found ${allWishlists.length} total wishlists in database:`);
    
    allWishlists.forEach((wishlist, index) => {
      console.log(`  ${index + 1}. ID: ${wishlist._id}`);
      console.log(`     Name: ${wishlist.name}`);
      console.log(`     CreatedBy: ${wishlist.createdBy}`);
      console.log(`     IsActive: ${wishlist.isActive}`);
      console.log(`     CreatedAt: ${wishlist.createdAt}`);
      console.log('');
    });

    // Step 2: Check users in database
    console.log('2️⃣ Checking users in database...');
    const allUsers = await User.find({}).select('_id name email role');
    console.log(`Found ${allUsers.length} users:`);
    
    allUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ID: ${user._id}`);
      console.log(`     Name: ${user.name}`);
      console.log(`     Email: ${user.email}`);
      console.log(`     Role: ${user.role}`);
      console.log('');
    });

    // Step 3: Test the exact query used in getPurchaseWishlists
    if (allUsers.length > 0 && allWishlists.length > 0) {
      const testUser = allUsers[0]; // Use first user for testing
      console.log(`3️⃣ Testing query with user: ${testUser.name} (${testUser._id})`);
      
      const query = { 
        createdBy: testUser._id,
        isActive: true
      };
      
      console.log('Query:', JSON.stringify(query, null, 2));
      
      const filteredWishlists = await PurchaseWishlist.find(query)
        .populate({
          path: 'items.productId',
          select: 'productCode itemName description basePrice gst',
          model: 'Product'
        })
        .populate('createdBy', 'name email')
        .sort({ lastUpdated: -1 });
      
      console.log(`Found ${filteredWishlists.length} wishlists for this user`);
      
      if (filteredWishlists.length === 0) {
        console.log('❌ No wishlists found with the filtered query');
        
        // Check if any wishlists match the user ID
        const userWishlists = await PurchaseWishlist.find({ createdBy: testUser._id });
        console.log(`Found ${userWishlists.length} wishlists for user (ignoring isActive filter)`);
        
        if (userWishlists.length > 0) {
          console.log('Issue: Wishlists exist but isActive filter is excluding them');
          userWishlists.forEach(wishlist => {
            console.log(`  - ${wishlist.name}: isActive = ${wishlist.isActive}`);
          });
        } else {
          console.log('Issue: No wishlists found for this user at all');
          
          // Check if createdBy field matches
          console.log('Checking createdBy field types...');
          allWishlists.forEach(wishlist => {
            console.log(`  Wishlist ${wishlist.name}:`);
            console.log(`    createdBy: ${wishlist.createdBy} (type: ${typeof wishlist.createdBy})`);
            console.log(`    testUser._id: ${testUser._id} (type: ${typeof testUser._id})`);
            console.log(`    Match: ${wishlist.createdBy.toString() === testUser._id.toString()}`);
          });
        }
      } else {
        console.log('✅ Query working correctly');
      }
    }

    // Step 4: Check if there are any wishlists with the exact name we created
    console.log('4️⃣ Checking for test wishlists...');
    const testWishlists = await PurchaseWishlist.find({ 
      name: { $regex: /test/i } 
    });
    console.log(`Found ${testWishlists.length} test wishlists:`);
    testWishlists.forEach(wishlist => {
      console.log(`  - ${wishlist.name} (createdBy: ${wishlist.createdBy}, isActive: ${wishlist.isActive})`);
    });

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

debugWishlistVisibility();

export default debugWishlistVisibility;