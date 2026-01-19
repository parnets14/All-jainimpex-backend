import mongoose from 'mongoose';
import DiscountMapping from './models/DiscountMapping.js';

// Connect to MongoDB Atlas
mongoose.connect('mongodb+srv://parnetstech14:parnets14@jainimpexcrm.grb5bho.mongodb.net/?retryWrites=true&w=majority&appName=JainImpexCRM');

async function checkOkDiscountSimple() {
  try {
    console.log('🔍 Checking the "ok" discount (simple version)...\n');
    
    // Wait for connection
    await new Promise(resolve => {
      mongoose.connection.once('open', resolve);
    });
    
    console.log('✅ Connected to database\n');
    
    // Find the "ok" discount without population
    const okDiscount = await DiscountMapping.findOne({ discountName: 'ok' });
    
    if (!okDiscount) {
      console.log('❌ "ok" discount not found');
      return;
    }
    
    console.log('📋 "ok" discount details:');
    console.log(`   - ID: ${okDiscount._id}`);
    console.log(`   - Name: ${okDiscount.discountName}`);
    console.log(`   - Type: ${okDiscount.discountType}`);
    console.log(`   - Target Type: ${okDiscount.targetType}`);
    console.log(`   - Status: ${okDiscount.status}`);
    console.log(`   - Active: ${okDiscount.isActive}`);
    console.log(`   - Direct Discount: ${okDiscount.directDiscountPercentage}%`);
    console.log(`   - Max Discount: ${okDiscount.maxDiscountPercentage}%`);
    console.log(`   - Extended Subcategory 1 ID: ${okDiscount.extendedSubcategory1}`);
    console.log(`   - Valid From: ${okDiscount.validFrom}`);
    console.log(`   - Valid To: ${okDiscount.validTo}`);
    console.log(`   - Levels Array:`, JSON.stringify(okDiscount.levels, null, 2));
    console.log(`   - Levels Count: ${okDiscount.levels?.length || 0}`);
    console.log('');
    
    if (okDiscount.levels && okDiscount.levels.length > 0) {
      console.log('📋 Available levels:');
      okDiscount.levels.forEach((level, idx) => {
        console.log(`   ${idx + 1}. ${level.levelName} - ${level.discountPercentage}%`);
        if (level.description) {
          console.log(`      Description: ${level.description}`);
        }
      });
      console.log('');
      
      console.log('✅ LEVELS ARE PROPERLY DEFINED!');
      console.log('The issue is NOT missing levels in the database.');
      console.log('');
    } else {
      console.log('❌ No levels found - this would cause the frontend issue');
    }
    
    // Check if the discount is currently valid
    const now = new Date();
    const isCurrentlyValid = okDiscount.status === 'Approved' && 
                           okDiscount.isActive && 
                           okDiscount.validFrom <= now && 
                           okDiscount.validTo >= now;
    
    console.log('🕒 Validity check:');
    console.log(`   - Status: ${okDiscount.status} (needs to be "Approved")`);
    console.log(`   - Active: ${okDiscount.isActive} (needs to be true)`);
    console.log(`   - Valid From: ${okDiscount.validFrom} (should be <= now)`);
    console.log(`   - Valid To: ${okDiscount.validTo} (should be >= now)`);
    console.log(`   - Currently Valid: ${isCurrentlyValid}`);
    console.log('');
    
    if (!isCurrentlyValid) {
      console.log('🚨 ISSUE FOUND: Discount is not currently valid!');
      console.log('This could be why it\'s not working properly in the frontend.');
      
      if (okDiscount.status !== 'Approved') {
        console.log('   - Status needs to be "Approved"');
      }
      if (!okDiscount.isActive) {
        console.log('   - Discount needs to be active');
      }
      if (okDiscount.validFrom > now) {
        console.log('   - Valid From date is in the future');
      }
      if (okDiscount.validTo < now) {
        console.log('   - Valid To date has passed');
      }
    } else {
      console.log('✅ Discount is currently valid and should work');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the check
checkOkDiscountSimple();