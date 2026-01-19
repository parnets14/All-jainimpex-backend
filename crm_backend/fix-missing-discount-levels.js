import mongoose from 'mongoose';
import DiscountMapping from './models/DiscountMapping.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jain_inpex_crm', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function fixMissingDiscountLevels() {
  try {
    console.log('🔍 Checking for discounts with missing levels...\n');
    
    // Find all discounts with type 'level_based' or 'both' but empty levels array
    const discountsWithMissingLevels = await DiscountMapping.find({
      $or: [
        { discountType: 'level_based' },
        { discountType: 'both' }
      ],
      $or: [
        { levels: { $exists: false } },
        { levels: { $size: 0 } }
      ]
    }).populate('product brand category subcategory extendedSubcategory1 extendedSubcategory2', 'name itemName');
    
    console.log(`Found ${discountsWithMissingLevels.length} discounts with missing levels:\n`);
    
    for (const discount of discountsWithMissingLevels) {
      console.log(`📋 Discount: "${discount.discountName}"`);
      console.log(`   - ID: ${discount._id}`);
      console.log(`   - Type: ${discount.discountType}`);
      console.log(`   - Target Type: ${discount.targetType}`);
      console.log(`   - Direct Discount: ${discount.directDiscountPercentage}%`);
      console.log(`   - Max Discount: ${discount.maxDiscountPercentage}%`);
      console.log(`   - Current Levels: ${discount.levels?.length || 0}`);
      
      // Get target name
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
      console.log(`   - Target: ${targetName}`);
      console.log(`   - Status: ${discount.status}`);
      console.log(`   - Created: ${discount.createdAt?.toLocaleDateString()}`);
      console.log('');
    }
    
    if (discountsWithMissingLevels.length === 0) {
      console.log('✅ No discounts found with missing levels.');
      return;
    }
    
    console.log('🔧 SUGGESTED FIXES:\n');
    console.log('For each discount above, you need to either:');
    console.log('1. Add levels to make it work as level_based/both type');
    console.log('2. Change discountType to "direct" if no levels needed\n');
    
    // Show specific fix for the "ok" discount
    const okDiscount = discountsWithMissingLevels.find(d => d.discountName === 'ok');
    if (okDiscount) {
      console.log('🎯 SPECIFIC FIX FOR "ok" DISCOUNT:\n');
      console.log('Option 1: Add levels to the discount');
      console.log(`db.discountmappings.updateOne(
  { _id: ObjectId("${okDiscount._id}") },
  {
    $set: {
      levels: [
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
      ]
    }
  }
);\n`);
      
      console.log('Option 2: Change to direct type only');
      console.log(`db.discountmappings.updateOne(
  { _id: ObjectId("${okDiscount._id}") },
  {
    $set: {
      discountType: "direct"
    },
    $unset: {
      levels: ""
    }
  }
);\n`);
    }
    
    // Auto-fix option
    console.log('🚀 AUTO-FIX OPTION:\n');
    console.log('Would you like to automatically add sample levels to these discounts?');
    console.log('This will add Silver (2%), Gold (4%), Platinum (6%) levels to each discount.\n');
    
    // Uncomment the following lines to auto-fix
    /*
    for (const discount of discountsWithMissingLevels) {
      const sampleLevels = [
        {
          levelName: "Silver",
          discountPercentage: Math.min(2, discount.maxDiscountPercentage - (discount.directDiscountPercentage || 0)),
          description: "Silver level discount"
        },
        {
          levelName: "Gold", 
          discountPercentage: Math.min(4, discount.maxDiscountPercentage - (discount.directDiscountPercentage || 0)),
          description: "Gold level discount"
        },
        {
          levelName: "Platinum",
          discountPercentage: Math.min(6, discount.maxDiscountPercentage - (discount.directDiscountPercentage || 0)),
          description: "Platinum level discount"
        }
      ];
      
      await DiscountMapping.findByIdAndUpdate(discount._id, {
        $set: { levels: sampleLevels }
      });
      
      console.log(`✅ Added sample levels to "${discount.discountName}"`);
    }
    */
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the check
fixMissingDiscountLevels();