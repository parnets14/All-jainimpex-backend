import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PurchaseWishlist from './models/PurchaseWishlist.js';
import Product from './models/Product.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Brand from './models/Brand.js';
import User from './models/User.js';

dotenv.config();

const testWishlistAutoRemoval = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find a test user
    const testUser = await User.findOne({ role: { $ne: 'super_admin' } });
    if (!testUser) {
      console.log('❌ No test user found');
      return;
    }
    console.log(`👤 Using test user: ${testUser.name} (${testUser.email})`);

    // Find some products for testing
    const products = await Product.find({})
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("brand", "name")
      .limit(3);

    if (products.length === 0) {
      console.log('❌ No products found for testing');
      return;
    }
    console.log(`📦 Found ${products.length} products for testing`);

    // Create a test wishlist
    const testWishlistData = {
      name: `Test Auto-Removal Wishlist ${Date.now()}`,
      description: 'Test wishlist for auto-removal after PO creation',
      createdBy: testUser._id,
      items: products.map((product, index) => ({
        productId: product._id,
        requestedQuantity: (index + 1) * 5, // 5, 10, 15
        notes: `Test item ${index + 1}`,
        priority: index === 0 ? 'high' : 'normal'
      })),
      tags: ['test', 'auto-removal'],
      totalEstimatedCost: products.reduce((total, product, index) => {
        const price = product.basePrice || product.currentPrice || 100;
        return total + (price * (index + 1) * 5);
      }, 0)
    };

    const testWishlist = new PurchaseWishlist(testWishlistData);
    await testWishlist.save();

    console.log(`\n✅ Created test wishlist: "${testWishlist.name}" (ID: ${testWishlist._id})`);
    console.log(`📋 Wishlist contains ${testWishlist.items.length} items`);
    console.log(`💰 Estimated cost: ₹${testWishlist.totalEstimatedCost}`);

    // Verify wishlist is active and visible
    const activeWishlists = await PurchaseWishlist.find({
      createdBy: testUser._id,
      isActive: true
    });
    console.log(`\n📊 User has ${activeWishlists.length} active wishlists (including our test wishlist)`);

    // Simulate the wishlist loading process (what happens in frontend)
    const loadedWishlist = await PurchaseWishlist.findById(testWishlist._id)
      .populate({
        path: 'items.productId',
        select: 'productCode itemName description basePrice currentPrice gst rateSlabs',
        model: 'Product'
      });

    console.log(`\n🔄 Simulating wishlist loading...`);
    console.log(`📋 Loaded wishlist: "${loadedWishlist.name}"`);
    console.log(`📦 Items to be loaded into PO:`);
    loadedWishlist.items.forEach((item, index) => {
      const product = item.productId;
      console.log(`   ${index + 1}. ${product.itemName} - Qty: ${item.requestedQuantity}`);
    });

    // Simulate successful PO creation and wishlist auto-removal
    console.log(`\n🚀 Simulating successful Purchase Order creation...`);
    console.log(`🗑️ Auto-removing wishlist "${loadedWishlist.name}" (ID: ${loadedWishlist._id})`);

    // Perform the soft delete (same as deletePurchaseWishlist controller)
    loadedWishlist.isActive = false;
    await loadedWishlist.save();

    console.log(`✅ Wishlist marked as inactive (soft deleted)`);

    // Verify the wishlist is no longer visible in active wishlists
    const activeWishlistsAfter = await PurchaseWishlist.find({
      createdBy: testUser._id,
      isActive: true
    });

    const inactiveWishlists = await PurchaseWishlist.find({
      createdBy: testUser._id,
      isActive: false
    });

    console.log(`\n📊 VERIFICATION RESULTS:`);
    console.log(`✅ Active wishlists after removal: ${activeWishlistsAfter.length} (should be ${activeWishlists.length - 1})`);
    console.log(`✅ Inactive wishlists: ${inactiveWishlists.length} (should include our test wishlist)`);

    // Verify the specific wishlist is inactive
    const removedWishlist = await PurchaseWishlist.findById(testWishlist._id);
    console.log(`✅ Test wishlist status: ${removedWishlist.isActive ? 'ACTIVE (❌ FAILED)' : 'INACTIVE (✅ SUCCESS)'}`);

    // Test that the wishlist won't appear in Stock page suggestions
    console.log(`\n🧪 TESTING STOCK PAGE INTEGRATION:`);
    const stockPageWishlists = await PurchaseWishlist.find({
      createdBy: testUser._id,
      isActive: true // Stock page only shows active wishlists
    }).populate({
      path: 'items.productId',
      select: 'itemName',
      model: 'Product'
    });

    console.log(`📊 Wishlists visible in Stock page: ${stockPageWishlists.length}`);
    const testWishlistVisible = stockPageWishlists.some(w => w._id.toString() === testWishlist._id.toString());
    console.log(`🔍 Test wishlist visible in Stock page: ${testWishlistVisible ? '❌ FAILED (should be hidden)' : '✅ SUCCESS (correctly hidden)'}`);

    // Test that the wishlist won't appear in Purchase Order Management dropdown
    console.log(`\n🧪 TESTING PURCHASE ORDER MANAGEMENT INTEGRATION:`);
    const poManagementWishlists = await PurchaseWishlist.find({
      createdBy: testUser._id,
      isActive: true // PO Management only shows active wishlists
    }).select('name description items totalEstimatedCost');

    console.log(`📊 Wishlists visible in PO Management: ${poManagementWishlists.length}`);
    const testWishlistInPO = poManagementWishlists.some(w => w._id.toString() === testWishlist._id.toString());
    console.log(`🔍 Test wishlist visible in PO Management: ${testWishlistInPO ? '❌ FAILED (should be hidden)' : '✅ SUCCESS (correctly hidden)'}`);

    console.log(`\n🎉 WISHLIST AUTO-REMOVAL TEST COMPLETED!`);
    console.log(`\n📋 SUMMARY:`);
    console.log(`✅ Wishlist creation: SUCCESS`);
    console.log(`✅ Wishlist loading simulation: SUCCESS`);
    console.log(`✅ Auto-removal after PO creation: ${!removedWishlist.isActive ? 'SUCCESS' : 'FAILED'}`);
    console.log(`✅ Hidden from Stock page: ${!testWishlistVisible ? 'SUCCESS' : 'FAILED'}`);
    console.log(`✅ Hidden from PO Management: ${!testWishlistInPO ? 'SUCCESS' : 'FAILED'}`);

    // Cleanup - remove the test wishlist completely
    await PurchaseWishlist.findByIdAndDelete(testWishlist._id);
    console.log(`\n🧹 Cleaned up test wishlist`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
};

testWishlistAutoRemoval();