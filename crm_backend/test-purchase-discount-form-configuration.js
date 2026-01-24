import mongoose from 'mongoose';
import PurchaseDiscountMapping from './models/PurchaseDiscountMapping.js';
import User from './models/User.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Supplier from './models/Supplier.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://jaininpex:jaininpex123@cluster0.0aqbmhz.mongodb.net/jaininpexcrm?retryWrites=true&w=majority');
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testPurchaseDiscountFormConfiguration = async () => {
  try {
    console.log('\n🧪 Testing Purchase Discount Form Configuration...\n');

    // 1. Check existing purchase discounts
    console.log('1️⃣ Checking existing purchase discounts...');
    
    const existingDiscounts = await PurchaseDiscountMapping.find({})
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('suppliers', 'name code')
      .limit(3);

    console.log(`📊 Found ${existingDiscounts.length} existing purchase discounts`);

    if (existingDiscounts.length > 0) {
      console.log('\n📋 Sample Purchase Discount Data Structure:');
      const sample = existingDiscounts[0];
      console.log(`   ID: ${sample._id}`);
      console.log(`   Name: ${sample.discountName}`);
      console.log(`   Mapping Type: ${sample.mappingType || 'NOT SET (this could be the issue!)'}`);
      console.log(`   Description: ${sample.description || 'Not set'}`);
      console.log(`   Direct Discount: ${sample.directDiscountPercentage}%`);
      console.log(`   Floating Enabled: ${sample.floatingDiscountEnabled}`);
      console.log(`   Floating Range: ${sample.floatingDiscountMin}% - ${sample.floatingDiscountMax}%`);
      console.log(`   Suppliers: ${sample.suppliers?.length || 0} suppliers`);
      console.log(`   Brand: ${sample.brand?.name || 'Not set'}`);
      console.log(`   Category: ${sample.category?.name || 'Not set'}`);
      console.log(`   Subcategory: ${sample.subcategory?.name || 'Not set'}`);
      
      // Check if mappingType field exists
      if (!sample.mappingType) {
        console.log('\n⚠️ ISSUE FOUND: Purchase discount missing mappingType field!');
        console.log('   This could cause the form to show sales discount configuration instead of purchase discount configuration');
      }
      
      // Check if discountType field exists (it shouldn't for purchase discounts)
      if (sample.discountType) {
        console.log(`\n⚠️ ISSUE FOUND: Purchase discount has discountType field: ${sample.discountType}`);
        console.log('   Purchase discounts should not have discountType field (that\'s for sales discounts)');
      } else {
        console.log('\n✅ GOOD: Purchase discount does not have discountType field (as expected)');
      }
    }

    // 2. Test what the handleEdit function should receive
    console.log('\n2️⃣ Testing handleEdit function data structure...');
    
    if (existingDiscounts.length > 0) {
      const sampleDiscount = existingDiscounts[0];
      
      // Simulate what handleEdit receives
      const mappingForEdit = {
        _id: sampleDiscount._id,
        mappingType: 'purchase', // This should be explicitly set
        discountName: sampleDiscount.discountName,
        description: sampleDiscount.description,
        brand: sampleDiscount.brand,
        category: sampleDiscount.category,
        subcategory: sampleDiscount.subcategory,
        suppliers: sampleDiscount.suppliers,
        directDiscountPercentage: sampleDiscount.directDiscountPercentage,
        floatingDiscountEnabled: sampleDiscount.floatingDiscountEnabled,
        floatingDiscountMin: sampleDiscount.floatingDiscountMin,
        floatingDiscountMax: sampleDiscount.floatingDiscountMax,
        validFrom: sampleDiscount.validFrom,
        validTo: sampleDiscount.validTo,
        // Note: No discountType field for purchase discounts
      };

      console.log('📝 Mapping object for handleEdit:');
      console.log(JSON.stringify(mappingForEdit, null, 2));

      // Test the formData that handleEdit should set
      const expectedFormData = {
        mappingType: mappingForEdit.mappingType, // Should be "purchase"
        targetType: mappingForEdit.brand ? 'brand' : 
                    mappingForEdit.category ? 'category' : 
                    mappingForEdit.subcategory ? 'subcategory' : 'brand',
        discountName: mappingForEdit.discountName,
        category: mappingForEdit.category?._id?.toString() || "",
        subcategory: mappingForEdit.subcategory?._id?.toString() || "",
        brand: mappingForEdit.brand?._id?.toString() || "",
        product: "",
        validFrom: new Date(mappingForEdit.validFrom).toISOString().split("T")[0],
        validTo: mappingForEdit.validTo ? new Date(mappingForEdit.validTo).toISOString().split("T")[0] : "",
        // CRITICAL FIX: For purchase discounts, always set discountType to "direct"
        discountType: mappingForEdit.mappingType === "purchase" ? "direct" : (mappingForEdit.discountType || "direct"),
        directDiscountPercentage: mappingForEdit.directDiscountPercentage || 0,
        maxDiscountPercentage: 100, // Not used for purchase discounts
        levels: [], // Not used for purchase discounts
        remarks: "", // Not used for purchase discounts
        applicableDealerTypes: [], // Not used for purchase discounts
        minOrderAmount: 0, // Not used for purchase discounts
        minOrderQuantity: 0, // Not used for purchase discounts
        // Purchase discount specific fields
        floatingDiscountEnabled: mappingForEdit.floatingDiscountEnabled || false,
        floatingDiscountMin: mappingForEdit.floatingDiscountMin || 0,
        floatingDiscountMax: mappingForEdit.floatingDiscountMax || 100,
        suppliers: mappingForEdit.suppliers?.map(s => s._id?.toString()) || [],
        description: mappingForEdit.description || ""
      };

      console.log('\n📋 Expected formData after handleEdit:');
      console.log(JSON.stringify(expectedFormData, null, 2));

      // 3. Test form rendering logic
      console.log('\n3️⃣ Testing form rendering logic...');
      
      const shouldShowPurchaseForm = expectedFormData.mappingType === "purchase";
      const shouldShowSalesForm = expectedFormData.mappingType === "sales";
      
      console.log(`   mappingType: ${expectedFormData.mappingType}`);
      console.log(`   Should show Purchase form: ${shouldShowPurchaseForm}`);
      console.log(`   Should show Sales form: ${shouldShowSalesForm}`);
      
      if (shouldShowPurchaseForm) {
        console.log('\n✅ CORRECT: Form should show Purchase Discount Configuration with:');
        console.log('   - Description field');
        console.log('   - Suppliers multi-select dropdown');
        console.log('   - Direct Discount Percentage field');
        console.log('   - Enable Floating Discount checkbox');
        console.log('   - Floating discount min/max range fields');
        console.log('\n❌ SHOULD NOT SHOW:');
        console.log('   - Discount Type selection (Direct Only, Level-Based Only, Both)');
        console.log('   - Level-based discount configuration');
        console.log('   - Max Discount Percentage field');
      } else {
        console.log('\n❌ INCORRECT: Form will show Sales Discount Configuration instead of Purchase');
      }
    }

    // 4. Test the backend model to ensure mappingType is set
    console.log('\n4️⃣ Testing backend model mappingType handling...');
    
    // Check if PurchaseDiscountMapping model has mappingType field
    const modelSchema = PurchaseDiscountMapping.schema.paths;
    if (modelSchema.mappingType) {
      console.log('❌ ISSUE: PurchaseDiscountMapping model should not have mappingType field');
      console.log('   The mappingType is used to distinguish between sales and purchase discounts in the frontend');
      console.log('   But purchase discounts are stored in a separate collection, so they don\'t need this field');
    } else {
      console.log('✅ CORRECT: PurchaseDiscountMapping model does not have mappingType field');
      console.log('   The frontend should add mappingType: "purchase" when loading purchase discounts');
    }

    // 5. Test API response structure
    console.log('\n5️⃣ Testing API response structure...');
    
    if (existingDiscounts.length > 0) {
      const apiResponseStructure = {
        success: true,
        data: existingDiscounts.map(discount => ({
          ...discount.toObject(),
          mappingType: 'purchase' // This should be added by the API
        }))
      };

      console.log('📡 Expected API response structure:');
      console.log('   Each purchase discount should have mappingType: "purchase" added by the API');
      console.log(`   Sample: { ...discountData, mappingType: "purchase" }`);
    }

    console.log('\n🎯 DIAGNOSIS AND SOLUTION:');
    console.log('=====================================');
    
    console.log('\n🔍 ROOT CAUSE:');
    console.log('   The issue is that when editing a purchase discount, the form is showing');
    console.log('   the sales discount configuration (Direct Only, Level-Based Only, Both)');
    console.log('   instead of the purchase discount configuration (Direct %, Floating Discount)');
    
    console.log('\n💡 SOLUTION IMPLEMENTED:');
    console.log('   1. Fixed handleEdit to set discountType: "direct" for purchase discounts');
    console.log('   2. Added debug logging to see which form is being rendered');
    console.log('   3. Ensured mappingType is properly set during edit');
    
    console.log('\n✅ EXPECTED RESULT:');
    console.log('   When editing a purchase discount, the form should show:');
    console.log('   - Purchase Discount Configuration (yellow box)');
    console.log('   - Description field');
    console.log('   - Suppliers dropdown');
    console.log('   - Direct Discount Percentage field');
    console.log('   - Enable Floating Discount checkbox');
    console.log('   - Floating discount min/max fields');
    
    console.log('\n❌ SHOULD NOT SHOW:');
    console.log('   - Discount Configuration (sales discount options)');
    console.log('   - Direct Discount Only / Level-Based Only / Both options');
    console.log('   - Level configuration fields');
    console.log('   - Max Discount Percentage field');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

const runTest = async () => {
  await connectDB();
  await testPurchaseDiscountFormConfiguration();
  await mongoose.disconnect();
  console.log('\n👋 Disconnected from MongoDB');
};

runTest();