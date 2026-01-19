import mongoose from 'mongoose';
import DiscountMapping from './models/DiscountMapping.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jain_inpex_crm');

async function checkSpecificDiscount() {
  try {
    console.log('🔍 Checking the specific "ok" discount...\n');
    
    // Find the "ok" discount mentioned in the logs
    const okDiscount = await DiscountMapping.findOne({ 
      discountName: 'ok' 
    }).populate('product brand category subcategory extendedSubcategory1 extendedSubcategory2', 'name itemName');
    
    if (!okDiscount) {
      console.log('❌ "ok" discount not found');
      return;
    }
    
    console.log('📋 Found "ok" discount:');
    console.log(`   - ID: ${okDiscount._id}`);
    console.log(`   - Name: ${okDiscount.discountName}`);
    console.log(`   - Type: ${okDiscount.discountType}`);
    console.log(`   - Target Type: ${okDiscount.targetType}`);
    console.log(`   - Direct Discount: ${okDiscount.directDiscountPercentage}%`);
    console.log(`   - Max Discount: ${okDiscount.maxDiscountPercentage}%`);
    console.log(`   - Status: ${okDiscount.status}`);
    console.log(`   - Levels Array:`, okDiscount.levels);
    console.log(`   - Levels Length: ${okDiscount.levels?.length || 0}`);
    console.log(`   - Levels Exists: ${okDiscount.levels !== undefined}`);
    console.log(`   - Extended Subcategory 1: ${okDiscount.extendedSubcategory1?.name || 'Not found'}`);
    console.log('');
    
    // Check if levels field exists but is empty
    if (okDiscount.levels !== undefined && okDiscount.levels.length === 0) {
      console.log('🎯 ISSUE CONFIRMED: Discount has empty levels array');
      console.log('');
      
      console.log('🔧 FIXING: Adding sample levels...');
      
      const sampleLevels = [
        {
          levelName: "Silver",
          discountPercentage: 2,
          description: "Silver level discount"
        },
        {
          levelName: "Gold", 
          discountPercentage: 4,
          description: "Gold level discount"
        },
        {
          levelName: "Platinum",
          discountPercentage: 6,
          description: "Platinum level discount"
        }
      ];
      
      const updatedDiscount = await DiscountMapping.findByIdAndUpdate(
        okDiscount._id,
        { $set: { levels: sampleLevels } },
        { new: true }
      );
      
      console.log('✅ Successfully added levels to "ok" discount');
      console.log('📋 New levels:');
      updatedDiscount.levels.forEach((level, idx) => {
        console.log(`   ${idx + 1}. ${level.levelName} - ${level.discountPercentage}%`);
      });
      console.log('');
      console.log('🎉 The level dropdown should now work in Dealer Invoice!');
    } else if (okDiscount.levels === undefined) {
      console.log('🎯 ISSUE: Levels field does not exist');
      console.log('Adding levels field...');
      
      const sampleLevels = [
        {
          levelName: "Silver",
          discountPercentage: 2,
          description: "Silver level discount"
        },
        {
          levelName: "Gold", 
          discountPercentage: 4,
          description: "Gold level discount"
        }
      ];
      
      await DiscountMapping.findByIdAndUpdate(
        okDiscount._id,
        { $set: { levels: sampleLevels } }
      );
      
      console.log('✅ Added levels field with sample data');
    } else {
      console.log('✅ Discount already has levels:', okDiscount.levels.length);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the check
checkSpecificDiscount();