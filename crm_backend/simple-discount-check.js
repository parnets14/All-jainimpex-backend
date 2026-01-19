import mongoose from 'mongoose';
import DiscountMapping from './models/DiscountMapping.js';

// Connect to MongoDB
mongoose.connect('mongodb+srv://parnetstech14:parnets14@jainimpexcrm.grb5bho.mongodb.net/?retryWrites=true&w=majority&appName=JainImpexCRM');

async function simpleDiscountCheck() {
  try {
    console.log('🔍 Simple discount check...\n');
    
    // Wait for connection
    await new Promise(resolve => {
      mongoose.connection.once('open', resolve);
    });
    
    console.log('✅ Connected to database\n');
    
    // Check if DiscountMapping collection exists and has data
    const discountCount = await DiscountMapping.countDocuments();
    console.log(`📊 DiscountMapping collection has ${discountCount} documents\n`);
    
    if (discountCount === 0) {
      console.log('❌ No discounts found in DiscountMapping collection');
      console.log('This explains why level discounts are not working!\n');
      
      console.log('🔧 SOLUTION: You need to create discounts in Dealer Discount Management first');
      console.log('Steps:');
      console.log('1. Go to Dealer Discount Management');
      console.log('2. Create a new discount with type "both" or "level_based"');
      console.log('3. Add levels (Silver, Gold, Platinum, etc.)');
      console.log('4. Set target type to Extended Level 1 or Extended Level 2');
      console.log('5. Approve the discount');
      console.log('6. Then test in Dealer Invoice\n');
      
      // Let's also check what collections do exist
      console.log('🔍 Checking what collections exist...');
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log('Available collections:');
      collections.forEach(col => {
        console.log(`  - ${col.name}`);
      });
      
    } else {
      console.log('✅ Found discounts, let me check them...\n');
      
      const allDiscounts = await DiscountMapping.find({}).limit(10);
      
      allDiscounts.forEach((discount, idx) => {
        console.log(`${idx + 1}. "${discount.discountName}"`);
        console.log(`   - Type: ${discount.discountType}`);
        console.log(`   - Target: ${discount.targetType}`);
        console.log(`   - Status: ${discount.status}`);
        console.log(`   - Levels: ${discount.levels?.length || 0}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the check
simpleDiscountCheck();