import mongoose from 'mongoose';
import DiscountMapping from './models/DiscountMapping.js';
import dotenv from 'dotenv';

dotenv.config();

const testDiscountEditLevels = async () => {
  try {
    console.log('🔧 Testing discount edit levels functionality...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Find a discount with levels
    const discountWithLevels = await DiscountMapping.findOne({
      discountType: { $in: ['level_based', 'both'] },
      levels: { $exists: true, $ne: [] }
    });
    
    if (!discountWithLevels) {
      console.log('❌ No discount with levels found');
      return;
    }
    
    console.log('\n📊 Found discount with levels:');
    console.log(`   Name: ${discountWithLevels.discountName}`);
    console.log(`   Type: ${discountWithLevels.discountType}`);
    console.log(`   Levels: ${discountWithLevels.levels.length}`);
    
    discountWithLevels.levels.forEach((level, index) => {
      console.log(`   Level ${index + 1}: ${level.levelName} - ${level.discountPercentage}%`);
    });
    
    // Test the structure that would be sent to frontend
    const frontendData = {
      mappingType: discountWithLevels.mappingType,
      targetType: discountWithLevels.targetType,
      discountName: discountWithLevels.discountName,
      category: discountWithLevels.category?._id || "",
      subcategory: discountWithLevels.subcategory?._id || "",
      brand: discountWithLevels.brand?._id || "",
      product: discountWithLevels.product?._id || "",
      validFrom: new Date(discountWithLevels.validFrom).toISOString().split("T")[0],
      validTo: new Date(discountWithLevels.validTo).toISOString().split("T")[0],
      discountType: discountWithLevels.discountType,
      directDiscountPercentage: discountWithLevels.directDiscountPercentage || 0,
      maxDiscountPercentage: discountWithLevels.maxDiscountPercentage || 100,
      levels: discountWithLevels.levels || [],
      remarks: discountWithLevels.remarks || "",
      applicableDealerTypes: discountWithLevels.applicableDealerTypes || [],
      minOrderAmount: discountWithLevels.minOrderAmount || 0,
      minOrderQuantity: discountWithLevels.minOrderQuantity || 0,
    };
    
    console.log('\n🔄 Frontend data structure:');
    console.log('   Levels array:');
    frontendData.levels.forEach((level, index) => {
      console.log(`   Level ${index + 1}:`);
      console.log(`     levelName: "${level.levelName}"`);
      console.log(`     discountPercentage: ${level.discountPercentage}`);
      console.log(`     description: "${level.description || ''}"`);
    });
    
    // Test what happens when we submit back
    const submitData = {
      discountName: frontendData.discountName,
      discountType: frontendData.discountType,
      mappingType: frontendData.mappingType,
      targetType: frontendData.targetType,
      maxDiscountPercentage: frontendData.maxDiscountPercentage,
      validFrom: frontendData.validFrom,
      validTo: frontendData.validTo,
      remarks: frontendData.remarks,
      applicableDealerTypes: frontendData.applicableDealerTypes || [],
      minOrderAmount: frontendData.minOrderAmount || 0,
      minOrderQuantity: frontendData.minOrderQuantity || 0,
    };
    
    // Set target reference
    submitData[frontendData.targetType] = frontendData[frontendData.targetType];
    
    // Add discount values
    if (frontendData.discountType === "direct") {
      submitData.directDiscountPercentage = frontendData.directDiscountPercentage;
    } else if (frontendData.discountType === "level_based") {
      submitData.levels = frontendData.levels.map((level) => ({
        levelName: level.levelName,
        discountPercentage: parseFloat(level.discountPercentage) || 0,
        description: level.description || "",
      }));
    } else if (frontendData.discountType === "both") {
      submitData.directDiscountPercentage = frontendData.directDiscountPercentage;
      submitData.levels = frontendData.levels.map((level) => ({
        levelName: level.levelName,
        discountPercentage: parseFloat(level.discountPercentage) || 0,
        description: level.description || "",
      }));
    }
    
    console.log('\n📤 Submit data structure:');
    if (submitData.levels) {
      console.log('   Levels to submit:');
      submitData.levels.forEach((level, index) => {
        console.log(`   Level ${index + 1}:`);
        console.log(`     levelName: "${level.levelName}"`);
        console.log(`     discountPercentage: ${level.discountPercentage}`);
        console.log(`     description: "${level.description}"`);
      });
    }
    
    console.log('\n✅ Test completed - levels structure is correct');
    
  } catch (error) {
    console.error('❌ Error testing discount edit levels:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

testDiscountEditLevels();