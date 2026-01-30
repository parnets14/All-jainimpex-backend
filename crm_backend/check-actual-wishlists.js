import mongoose from 'mongoose';
import PurchaseWishlist from './models/PurchaseWishlist.js';
import Product from './models/Product.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkActualWishlists() {
  try {
    console.log('🔍 Checking Actual Wishlists...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');

    // Find all wishlists
    const allWishlists = await PurchaseWishlist.find({})
      .populate('items.productId')
      .sort({ createdAt: -1 });

    console.log(`📋 Found ${allWishlists.length} total wishlists:`);

    for (const wishlist of allWishlists) {
      console.log(`\n   📝 "${wishlist.name}"`);
      console.log(`      ID: ${wishlist._id}`);
      console.log(`      Items: ${wishlist.items.length}`);
      console.log(`      Active: ${wishlist.isActive}`);
      console.log(`      Created: ${wishlist.createdAt.toLocaleDateString()}`);
      console.log(`      Est. Cost: ₹${wishlist.totalEstimatedCost || 0}`);
      
      if (wishlist.items.length > 0) {
        console.log(`      📦 Items:`);
        wishlist.items.forEach((item, index) => {
          const product = item.productId;
          console.log(`         ${index + 1}. ${product?.itemName || 'Unknown Product'} (Qty: ${item.requestedQuantity})`);
        });
      }
    }

    // Find wishlists with items
    const wishlistsWithItems = allWishlists.filter(w => w.items.length > 0);
    console.log(`\n✅ Wishlists with items: ${wishlistsWithItems.length}`);

    if (wishlistsWithItems.length > 0) {
      console.log('\n🎯 Testing with first wishlist that has items...');
      const testWishlist = wishlistsWithItems[0];
      
      console.log(`\n📋 Testing: "${testWishlist.name}"`);
      console.log(`   Items: ${testWishlist.items.length}`);
      
      // Test the frontend integration simulation
      console.log('\n🔄 Frontend Integration Simulation:');
      const simulatedLines = testWishlist.items.map((item, index) => {
        const product = item.productId;
        const currentPrice = product?.basePrice || product?.currentPrice || 0;
        
        return {
          id: `wishlist_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
          productId: product?._id,
          quantity: item.requestedQuantity || 1,
          price: currentPrice,
          gst: product?.gst || 0,
          lastPrice: 0,
          currentPrice: currentPrice,
          last30DayPurchaseQuantity: 0,
          purchaseDiscountInfo: {
            hasDiscount: false, // Would be calculated by calculatePurchaseDiscount()
            note: 'Discount calculation would happen in frontend'
          }
        };
      });

      console.log(`   ✅ Would create ${simulatedLines.length} purchase order lines`);
      console.log(`   ✅ Each line would have discount calculations applied`);
      console.log(`   ✅ Purchase discount information would display in UI`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the check
checkActualWishlists();