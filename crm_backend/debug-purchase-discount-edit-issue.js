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

const debugPurchaseDiscountEditIssue = async () => {
  try {
    console.log('\n🔍 Debugging Purchase Discount Edit Issue...\n');

    // 1. Check if there are any existing purchase discounts
    console.log('1️⃣ Checking existing purchase discounts...');
    
    const existingDiscounts = await PurchaseDiscountMapping.find({})
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('suppliers', 'name code')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    console.log(`📊 Found ${existingDiscounts.length} existing purchase discounts`);

    if (existingDiscounts.length === 0) {
      console.log('⚠️ No existing purchase discounts found. Creating a test one...');
      
      // Create test data
      const testUser = await User.findOne({ role: 'super_admin' });
      const testBrand = await Brand.findOne({ isActive: true });
      const testCategory = await Category.findOne({ isActive: true });
      const testSubcategory = await Subcategory.findOne({ isActive: true });
      const testSupplier = await Supplier.findOne({ isActive: true });

      if (!testUser || !testBrand || !testCategory || !testSubcategory || !testSupplier) {
        console.log('❌ Missing required test data');
        return;
      }

      const testDiscount = new PurchaseDiscountMapping({
        discountName: 'Debug Test Purchase Discount',
        description: 'Test discount for debugging edit functionality',
        brand: testBrand._id,
        category: testCategory._id,
        subcategory: testSubcategory._id,
        suppliers: [testSupplier._id],
        directDiscountPercentage: 5.0,
        floatingDiscountEnabled: true,
        floatingDiscountMin: 2.0,
        floatingDiscountMax: 8.0,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'Approved',
        isActive: true,
        createdBy: testUser._id
      });

      await testDiscount.save();
      console.log(`✅ Created test discount: ${testDiscount._id}`);
      
      // Re-fetch with population
      const populatedDiscount = await PurchaseDiscountMapping.findById(testDiscount._id)
        .populate('brand', 'name')
        .populate('category', 'name')
        .populate('subcategory', 'name')
        .populate('suppliers', 'name code')
        .populate('createdBy', 'name');
      
      existingDiscounts.push(populatedDiscount);
    }

    // 2. Analyze the structure of existing purchase discounts
    console.log('\n2️⃣ Analyzing purchase discount structure...');
    
    for (let i = 0; i < Math.min(existingDiscounts.length, 2); i++) {
      const discount = existingDiscounts[i];
      console.log(`\n📋 Discount ${i + 1}: ${discount.discountName}`);
      console.log(`   ID: ${discount._id}`);
      console.log(`   Status: ${discount.status}`);
      console.log(`   Brand: ${discount.brand?.name || 'Not set'}`);
      console.log(`   Category: ${discount.category?.name || 'Not set'}`);
      console.log(`   Subcategory: ${discount.subcategory?.name || 'Not set'}`);
      console.log(`   Suppliers: ${discount.suppliers?.map(s => s.name).join(', ') || 'Not set'}`);
      console.log(`   Direct Discount: ${discount.directDiscountPercentage}%`);
      console.log(`   Floating Enabled: ${discount.floatingDiscountEnabled}`);
      console.log(`   Floating Range: ${discount.floatingDiscountMin}% - ${discount.floatingDiscountMax}%`);
      console.log(`   Description: ${discount.description || 'Not set'}`);
      console.log(`   Valid From: ${discount.validFrom}`);
      console.log(`   Valid To: ${discount.validTo || 'No end date'}`);
      console.log(`   Created By: ${discount.createdBy?.name || 'Unknown'}`);
    }

    // 3. Test what the frontend handleEdit function should receive
    console.log('\n3️⃣ Testing frontend handleEdit data structure...');
    
    const sampleDiscount = existingDiscounts[0];
    
    // This is what the handleEdit function should set in formData
    const expectedFormData = {
      mappingType: 'purchase', // This should be set correctly
      targetType: sampleDiscount.brand ? 'brand' : 
                  sampleDiscount.category ? 'category' : 
                  sampleDiscount.subcategory ? 'subcategory' : 'brand',
      discountName: sampleDiscount.discountName,
      category: sampleDiscount.category?._id?.toString() || "",
      subcategory: sampleDiscount.subcategory?._id?.toString() || "",
      brand: sampleDiscount.brand?._id?.toString() || "",
      product: "", // Purchase discounts don't target specific products
      validFrom: new Date(sampleDiscount.validFrom).toISOString().split("T")[0],
      validTo: sampleDiscount.validTo ? new Date(sampleDiscount.validTo).toISOString().split("T")[0] : "",
      discountType: "direct", // Purchase discounts are always direct
      directDiscountPercentage: sampleDiscount.directDiscountPercentage || 0,
      maxDiscountPercentage: 100, // Not used for purchase discounts
      levels: [], // Not used for purchase discounts
      remarks: "", // Not used for purchase discounts
      applicableDealerTypes: [], // Not used for purchase discounts
      minOrderAmount: 0, // Not used for purchase discounts
      minOrderQuantity: 0, // Not used for purchase discounts
      // Purchase discount specific fields
      floatingDiscountEnabled: sampleDiscount.floatingDiscountEnabled || false,
      floatingDiscountMin: sampleDiscount.floatingDiscountMin || 0,
      floatingDiscountMax: sampleDiscount.floatingDiscountMax || 100,
      suppliers: sampleDiscount.suppliers?.map(s => s._id?.toString()) || [],
      description: sampleDiscount.description || ""
    };

    console.log('📝 Expected formData structure for handleEdit:');
    console.log(JSON.stringify(expectedFormData, null, 2));

    // 4. Test the search states that should be set
    console.log('\n4️⃣ Testing search states for dropdowns...');
    
    const expectedSearchStates = {
      brandSearch: sampleDiscount.brand?.name || "",
      categorySearch: sampleDiscount.category?.name || "",
      subcategorySearch: sampleDiscount.subcategory?.name || "",
      productSearch: "", // Not used for purchase discounts
      // Supplier search states would need to be handled separately
    };

    console.log('🔍 Expected search states:');
    console.log(JSON.stringify(expectedSearchStates, null, 2));

    // 5. Check if there are any issues with the data types
    console.log('\n5️⃣ Checking data type issues...');
    
    const dataTypeIssues = [];
    
    if (sampleDiscount.brand && typeof sampleDiscount.brand._id !== 'object') {
      dataTypeIssues.push('Brand ID is not ObjectId');
    }
    if (sampleDiscount.category && typeof sampleDiscount.category._id !== 'object') {
      dataTypeIssues.push('Category ID is not ObjectId');
    }
    if (sampleDiscount.subcategory && typeof sampleDiscount.subcategory._id !== 'object') {
      dataTypeIssues.push('Subcategory ID is not ObjectId');
    }
    if (sampleDiscount.suppliers && sampleDiscount.suppliers.some(s => typeof s._id !== 'object')) {
      dataTypeIssues.push('Some supplier IDs are not ObjectId');
    }

    if (dataTypeIssues.length > 0) {
      console.log('⚠️ Data type issues found:');
      dataTypeIssues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log('✅ No data type issues found');
    }

    // 6. Test the API response format
    console.log('\n6️⃣ Testing API response format...');
    
    // Simulate what the API should return
    const apiResponse = {
      success: true,
      data: existingDiscounts,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalRecords: existingDiscounts.length,
        hasNext: false,
        hasPrev: false
      }
    };

    console.log('📡 API Response structure:');
    console.log(`   Success: ${apiResponse.success}`);
    console.log(`   Data count: ${apiResponse.data.length}`);
    console.log(`   Pagination: ${JSON.stringify(apiResponse.pagination)}`);

    // 7. Check for missing fields that might cause edit issues
    console.log('\n7️⃣ Checking for missing fields...');
    
    const requiredFields = [
      'discountName', 'brand', 'category', 'subcategory', 'suppliers',
      'directDiscountPercentage', 'floatingDiscountEnabled', 
      'floatingDiscountMin', 'floatingDiscountMax', 'validFrom'
    ];

    const missingFields = [];
    for (const field of requiredFields) {
      if (!sampleDiscount[field] && sampleDiscount[field] !== 0 && sampleDiscount[field] !== false) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      console.log('⚠️ Missing fields that might cause edit issues:');
      missingFields.forEach(field => console.log(`   - ${field}`));
    } else {
      console.log('✅ All required fields are present');
    }

    console.log('\n🎯 DIAGNOSIS SUMMARY:');
    console.log('=====================================');
    
    if (existingDiscounts.length === 0) {
      console.log('❌ ISSUE: No purchase discounts exist to edit');
    } else {
      console.log('✅ Purchase discounts exist and can be loaded');
    }
    
    if (missingFields.length > 0) {
      console.log('❌ ISSUE: Some required fields are missing from purchase discounts');
    } else {
      console.log('✅ All required fields are present in purchase discounts');
    }
    
    if (dataTypeIssues.length > 0) {
      console.log('❌ ISSUE: Data type problems detected');
    } else {
      console.log('✅ No data type issues detected');
    }

    console.log('\n💡 RECOMMENDATIONS:');
    console.log('=====================================');
    console.log('1. Check if purchase discounts are being loaded correctly in the frontend');
    console.log('2. Verify that the handleEdit function is being called for purchase discounts');
    console.log('3. Check browser console for any JavaScript errors during edit');
    console.log('4. Verify that the form fields are being populated correctly');
    console.log('5. Check if the suppliers dropdown is working correctly');

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
};

const runDebug = async () => {
  await connectDB();
  await debugPurchaseDiscountEditIssue();
  await mongoose.disconnect();
  console.log('\n👋 Disconnected from MongoDB');
};

runDebug();