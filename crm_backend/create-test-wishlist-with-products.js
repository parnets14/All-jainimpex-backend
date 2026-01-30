import mongoose from 'mongoose';
import PurchaseWishlist from './models/PurchaseWishlist.js';
import Product from './models/Product.js';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function createTestWishlistWithProducts() {
  try {
    console.log('🧪 Creating Test Wishlist with Products...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');

    // 1. Find a test user (super admin)
    const testUser = await User.findOne({ role: 'super_admin' });
    if (!testUser) {
      console.log('❌ No super admin user found');
      return;
    }
    console.log(`👤 Using user: ${testUser.name} (${testUser.email})`);

    // 2. Find some test products
    const testProducts = await Product.find({ isActive: true }).limit(5);
    if (testProducts.length === 0) {
      console.log('❌ No active products found');
      return;
    }
    console.log(`📦 Found ${testProducts.length} test products`);

    // 3. Create or update test wishlist
    const wishlistName = 'Test Wishlist for Purchase Discount Integration';
    
    // Delete existing test wishlist if it exists
    await PurchaseWishlist.deleteMany({ name: wishlistName });
    
    const wishlistItems = testProducts.map((product, index) => ({
      productId: product._id,
      requestedQuantity: Math.floor(Math.random() * 10) + 1, // Random quantity 1-10
      notes: `Test item ${index + 1}`,
      priority: ['low', 'normal', 'medium', 'high'][Math.floor(Math.random() * 4)]
    }));

    // Calculate estimated cost
    const totalEstimatedCost = testProducts.reduce((total, product, index) => {
      const quantity = wishlistItems[index].requestedQuantity;
      const price = product.basePrice || product.currentPrice || 0;
      return total + (quantity * price);
    }, 0);

    const testWishlist = new PurchaseWishlist({
      name: wishlistName,
      description: 'Test wishlist created for testing purchase discount integration',
      createdBy: testUser._id,
      isActive: true,
      items: wishlistItems,
      totalEstimatedCost: totalEstimatedCost,
      tags: ['test', 'integration', 'purchase-discount']
    });

    await testWishlist.save();
    console.log(`✅ Created test wishlist: "${testWishlist.name}"`);
    console.log(`   Items: ${testWishlist.items.length}`);
    console.log(`   Estimated Cost: ₹${testWishlist.totalEstimatedCost.toFixed(2)}`);

    // 4. Display wishlist details
    console.log('\n📋 Wishlist Items:');
    for (let i = 0; i < testProducts.length; i++) {
      const product = testProducts[i];
      const item = wishlistItems[i];
      console.log(`   ${i + 1}. ${product.itemName}`);
      console.log(`      Product ID: ${product._id}`);
      console.log(`      Quantity: ${item.requestedQuantity}`);
      console.log(`      Price: ₹${product.basePrice || product.currentPrice || 0}`);
      console.log(`      Priority: ${item.priority}`);
      console.log(`      Notes: ${item.notes}`);
    }

    console.log('\n🎉 Test wishlist created successfully!');
    console.log('\nNext Steps:');
    console.log('1. Run the integration test again');
    console.log('2. Test loading this wishlist in Purchase Order Management');
    console.log('3. Verify purchase discount calculations work');

  } catch (error) {
    console.error('❌ Failed to create test wishlist:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the script
createTestWishlistWithProducts();