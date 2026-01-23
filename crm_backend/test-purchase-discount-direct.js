import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PurchaseDiscountMapping from './models/PurchaseDiscountMapping.js';

// Load environment variables
dotenv.config();

const testPurchaseDiscountDirect = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Testing Purchase Discount Data Directly...\n');

    // Test 1: Get all purchase discounts with the same query as frontend
    console.log('📝 Test 1: Fetching purchase discounts (same as frontend query)...');
    
    const query = {
      status: 'Approved',
      isActive: true
    };
    
    const purchaseDiscounts = await PurchaseDiscountMapping.find(query);
    
    console.log(`✅ Found ${purchaseDiscounts.length} approved and active purchase discounts:`);
    
    purchaseDiscounts.forEach((discount, index) => {
      console.log(`\n   ${index + 1}. ${discount.discountName}`);
      console.log(`      ID: ${discount._id}`);
      console.log(`      Direct Discount: ${discount.directDiscountPercentage}%`);
      console.log(`      Floating: ${discount.floatingDiscountEnabled ? `${discount.floatingDiscountMin}%-${discount.floatingDiscountMax}%` : 'Disabled'}`);
      console.log(`      Brand ID: ${discount.brand || 'All Brands'}`);
      console.log(`      Category ID: ${discount.category || 'All Categories'}`);
      console.log(`      Subcategory ID: ${discount.subcategory || 'All Subcategories'}`);
      console.log(`      Status: ${discount.status}`);
      console.log(`      Active: ${discount.isActive}`);
      console.log(`      Valid From: ${discount.validFrom.toDateString()}`);
      console.log(`      Valid To: ${discount.validTo ? discount.validTo.toDateString() : 'No expiry'}`);
    });

    // Test 2: Simulate frontend hierarchical matching for a Cera product
    if (purchaseDiscounts.length > 0) {
      console.log('\n📝 Test 2: Testing hierarchical matching for Cera products...');
      
      const ceraDiscount = purchaseDiscounts.find(d => d.brand && d.brand.toString() === '6968f3465eb9746eb301e6e2');
      
      if (ceraDiscount) {
        console.log(`\n   Found Cera discount: ${ceraDiscount.discountName}`);
        
        // Test products
        const testProducts = [
          { _id: '6969d6170ae8fdeacfdb683c', name: 'claris', brand: '6968f3465eb9746eb301e6e2' },
          { _id: '6969d72d0ae8fdeacfdb68d1', name: 'celeb 3d black', brand: '6968f3465eb9746eb301e6e2' },
          { _id: '6971b32839870bccbb5cc5c1', name: 'Wire Links', brand: '6968f3465eb9746eb301e6e2' }
        ];
        
        testProducts.forEach(product => {
          console.log(`\n   Testing product: ${product.name}`);
          
          // Simulate the frontend hierarchical matching logic
          const shouldMatch = (() => {
            // Check if discount is currently valid
            const now = new Date();
            const validFrom = new Date(ceraDiscount.validFrom);
            const validTo = ceraDiscount.validTo ? new Date(ceraDiscount.validTo) : null;
            
            if (now < validFrom || (validTo && now > validTo)) {
              console.log(`     ❌ Not valid (now: ${now.toDateString()}, valid: ${validFrom.toDateString()} to ${validTo ? validTo.toDateString() : 'no expiry'})`);
              return false;
            }

            // Check if discount is approved and active
            if (ceraDiscount.status !== 'Approved' || !ceraDiscount.isActive) {
              console.log(`     ❌ Not approved/active (status: ${ceraDiscount.status}, active: ${ceraDiscount.isActive})`);
              return false;
            }

            // Brand matching - if discount has brand set, product must have same brand
            if (ceraDiscount.brand) {
              const discountBrandId = ceraDiscount.brand.toString();
              const productBrandId = product.brand.toString();
              if (discountBrandId !== productBrandId) {
                console.log(`     ❌ Brand mismatch (discount: ${discountBrandId}, product: ${productBrandId})`);
                return false;
              }
            }
            
            console.log(`     ✅ All conditions matched!`);
            return true;
          })();

          if (shouldMatch) {
            console.log(`     ✅ MATCH: Product "${product.name}" should get ${ceraDiscount.directDiscountPercentage}% discount`);
          } else {
            console.log(`     ❌ NO MATCH: Product "${product.name}" should NOT get discount`);
          }
        });
      }
    }

    // Test 3: Check what the frontend API call should return
    console.log('\n📝 Test 3: Simulating frontend API response...');
    
    const frontendResponse = {
      success: true,
      data: purchaseDiscounts.map(discount => ({
        _id: discount._id,
        discountName: discount.discountName,
        description: discount.description,
        directDiscountPercentage: discount.directDiscountPercentage,
        floatingDiscountEnabled: discount.floatingDiscountEnabled,
        floatingDiscountMin: discount.floatingDiscountMin,
        floatingDiscountMax: discount.floatingDiscountMax,
        brand: discount.brand,
        category: discount.category,
        subcategory: discount.subcategory,
        extendedSubcategory: discount.extendedSubcategory,
        status: discount.status,
        isActive: discount.isActive,
        validFrom: discount.validFrom,
        validTo: discount.validTo
      }))
    };
    
    console.log('📋 Frontend should receive this data:');
    console.log(JSON.stringify(frontendResponse, null, 2));

    console.log('\n✅ Purchase Discount Direct Test Complete!');
    
    if (purchaseDiscounts.length === 0) {
      console.log('\n❌ ISSUE: No approved and active purchase discounts found');
    } else {
      console.log('\n✅ DIAGNOSIS: Purchase discounts are correctly configured');
      console.log('   If not showing in Purchase Order Management:');
      console.log('   1. Check if frontend is calling the API correctly');
      console.log('   2. Check if products being selected match the discount criteria');
      console.log('   3. Check browser console for JavaScript errors');
      console.log('   4. Verify the hierarchical matching logic in frontend');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the test
testPurchaseDiscountDirect();