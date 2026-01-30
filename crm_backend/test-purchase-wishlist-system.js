import mongoose from 'mongoose';
import PurchaseWishlist from './models/PurchaseWishlist.js';
import Product from './models/Product.js';
import User from './models/User.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_inpex_crm';

async function testPurchaseWishlistSystem() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find a test user
    const testUser = await User.findOne({ role: { $in: ['admin', 'super_admin'] } });
    if (!testUser) {
      console.log('❌ No admin user found for testing');
      return;
    }
    console.log('👤 Using test user:', testUser.name);

    // Find some test products
    const testProducts = await Product.find().limit(5);
    if (testProducts.length === 0) {
      console.log('❌ No products found for testing');
      return;
    }
    console.log('📦 Found', testProducts.length, 'test products');

    // Test 1: Create a new wishlist
    console.log('\n🧪 Test 1: Creating a new wishlist...');
    const wishlistData = {
      name: 'Test Urgent Restock',
      description: 'Test wishlist for urgent restocking items',
      createdBy: testUser._id,
      items: testProducts.slice(0, 3).map((product, index) => ({
        productId: product._id,
        requestedQuantity: (index + 1) * 10,
        priority: ['urgent', 'high', 'medium'][index],
        notes: `Test item ${index + 1}`
      })),
      tags: ['test', 'urgent']
    };

    const newWishlist = new PurchaseWishlist(wishlistData);
    await newWishlist.save();
    console.log('✅ Created wishlist:', newWishlist.name, 'with ID:', newWishlist._id);

    // Test 2: Fetch wishlists
    console.log('\n🧪 Test 2: Fetching wishlists...');
    const wishlists = await PurchaseWishlist.find({ createdBy: testUser._id })
      .populate('items.productId', 'productCode itemName basePrice')
      .populate('createdBy', 'name email');
    
    console.log('✅ Found', wishlists.length, 'wishlists');
    wishlists.forEach(wishlist => {
      console.log(`  - ${wishlist.name}: ${wishlist.items.length} items, Est. Cost: ₹${wishlist.totalEstimatedCost}`);
    });

    // Test 3: Add items to existing wishlist
    console.log('\n🧪 Test 3: Adding items to wishlist...');
    if (testProducts.length > 3) {
      const additionalItems = testProducts.slice(3).map(product => ({
        productId: product._id,
        requestedQuantity: 5,
        priority: 'normal',
        notes: 'Added via test'
      }));

      newWishlist.items.push(...additionalItems);
      await newWishlist.save();
      console.log('✅ Added', additionalItems.length, 'items to wishlist');
    }

    // Test 4: Update wishlist
    console.log('\n🧪 Test 4: Updating wishlist...');
    newWishlist.description = 'Updated test description';
    newWishlist.tags.push('updated');
    await newWishlist.save();
    console.log('✅ Updated wishlist description and tags');

    // Test 5: Calculate estimated cost
    console.log('\n🧪 Test 5: Calculating estimated cost...');
    const productIds = newWishlist.items.map(item => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    
    let totalCost = 0;
    newWishlist.items.forEach(item => {
      const product = products.find(p => p._id.toString() === item.productId.toString());
      if (product && product.basePrice) {
        totalCost += product.basePrice * item.requestedQuantity;
      }
    });

    newWishlist.totalEstimatedCost = totalCost;
    await newWishlist.save();
    console.log('✅ Calculated estimated cost: ₹', totalCost.toLocaleString());

    // Test 6: Query with filters
    console.log('\n🧪 Test 6: Testing queries with filters...');
    const activeWishlists = await PurchaseWishlist.find({
      createdBy: testUser._id,
      isActive: true
    });
    console.log('✅ Found', activeWishlists.length, 'active wishlists');

    const urgentWishlists = await PurchaseWishlist.find({
      createdBy: testUser._id,
      tags: 'urgent'
    });
    console.log('✅ Found', urgentWishlists.length, 'urgent wishlists');

    // Test 7: Remove item from wishlist
    console.log('\n🧪 Test 7: Removing item from wishlist...');
    if (newWishlist.items.length > 1) {
      const removedItem = newWishlist.items.pop();
      await newWishlist.save();
      console.log('✅ Removed item from wishlist, remaining items:', newWishlist.items.length);
    }

    // Test 8: Soft delete wishlist
    console.log('\n🧪 Test 8: Soft deleting wishlist...');
    newWishlist.isActive = false;
    await newWishlist.save();
    console.log('✅ Soft deleted wishlist');

    // Verify soft delete
    const activeCount = await PurchaseWishlist.countDocuments({
      createdBy: testUser._id,
      isActive: true
    });
    const totalCount = await PurchaseWishlist.countDocuments({
      createdBy: testUser._id
    });
    console.log('✅ Active wishlists:', activeCount, 'Total wishlists:', totalCount);

    console.log('\n🎉 All tests completed successfully!');

    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    await PurchaseWishlist.deleteMany({ name: /^Test/ });
    console.log('✅ Cleanup completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the test
testPurchaseWishlistSystem();

export default testPurchaseWishlistSystem;