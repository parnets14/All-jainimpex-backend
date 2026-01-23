import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PurchaseDiscountMapping from './models/PurchaseDiscountMapping.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

// Load environment variables
dotenv.config();

const debugPurchaseDiscountVisibility = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Debugging Purchase Discount Visibility Issue...\n');

    // Check all purchase discounts
    console.log('📝 Step 1: Checking all purchase discounts in database...');
    const allPurchaseDiscounts = await PurchaseDiscountMapping.find()
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    console.log(`Found ${allPurchaseDiscounts.length} purchase discounts:`);
    
    allPurchaseDiscounts.forEach((discount, index) => {
      console.log(`\n   ${index + 1}. ${discount.discountName}`);
      console.log(`      ID: ${discount._id}`);
      console.log(`      Description: ${discount.description}`);
      console.log(`      Direct Discount: ${discount.directDiscountPercentage}%`);
      console.log(`      Floating Discount: ${discount.floatingDiscountEnabled ? `${discount.floatingDiscountMin}%-${discount.floatingDiscountMax}%` : 'Disabled'}`);
      console.log(`      Brand: ${discount.brand?.name || 'All Brands'}`);
      console.log(`      Category: ${discount.category?.name || 'All Categories'}`);
      console.log(`      Subcategory: ${discount.subcategory?.name || 'All Subcategories'}`);
      console.log(`      Valid From: ${discount.validFrom.toDateString()}`);
      console.log(`      Valid To: ${discount.validTo.toDateString()}`);
      console.log(`      Status: ${discount.isActive ? 'Active' : 'Inactive'}`);
      console.log(`      Created By: ${discount.createdBy?.name || 'Unknown'}`);
      console.log(`      Created At: ${discount.createdAt.toDateString()}`);
    });

    // Check if there are any active purchase discounts
    console.log('\n📝 Step 2: Checking active purchase discounts...');
    const activePurchaseDiscounts = await PurchaseDiscountMapping.find({
      isActive: true,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() }
    }).populate('brand category subcategory', 'name');

    console.log(`Found ${activePurchaseDiscounts.length} active purchase discounts:`);
    activePurchaseDiscounts.forEach((discount, index) => {
      console.log(`   ${index + 1}. ${discount.discountName} - ${discount.directDiscountPercentage}% direct`);
    });

    // Check sample products to see if they match any discounts
    console.log('\n📝 Step 3: Checking sample products for discount matching...');
    const sampleProducts = await Product.find()
      .populate('brand category subcategory', 'name')
      .limit(5);

    console.log(`Testing ${sampleProducts.length} sample products:`);
    
    for (const product of sampleProducts) {
      console.log(`\n   Product: ${product.itemName || product.productName}`);
      console.log(`   Brand: ${product.brand?.name || 'No Brand'}`);
      console.log(`   Category: ${product.category?.name || 'No Category'}`);
      console.log(`   Subcategory: ${product.subcategory?.name || 'No Subcategory'}`);
      
      // Find matching discounts for this product
      const matchingDiscounts = activePurchaseDiscounts.filter(discount => {
        // Check if discount applies to this product
        const brandMatch = !discount.brand || discount.brand._id.toString() === product.brand?._id?.toString();
        const categoryMatch = !discount.category || discount.category._id.toString() === product.category?._id?.toString();
        const subcategoryMatch = !discount.subcategory || discount.subcategory._id.toString() === product.subcategory?._id?.toString();
        
        return brandMatch && categoryMatch && subcategoryMatch;
      });
      
      console.log(`   Matching Discounts: ${matchingDiscounts.length}`);
      matchingDiscounts.forEach(discount => {
        console.log(`     - ${discount.discountName} (${discount.directDiscountPercentage}%)`);
      });
    }

    // Check the API endpoint that Purchase Order Management uses
    console.log('\n📝 Step 4: Testing purchase discount API endpoint...');
    
    // Simulate API call to get purchase discounts
    try {
      const testProductId = sampleProducts[0]?._id;
      if (testProductId) {
        const testProduct = sampleProducts[0];
        
        // This simulates the logic that should be in the API
        const applicableDiscounts = await PurchaseDiscountMapping.find({
          isActive: true,
          validFrom: { $lte: new Date() },
          validTo: { $gte: new Date() },
          $or: [
            { brand: null, category: null, subcategory: null }, // Global discounts
            { brand: testProduct.brand?._id, category: null, subcategory: null }, // Brand-specific
            { brand: null, category: testProduct.category?._id, subcategory: null }, // Category-specific
            { brand: null, category: null, subcategory: testProduct.subcategory?._id }, // Subcategory-specific
            { 
              brand: testProduct.brand?._id, 
              category: testProduct.category?._id, 
              subcategory: testProduct.subcategory?._id 
            } // Exact match
          ]
        }).populate('brand category subcategory', 'name');
        
        console.log(`   API Test for Product "${testProduct.itemName}": Found ${applicableDiscounts.length} applicable discounts`);
        applicableDiscounts.forEach(discount => {
          console.log(`     - ${discount.discountName} (${discount.directDiscountPercentage}% direct)`);
        });
      }
    } catch (apiError) {
      console.error('   API Test Error:', apiError.message);
    }

    // Check if the purchase discount routes are properly registered
    console.log('\n📝 Step 5: Checking purchase discount route registration...');
    console.log('   Purchase discount routes should be registered at: /api/purchase-discounts');
    console.log('   Key endpoints:');
    console.log('     - GET /api/purchase-discounts - Get all purchase discounts');
    console.log('     - GET /api/purchase-discounts/product/:productId - Get discounts for specific product');
    console.log('     - POST /api/purchase-discounts - Create new purchase discount');

    console.log('\n✅ Purchase Discount Visibility Debug Complete!');
    
    if (allPurchaseDiscounts.length === 0) {
      console.log('\n❌ ISSUE FOUND: No purchase discounts exist in database');
      console.log('   Solution: Create purchase discounts in Dealer Discount Management');
    } else if (activePurchaseDiscounts.length === 0) {
      console.log('\n❌ ISSUE FOUND: Purchase discounts exist but none are active');
      console.log('   Solution: Check discount validity dates and active status');
    } else {
      console.log('\n✅ Purchase discounts exist and are active');
      console.log('   If not showing in Purchase Order Management, check:');
      console.log('   1. Frontend API integration');
      console.log('   2. Product matching logic');
      console.log('   3. Network requests in browser console');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the debug
debugPurchaseDiscountVisibility();