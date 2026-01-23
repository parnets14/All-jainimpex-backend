import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PurchaseDiscountMapping from './models/PurchaseDiscountMapping.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';

// Load environment variables
dotenv.config();

const testPurchaseDiscountHierarchical = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Testing Purchase Discount Hierarchical Logic...\n');

    // Step 1: Get the existing purchase discount
    console.log('📝 Step 1: Checking existing purchase discount...');
    const existingDiscount = await PurchaseDiscountMapping.findOne({ discountName: 'gg' })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name');

    if (!existingDiscount) {
      console.log('❌ No purchase discount named "gg" found');
      return;
    }

    console.log('✅ Found purchase discount:');
    console.log(`   Name: ${existingDiscount.discountName}`);
    console.log(`   Direct Discount: ${existingDiscount.directDiscountPercentage}%`);
    console.log(`   Floating Discount: ${existingDiscount.floatingDiscountEnabled ? `${existingDiscount.floatingDiscountMin}%-${existingDiscount.floatingDiscountMax}%` : 'Disabled'}`);
    console.log(`   Brand: ${existingDiscount.brand?.name || 'All Brands'} (ID: ${existingDiscount.brand || 'None'})`);
    console.log(`   Category: ${existingDiscount.category?.name || 'All Categories'} (ID: ${existingDiscount.category || 'None'})`);
    console.log(`   Subcategory: ${existingDiscount.subcategory?.name || 'All Subcategories'} (ID: ${existingDiscount.subcategory || 'None'})`);
    console.log(`   Status: ${existingDiscount.status}`);
    console.log(`   Active: ${existingDiscount.isActive}`);
    console.log(`   Valid From: ${existingDiscount.validFrom.toDateString()}`);
    console.log(`   Valid To: ${existingDiscount.validTo ? existingDiscount.validTo.toDateString() : 'No expiry'}`);

    // Step 2: Get the brand details
    if (existingDiscount.brand) {
      console.log('\n📝 Step 2: Checking brand details...');
      const brand = await Brand.findById(existingDiscount.brand);
      if (brand) {
        console.log(`✅ Brand found: ${brand.name} (ID: ${brand._id})`);
        
        // Step 3: Find all products under this brand
        console.log('\n📝 Step 3: Finding products under this brand...');
        const productsUnderBrand = await Product.find({ brand: brand._id })
          .populate('brand', 'name')
          .populate('category', 'name')
          .populate('subcategory', 'name')
          .limit(10);

        console.log(`✅ Found ${productsUnderBrand.length} products under brand "${brand.name}":`);
        productsUnderBrand.forEach((product, index) => {
          console.log(`   ${index + 1}. ${product.itemName || product.productName}`);
          console.log(`      Product ID: ${product._id}`);
          console.log(`      Brand: ${product.brand?.name || 'No Brand'}`);
          console.log(`      Category: ${product.category?.name || 'No Category'}`);
          console.log(`      Subcategory: ${product.subcategory?.name || 'No Subcategory'}`);
        });

        // Step 4: Test hierarchical matching logic
        console.log('\n📝 Step 4: Testing hierarchical matching logic...');
        
        for (const product of productsUnderBrand.slice(0, 3)) { // Test first 3 products
          console.log(`\n   Testing product: ${product.itemName || product.productName}`);
          
          // Simulate the frontend logic
          const shouldMatch = (() => {
            // Check if discount is currently valid
            const now = new Date();
            const validFrom = new Date(existingDiscount.validFrom);
            const validTo = existingDiscount.validTo ? new Date(existingDiscount.validTo) : null;
            
            if (now < validFrom || (validTo && now > validTo)) {
              console.log(`     ❌ Discount not valid (now: ${now.toDateString()}, valid: ${validFrom.toDateString()} to ${validTo ? validTo.toDateString() : 'no expiry'})`);
              return false;
            }

            // Check if discount is approved and active
            if (existingDiscount.status !== 'Approved' || !existingDiscount.isActive) {
              console.log(`     ❌ Discount not approved or active (status: ${existingDiscount.status}, active: ${existingDiscount.isActive})`);
              return false;
            }

            // Brand matching - if discount has brand set, product must have same brand
            if (existingDiscount.brand) {
              const discountBrandId = existingDiscount.brand._id || existingDiscount.brand;
              const productBrandId = product.brand?._id || product.brand;
              if (discountBrandId.toString() !== productBrandId.toString()) {
                console.log(`     ❌ Brand mismatch (discount: ${discountBrandId}, product: ${productBrandId})`);
                return false;
              }
            }
            
            // Category matching - if discount has category set, product must have same category
            if (existingDiscount.category) {
              const discountCategoryId = existingDiscount.category._id || existingDiscount.category;
              const productCategoryId = product.category?._id || product.category;
              if (discountCategoryId.toString() !== productCategoryId.toString()) {
                console.log(`     ❌ Category mismatch (discount: ${discountCategoryId}, product: ${productCategoryId})`);
                return false;
              }
            }
            
            // Subcategory matching - if discount has subcategory set, product must have same subcategory
            if (existingDiscount.subcategory) {
              const discountSubcategoryId = existingDiscount.subcategory._id || existingDiscount.subcategory;
              const productSubcategoryId = product.subcategory?._id || product.subcategory;
              if (discountSubcategoryId.toString() !== productSubcategoryId.toString()) {
                console.log(`     ❌ Subcategory mismatch (discount: ${discountSubcategoryId}, product: ${productSubcategoryId})`);
                return false;
              }
            }
            
            console.log(`     ✅ All hierarchy conditions matched!`);
            return true;
          })();

          if (shouldMatch) {
            console.log(`     ✅ MATCH: Product "${product.itemName}" should get ${existingDiscount.directDiscountPercentage}% discount`);
          } else {
            console.log(`     ❌ NO MATCH: Product "${product.itemName}" should NOT get discount`);
          }
        }

        // Step 5: Test with the model's static method
        console.log('\n📝 Step 5: Testing with model\'s findApplicableDiscounts method...');
        
        if (productsUnderBrand.length > 0) {
          const testProduct = productsUnderBrand[0];
          const applicableDiscounts = await PurchaseDiscountMapping.findApplicableDiscounts(testProduct._id);
          
          console.log(`   Testing product: ${testProduct.itemName || testProduct.productName}`);
          console.log(`   Found ${applicableDiscounts.length} applicable discounts:`);
          
          applicableDiscounts.forEach((discount, index) => {
            console.log(`     ${index + 1}. ${discount.discountName} - ${discount.directDiscountPercentage}% direct`);
          });
        }
      }
    }

    console.log('\n✅ Purchase Discount Hierarchical Test Complete!');
    
    // Provide diagnosis
    if (existingDiscount.status !== 'Approved') {
      console.log('\n❌ ISSUE FOUND: Purchase discount is not approved');
      console.log(`   Current status: ${existingDiscount.status}`);
      console.log('   SOLUTION: Approve the purchase discount in Dealer Discount Management');
    } else if (!existingDiscount.isActive) {
      console.log('\n❌ ISSUE FOUND: Purchase discount is not active');
      console.log('   SOLUTION: Activate the purchase discount in Dealer Discount Management');
    } else if (existingDiscount.brand) {
      console.log('\n✅ DIAGNOSIS: Purchase discount should work for all products under the specified brand');
      console.log('   If not showing in Purchase Order Management:');
      console.log('   1. Check browser console for API errors');
      console.log('   2. Ensure products being selected belong to the same brand');
      console.log('   3. Verify the frontend hierarchical matching logic is working');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the test
testPurchaseDiscountHierarchical();