import mongoose from 'mongoose';
import DiscountMapping from './models/DiscountMapping.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jain_inpex_crm');

async function debugAllDiscounts() {
  try {
    console.log('🔍 Searching for ALL discounts in database...\n');
    
    // Find all discounts
    const allDiscounts = await DiscountMapping.find({})
      .populate('product brand category subcategory extendedSubcategory1 extendedSubcategory2', 'name itemName')
      .sort({ createdAt: -1 });
    
    console.log(`Found ${allDiscounts.length} total discounts:\n`);
    
    if (allDiscounts.length === 0) {
      console.log('❌ No discounts found in database!');
      console.log('This might explain why level discounts are not working.');
      return;
    }
    
    for (const discount of allDiscounts) {
      console.log(`📋 Discount: "${discount.discountName}"`);
      console.log(`   - ID: ${discount._id}`);
      console.log(`   - Type: ${discount.discountType}`);
      console.log(`   - Target Type: ${discount.targetType}`);
      console.log(`   - Status: ${discount.status}`);
      console.log(`   - Active: ${discount.isActive}`);
      console.log(`   - Direct Discount: ${discount.directDiscountPercentage}%`);
      console.log(`   - Max Discount: ${discount.maxDiscountPercentage}%`);
      console.log(`   - Levels:`, discount.levels);
      console.log(`   - Levels Length: ${discount.levels?.length || 0}`);
      console.log(`   - Valid From: ${discount.validFrom?.toLocaleDateString()}`);
      console.log(`   - Valid To: ${discount.validTo?.toLocaleDateString()}`);
      console.log(`   - Created: ${discount.createdAt?.toLocaleDateString()}`);
      
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
      console.log('');
      
      // Check if this discount needs fixing
      if ((discount.discountType === 'level_based' || discount.discountType === 'both') && 
          (!discount.levels || discount.levels.length === 0)) {
        console.log(`🚨 ISSUE FOUND: "${discount.discountName}" needs levels!`);
        console.log(`   - This discount has type "${discount.discountType}" but no levels defined`);
        console.log(`   - This would cause "No level discount (Direct only)" in frontend`);
        console.log('');
        
        // Fix this discount
        console.log(`🔧 FIXING: Adding levels to "${discount.discountName}"...`);
        
        const maxAvailable = discount.maxDiscountPercentage - (discount.directDiscountPercentage || 0);
        const sampleLevels = [
          {
            levelName: "Silver",
            discountPercentage: Math.min(2, maxAvailable),
            description: "Silver level discount"
          },
          {
            levelName: "Gold", 
            discountPercentage: Math.min(4, maxAvailable),
            description: "Gold level discount"
          },
          {
            levelName: "Platinum",
            discountPercentage: Math.min(6, maxAvailable),
            description: "Platinum level discount"
          }
        ].filter(level => level.discountPercentage > 0);
        
        if (sampleLevels.length > 0) {
          await DiscountMapping.findByIdAndUpdate(
            discount._id,
            { $set: { levels: sampleLevels } }
          );
          
          console.log(`✅ Added ${sampleLevels.length} levels to "${discount.discountName}"`);
          sampleLevels.forEach((level, idx) => {
            console.log(`   ${idx + 1}. ${level.levelName} - ${level.discountPercentage}%`);
          });
        } else {
          // Convert to direct type if no valid levels can be added
          await DiscountMapping.findByIdAndUpdate(
            discount._id,
            { 
              $set: { discountType: 'direct' },
              $unset: { levels: "" }
            }
          );
          
          console.log(`✅ Converted "${discount.discountName}" to direct type (no room for levels)`);
        }
        console.log('');
      }
    }
    
    // Summary
    const levelBasedCount = allDiscounts.filter(d => d.discountType === 'level_based').length;
    const bothTypeCount = allDiscounts.filter(d => d.discountType === 'both').length;
    const directCount = allDiscounts.filter(d => d.discountType === 'direct').length;
    const activeCount = allDiscounts.filter(d => d.status === 'Approved' && d.isActive).length;
    
    console.log('📊 SUMMARY:');
    console.log(`   - Total Discounts: ${allDiscounts.length}`);
    console.log(`   - Direct Type: ${directCount}`);
    console.log(`   - Level Based Type: ${levelBasedCount}`);
    console.log(`   - Both Type: ${bothTypeCount}`);
    console.log(`   - Active & Approved: ${activeCount}`);
    console.log('');
    
    if (allDiscounts.length > 0) {
      console.log('🎉 Fix completed! Level discounts should now work in Dealer Invoice.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the debug
debugAllDiscounts();