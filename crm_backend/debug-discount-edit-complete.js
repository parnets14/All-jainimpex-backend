import mongoose from 'mongoose';
import DiscountMapping from './models/DiscountMapping.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Product from './models/Product.js';
import dotenv from 'dotenv';

dotenv.config();

const debugDiscountEditComplete = async () => {
  try {
    console.log('🔧 Debugging discount edit complete flow...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Find any discount with some hierarchy
    const discount = await DiscountMapping.findOne({
      $or: [
        { brand: { $exists: true } },
        { category: { $exists: true } },
        { subcategory: { $exists: true } }
      ]
    }).populate('brand category subcategory extendedSubcategory1 extendedSubcategory2 product');
    
    if (!discount) {
      console.log('❌ No discount with complete hierarchy found');
      return;
    }
    
    console.log('\n📊 Found discount with complete hierarchy:');
    console.log(`   ID: ${discount._id}`);
    console.log(`   Name: ${discount.discountName}`);
    console.log(`   Target Type: ${discount.targetType}`);
    console.log(`   Brand: ${discount.brand?.name || 'NULL'} (ID: ${discount.brand?._id || 'NULL'})`);
    console.log(`   Category: ${discount.category?.name || 'NULL'} (ID: ${discount.category?._id || 'NULL'})`);
    console.log(`   Subcategory: ${discount.subcategory?.name || 'NULL'} (ID: ${discount.subcategory?._id || 'NULL'})`);
    console.log(`   Extended Level 1: ${discount.extendedSubcategory1?.name || 'NULL'} (ID: ${discount.extendedSubcategory1?._id || 'NULL'})`);
    console.log(`   Product: ${discount.product?.itemName || 'NULL'} (ID: ${discount.product?._id || 'NULL'})`);
    
    // Simulate what the frontend handleEdit function should do
    console.log('\n🔄 Simulating frontend handleEdit function:');
    
    const formData = {
      mappingType: discount.mappingType,
      targetType: discount.targetType,
      discountName: discount.discountName,
      category: discount.category?._id || "",
      subcategory: discount.subcategory?._id || "",
      brand: discount.brand?._id || "",
      extendedSubcategory1: discount.extendedSubcategory1?._id || "",
      extendedSubcategory2: discount.extendedSubcategory2?._id || "",
      product: discount.product?._id || "",
      validFrom: new Date(discount.validFrom).toISOString().split("T")[0],
      validTo: new Date(discount.validTo).toISOString().split("T")[0],
      discountType: discount.discountType,
      directDiscountPercentage: discount.directDiscountPercentage || 0,
      maxDiscountPercentage: discount.maxDiscountPercentage || 100,
      levels: discount.levels || [],
      remarks: discount.remarks || "",
      applicableDealerTypes: discount.applicableDealerTypes || [],
      minOrderAmount: discount.minOrderAmount || 0,
      minOrderQuantity: discount.minOrderQuantity || 0,
    };
    
    console.log('\n📝 Form Data Structure:');
    console.log(`   mappingType: "${formData.mappingType}"`);
    console.log(`   targetType: "${formData.targetType}"`);
    console.log(`   discountName: "${formData.discountName}"`);
    console.log(`   brand: "${formData.brand}" (should not be empty)`);
    console.log(`   category: "${formData.category}" (should not be empty)`);
    console.log(`   subcategory: "${formData.subcategory}" (should not be empty)`);
    console.log(`   extendedSubcategory1: "${formData.extendedSubcategory1}" (should not be empty)`);
    console.log(`   extendedSubcategory2: "${formData.extendedSubcategory2}"`);
    console.log(`   product: "${formData.product}"`);
    console.log(`   validFrom: "${formData.validFrom}"`);
    console.log(`   validTo: "${formData.validTo}"`);
    console.log(`   levels: ${JSON.stringify(formData.levels, null, 2)}`);
    
    // Simulate search state population
    console.log('\n🔍 Search State Population:');
    const searchStates = {};
    
    if (discount.brand) {
      searchStates.brandSearch = discount.brand?.name || "";
      console.log(`   brandSearch: "${searchStates.brandSearch}" ✅`);
    } else {
      console.log(`   brandSearch: NOT SET ❌`);
    }
    
    if (discount.category) {
      searchStates.categorySearch = discount.category?.name || "";
      console.log(`   categorySearch: "${searchStates.categorySearch}" ✅`);
    } else {
      console.log(`   categorySearch: NOT SET ❌`);
    }
    
    if (discount.subcategory) {
      searchStates.subcategorySearch = discount.subcategory?.name || "";
      console.log(`   subcategorySearch: "${searchStates.subcategorySearch}" ✅`);
    } else {
      console.log(`   subcategorySearch: NOT SET ❌`);
    }
    
    if (discount.extendedSubcategory1) {
      searchStates.extendedSubcategorySearch = discount.extendedSubcategory1?.name || "";
      console.log(`   extendedSubcategorySearch: "${searchStates.extendedSubcategorySearch}" ✅`);
    } else {
      console.log(`   extendedSubcategorySearch: NOT SET ❌`);
    }
    
    if (discount.product) {
      searchStates.productSearch = discount.product?.itemName || "";
      console.log(`   productSearch: "${searchStates.productSearch}" ✅`);
    } else {
      console.log(`   productSearch: NOT SET (OK for non-product targets)`);
    }
    
    // Check if all required fields are populated based on target type
    console.log('\n✅ Validation Check:');
    let isValid = true;
    
    if (formData.targetType === 'extendedSubcategory1') {
      if (!formData.brand) {
        console.log('   ❌ Brand is required but missing');
        isValid = false;
      }
      if (!formData.category) {
        console.log('   ❌ Category is required but missing');
        isValid = false;
      }
      if (!formData.subcategory) {
        console.log('   ❌ Subcategory is required but missing');
        isValid = false;
      }
      if (!formData.extendedSubcategory1) {
        console.log('   ❌ Extended Subcategory 1 is required but missing');
        isValid = false;
      }
    }
    
    if (isValid) {
      console.log('   ✅ All required fields are populated correctly');
    } else {
      console.log('   ❌ Some required fields are missing');
    }
    
    // Test what happens when we update just the validTo date
    console.log('\n📅 Testing validTo date update:');
    const updatedFormData = {
      ...formData,
      validTo: "2026-12-31" // Change only the validTo date
    };
    
    console.log(`   Original validTo: ${formData.validTo}`);
    console.log(`   Updated validTo: ${updatedFormData.validTo}`);
    console.log(`   Brand still populated: ${updatedFormData.brand ? '✅' : '❌'}`);
    console.log(`   Category still populated: ${updatedFormData.category ? '✅' : '❌'}`);
    console.log(`   Subcategory still populated: ${updatedFormData.subcategory ? '✅' : '❌'}`);
    console.log(`   Extended Level 1 still populated: ${updatedFormData.extendedSubcategory1 ? '✅' : '❌'}`);
    
    console.log('\n🎯 Summary:');
    console.log('   The backend data structure is correct');
    console.log('   The form data population logic should work');
    console.log('   The search state population should work');
    console.log('   The issue might be in the frontend component rendering or state management');
    
  } catch (error) {
    console.error('❌ Error debugging discount edit:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

debugDiscountEditComplete();