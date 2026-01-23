import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PurchaseDiscountMapping from './models/PurchaseDiscountMapping.js';

// Load environment variables
dotenv.config();

const debugPurchaseDiscountSimple = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Debugging Purchase Discount Visibility Issue...\n');

    // Check all purchase discounts without populate
    console.log('📝 Step 1: Checking all purchase discounts in database...');
    const allPurchaseDiscounts = await PurchaseDiscountMapping.find().sort({ createdAt: -1 });

    console.log(`Found ${allPurchaseDiscounts.length} purchase discounts:`);
    
    allPurchaseDiscounts.forEach((discount, index) => {
      console.log(`\n   ${index + 1}. ${discount.discountName}`);
      console.log(`      ID: ${discount._id}`);
      console.log(`      Description: ${discount.description}`);
      console.log(`      Direct Discount: ${discount.directDiscountPercentage}%`);
      console.log(`      Floating Discount: ${discount.floatingDiscountEnabled ? `${discount.floatingDiscountMin}%-${discount.floatingDiscountMax}%` : 'Disabled'}`);
      console.log(`      Brand ID: ${discount.brand || 'All Brands'}`);
      console.log(`      Category ID: ${discount.category || 'All Categories'}`);
      console.log(`      Subcategory ID: ${discount.subcategory || 'All Subcategories'}`);
      console.log(`      Valid From: ${discount.validFrom.toDateString()}`);
      console.log(`      Valid To: ${discount.validTo.toDateString()}`);
      console.log(`      Status: ${discount.isActive ? 'Active' : 'Inactive'}`);
      console.log(`      Created At: ${discount.createdAt.toDateString()}`);
    });

    // Check if there are any active purchase discounts
    console.log('\n📝 Step 2: Checking active purchase discounts...');
    const currentDate = new Date();
    const activePurchaseDiscounts = await PurchaseDiscountMapping.find({
      isActive: true,
      validFrom: { $lte: currentDate },
      validTo: { $gte: currentDate }
    });

    console.log(`Found ${activePurchaseDiscounts.length} active purchase discounts (valid today):`);
    activePurchaseDiscounts.forEach((discount, index) => {
      console.log(`   ${index + 1}. ${discount.discountName} - ${discount.directDiscountPercentage}% direct`);
      console.log(`      Valid: ${discount.validFrom.toDateString()} to ${discount.validTo.toDateString()}`);
    });

    // Check for recently created discounts (last 7 days)
    console.log('\n📝 Step 3: Checking recently created purchase discounts...');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentDiscounts = await PurchaseDiscountMapping.find({
      createdAt: { $gte: sevenDaysAgo }
    }).sort({ createdAt: -1 });

    console.log(`Found ${recentDiscounts.length} purchase discounts created in last 7 days:`);
    recentDiscounts.forEach((discount, index) => {
      console.log(`   ${index + 1}. ${discount.discountName}`);
      console.log(`      Created: ${discount.createdAt.toDateString()}`);
      console.log(`      Active: ${discount.isActive ? 'Yes' : 'No'}`);
      console.log(`      Valid From: ${discount.validFrom.toDateString()}`);
      console.log(`      Valid To: ${discount.validTo.toDateString()}`);
    });

    // Check for any discounts that might have validation issues
    console.log('\n📝 Step 4: Checking for potential issues...');
    
    const issueChecks = {
      inactiveDiscounts: await PurchaseDiscountMapping.countDocuments({ isActive: false }),
      expiredDiscounts: await PurchaseDiscountMapping.countDocuments({ validTo: { $lt: currentDate } }),
      futureDiscounts: await PurchaseDiscountMapping.countDocuments({ validFrom: { $gt: currentDate } }),
      zeroPercentDiscounts: await PurchaseDiscountMapping.countDocuments({ directDiscountPercentage: 0 })
    };

    console.log('   Potential Issues:');
    console.log(`     - Inactive Discounts: ${issueChecks.inactiveDiscounts}`);
    console.log(`     - Expired Discounts: ${issueChecks.expiredDiscounts}`);
    console.log(`     - Future Discounts: ${issueChecks.futureDiscounts}`);
    console.log(`     - Zero Percent Discounts: ${issueChecks.zeroPercentDiscounts}`);

    console.log('\n✅ Purchase Discount Debug Complete!');
    
    // Provide diagnosis
    if (allPurchaseDiscounts.length === 0) {
      console.log('\n❌ DIAGNOSIS: No purchase discounts found in database');
      console.log('   SOLUTION: Create purchase discounts using Dealer Discount Management');
      console.log('   1. Go to Sales & Purchase → Dealer Discount Management');
      console.log('   2. Select "Purchase Discount" tab');
      console.log('   3. Create a new purchase discount');
    } else if (activePurchaseDiscounts.length === 0) {
      console.log('\n⚠️ DIAGNOSIS: Purchase discounts exist but none are currently active');
      console.log('   POSSIBLE CAUSES:');
      console.log('   1. Discounts are marked as inactive (isActive: false)');
      console.log('   2. Discounts have expired (validTo date is in the past)');
      console.log('   3. Discounts are scheduled for future (validFrom date is in the future)');
      console.log('   SOLUTION: Check and update discount validity dates and active status');
    } else {
      console.log('\n✅ DIAGNOSIS: Active purchase discounts found');
      console.log('   If discounts are not showing in Purchase Order Management:');
      console.log('   1. Check browser console for API errors');
      console.log('   2. Verify product selection triggers discount lookup');
      console.log('   3. Check if products match discount criteria (brand/category/subcategory)');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the debug
debugPurchaseDiscountSimple();