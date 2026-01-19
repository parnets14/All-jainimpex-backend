import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import models
import DiscountMapping from './models/DiscountMapping.js';
import Product from './models/Product.js';

async function debugLevelDiscountIssue() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Debugging Level Discount Issue');
    console.log('=================================');

    // 1. Check existing discount mappings
    const allDiscounts = await DiscountMapping.find({
      status: 'Approved',
      isActive: true
    })
    .populate('product brand category subcategory extendedSubcategory1 extendedSubcategory2', 'name itemName')
    .sort({ createdAt: -1 });

    console.log(`\n📊 Total Active Discount Mappings: ${allDiscounts.length}`);

    // Group by discount type
    const discountsByType = allDiscounts.reduce((acc, discount) => {
      acc[discount.discountType] = (acc[discount.discountType] || 0) + 1;
      return acc;
    }, {});

    console.log('\n📋 Discounts by Type:');
    Object.entries(discountsByType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} discounts`);
    });

    // Group by target type
    const discountsByTarget = allDiscounts.reduce((acc, discount) => {
      acc[discount.targetType] = (acc[discount.targetType] || 0) + 1;
      return acc;
    }, {});

    console.log('\n🎯 Discounts by Target Type:');
    Object.entries(discountsByTarget).forEach(([target, count]) => {
      console.log(`   ${target}: ${count} discounts`);
    });

    // 2. Check level-based discounts specifically
    const levelBasedDiscounts = allDiscounts.filter(d => 
      d.discountType === 'level_based' || d.discountType === 'both'
    );

    console.log(`\n🎚️ Level-Based Discounts: ${levelBasedDiscounts.length}`);

    levelBasedDiscounts.forEach((discount, index) => {
      console.log(`\n${index + 1}. ${discount.discountName}`);
      console.log(`   Type: ${discount.discountType}`);
      console.log(`   Target: ${discount.targetType}`);
      console.log(`   Levels: ${discount.levels?.length || 0}`);
      
      if (discount.levels && discount.levels.length > 0) {
        discount.levels.forEach(level => {
          console.log(`     - ${level.levelName}: ${level.discountPercentage}%`);
        });
      }
      
      // Check target name
      let targetName = 'Unknown';
      switch (discount.targetType) {
        case 'product':
          targetName = discount.product?.itemName || 'Unknown Product';
          break;
        case 'brand':
          targetName = discount.brand?.name || 'Unknown Brand';
          break;
        case 'category':
          targetName = discount.category?.name || 'Unknown Category';
          break;
        case 'subcategory':
          targetName = discount.subcategory?.name || 'Unknown Subcategory';
          break;
        case 'extendedSubcategory1':
          targetName = discount.extendedSubcategory1?.name || 'Unknown Extended Level 1';
          break;
        case 'extendedSubcategory2':
          targetName = discount.extendedSubcategory2?.name || 'Unknown Extended Level 2';
          break;
      }
      console.log(`   Target Name: ${targetName}`);
    });

    // 3. Test with a sample product
    const sampleProduct = await Product.findOne()
      .populate('category brand subcategory subcategory1 subcategory2');

    if (sampleProduct) {
      console.log(`\n🧪 Testing with Sample Product: ${sampleProduct.itemName}`);
      console.log(`   Product ID: ${sampleProduct._id}`);
      console.log(`   Brand: ${sampleProduct.brand?.name || 'N/A'}`);
      console.log(`   Category: ${sampleProduct.category?.name || 'N/A'}`);
      console.log(`   Subcategory: ${sampleProduct.subcategory?.name || 'N/A'}`);
      console.log(`   Extended Level 1: ${sampleProduct.subcategory1?.name || 'N/A'}`);
      console.log(`   Extended Level 2: ${sampleProduct.subcategory2?.name || 'N/A'}`);

      // Test findApplicableDiscounts
      const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
        sampleProduct._id,
        'sales'
      );

      console.log(`\n📥 Applicable Discounts Found: ${applicableDiscounts.length}`);

      applicableDiscounts.forEach((discount, index) => {
        console.log(`\n${index + 1}. ${discount.discountName}`);
        console.log(`   Type: ${discount.discountType}`);
        console.log(`   Target: ${discount.targetType}`);
        console.log(`   Direct Discount: ${discount.directDiscountPercentage || 0}%`);
        console.log(`   Levels: ${discount.levels?.length || 0}`);
        
        if (discount.levels && discount.levels.length > 0) {
          console.log(`   Available Levels:`);
          discount.levels.forEach(level => {
            console.log(`     - ${level.levelName}: ${level.discountPercentage}%`);
          });
        }
      });

      // Check if any level-based discounts are found
      const levelDiscounts = applicableDiscounts.filter(d => 
        d.discountType === 'level_based' || d.discountType === 'both'
      );

      console.log(`\n🎚️ Level-Based Discounts for this product: ${levelDiscounts.length}`);

      if (levelDiscounts.length === 0) {
        console.log('\n⚠️ NO LEVEL-BASED DISCOUNTS FOUND!');
        console.log('   This could be why the dropdown shows "No level discount (Direct only)"');
        
        // Check if there are level-based discounts that should match
        const potentialMatches = levelBasedDiscounts.filter(discount => {
          switch (discount.targetType) {
            case 'product':
              return discount.product?.toString() === sampleProduct._id.toString();
            case 'brand':
              return discount.brand?.toString() === sampleProduct.brand?._id?.toString();
            case 'category':
              return discount.category?.toString() === sampleProduct.category?._id?.toString();
            case 'subcategory':
              return discount.subcategory?.toString() === sampleProduct.subcategory?._id?.toString();
            case 'extendedSubcategory1':
              return discount.extendedSubcategory1?.toString() === sampleProduct.subcategory1?._id?.toString();
            case 'extendedSubcategory2':
              return discount.extendedSubcategory2?.toString() === sampleProduct.subcategory2?._id?.toString();
            default:
              return false;
          }
        });

        console.log(`\n🔍 Potential Matches Found: ${potentialMatches.length}`);
        potentialMatches.forEach((match, index) => {
          console.log(`${index + 1}. ${match.discountName} (${match.targetType})`);
        });
      }
    }

    console.log('\n✅ Debug completed!');

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📝 Disconnected from MongoDB');
  }
}

debugLevelDiscountIssue();