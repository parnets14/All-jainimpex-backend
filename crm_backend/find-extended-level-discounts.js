import mongoose from 'mongoose';
import DiscountMapping from './models/DiscountMapping.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jain_inpex_crm');

async function findExtendedLevelDiscounts() {
  try {
    console.log('🔍 Searching for Extended Level discounts...\n');
    
    // Find all discounts with extended subcategory target types
    const extendedDiscounts = await DiscountMapping.find({
      $or: [
        { targetType: 'extendedSubcategory1' },
        { targetType: 'extendedSubcategory2' }
      ]
    }).populate('product brand category subcategory extendedSubcategory1 extendedSubcategory2', 'name itemName');
    
    console.log(`Found ${extendedDiscounts.length} Extended Level discounts:\n`);
    
    for (const discount of extendedDiscounts) {
      console.log(`📋 Discount: "${discount.discountName}"`);
      console.log(`   - ID: ${discount._id}`);
      console.log(`   - Type: ${discount.discountType}`);
      console.log(`   - Target Type: ${discount.targetType}`);
      console.log(`   - Direct Discount: ${discount.directDiscountPercentage}%`);
      console.log(`   - Max Discount: ${discount.maxDiscountPercentage}%`);
      console.log(`   - Status: ${discount.status}`);
      console.log(`   - Levels:`, discount.levels);
      console.log(`   - Levels Length: ${discount.levels?.length || 0}`);
      
      // Get target name
      let targetName = 'Unknown';
      if (discount.targetType === 'extendedSubcategory1') {
        targetName = discount.extendedSubcategory1?.name || 'Unknown Extended Level 1';
      } else if (discount.targetType === 'extendedSubcategory2') {
        targetName = discount.extendedSubcategory2?.name || 'Unknown Extended Level 2';
      }
      console.log(`   - Target: ${targetName}`);
      console.log(`   - Created: ${discount.createdAt?.toLocaleDateString()}`);
      console.log('');
      
      // Fix if needed
      if ((discount.discountType === 'level_based' || discount.discountType === 'both') && 
          (!discount.levels || discount.levels.length === 0)) {
        console.log(`🔧 FIXING: Adding levels to "${discount.discountName}"...`);
        
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
        
        await DiscountMapping.findByIdAndUpdate(
          discount._id,
          { $set: { levels: sampleLevels } }
        );
        
        console.log(`✅ Added levels to "${discount.discountName}"`);
        console.log('');
      }
    }
    
    // Also search for any 'both' type discounts
    console.log('🔍 Searching for all "both" type discounts...\n');
    
    const bothTypeDiscounts = await DiscountMapping.find({
      discountType: 'both'
    }).populate('product brand category subcategory extendedSubcategory1 extendedSubcategory2', 'name itemName');
    
    console.log(`Found ${bothTypeDiscounts.length} "both" type discounts:\n`);
    
    for (const discount of bothTypeDiscounts) {
      console.log(`📋 Discount: "${discount.discountName}"`);
      console.log(`   - ID: ${discount._id}`);
      console.log(`   - Target Type: ${discount.targetType}`);
      console.log(`   - Direct Discount: ${discount.directDiscountPercentage}%`);
      console.log(`   - Levels Length: ${discount.levels?.length || 0}`);
      console.log(`   - Status: ${discount.status}`);
      console.log('');
      
      // Fix if needed
      if (!discount.levels || discount.levels.length === 0) {
        console.log(`🔧 FIXING: Adding levels to "${discount.discountName}"...`);
        
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
        
        await DiscountMapping.findByIdAndUpdate(
          discount._id,
          { $set: { levels: sampleLevels } }
        );
        
        console.log(`✅ Added levels to "${discount.discountName}"`);
        console.log('');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the search and fix
findExtendedLevelDiscounts();