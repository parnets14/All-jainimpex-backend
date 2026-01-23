import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DiscountMapping from './models/DiscountMapping.js';
import PurchaseDiscountMapping from './models/PurchaseDiscountMapping.js';

// Load environment variables
dotenv.config();

const debugDiscountApprovalError = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    const discountId = '697320fc764817c3af4ff9d8';
    console.log(`🔍 Debugging discount ID: ${discountId}`);

    // Check if it exists in sales discounts
    console.log('\n📝 Checking Sales Discounts...');
    const salesDiscount = await DiscountMapping.findById(discountId);
    if (salesDiscount) {
      console.log('✅ Found in Sales Discounts:');
      console.log(`   Name: ${salesDiscount.discountName}`);
      console.log(`   Type: ${salesDiscount.mappingType || 'sales (default)'}`);
      console.log(`   Status: ${salesDiscount.status}`);
      console.log(`   Created: ${salesDiscount.createdAt}`);
    } else {
      console.log('❌ Not found in Sales Discounts');
    }

    // Check if it exists in purchase discounts
    console.log('\n📝 Checking Purchase Discounts...');
    const purchaseDiscount = await PurchaseDiscountMapping.findById(discountId);
    if (purchaseDiscount) {
      console.log('✅ Found in Purchase Discounts:');
      console.log(`   Name: ${purchaseDiscount.discountName}`);
      console.log(`   Status: ${purchaseDiscount.status}`);
      console.log(`   Created: ${purchaseDiscount.createdAt}`);
    } else {
      console.log('❌ Not found in Purchase Discounts');
    }

    // Check if the ID is valid ObjectId format
    console.log('\n📝 Checking ID Format...');
    if (mongoose.Types.ObjectId.isValid(discountId)) {
      console.log('✅ Valid ObjectId format');
    } else {
      console.log('❌ Invalid ObjectId format');
    }

    // Search for similar IDs (in case of typo)
    console.log('\n📝 Searching for Similar IDs...');
    const partialId = discountId.substring(0, 12); // First 12 characters
    
    const similarSalesDiscounts = await DiscountMapping.find({
      _id: { $regex: `^${partialId}` }
    }).limit(5);
    
    const similarPurchaseDiscounts = await PurchaseDiscountMapping.find({
      _id: { $regex: `^${partialId}` }
    }).limit(5);

    if (similarSalesDiscounts.length > 0) {
      console.log(`📊 Found ${similarSalesDiscounts.length} similar Sales Discounts:`);
      similarSalesDiscounts.forEach((discount, index) => {
        console.log(`  ${index + 1}. ${discount._id} - ${discount.discountName}`);
      });
    }

    if (similarPurchaseDiscounts.length > 0) {
      console.log(`📊 Found ${similarPurchaseDiscounts.length} similar Purchase Discounts:`);
      similarPurchaseDiscounts.forEach((discount, index) => {
        console.log(`  ${index + 1}. ${discount._id} - ${discount.discountName}`);
      });
    }

    // List recent discounts for context
    console.log('\n📝 Recent Discounts (Last 10)...');
    
    const recentSalesDiscounts = await DiscountMapping.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('_id discountName mappingType status createdAt');
    
    const recentPurchaseDiscounts = await PurchaseDiscountMapping.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('_id discountName status createdAt');

    console.log('📊 Recent Sales Discounts:');
    recentSalesDiscounts.forEach((discount, index) => {
      console.log(`  ${index + 1}. ${discount._id} - ${discount.discountName} (${discount.status})`);
    });

    console.log('📊 Recent Purchase Discounts:');
    recentPurchaseDiscounts.forEach((discount, index) => {
      console.log(`  ${index + 1}. ${discount._id} - ${discount.discountName} (${discount.status})`);
    });

    console.log('\n💡 Debugging Summary:');
    console.log('1. Check if the discount exists in the correct collection');
    console.log('2. Verify the frontend is detecting the correct discount type');
    console.log('3. Ensure the approval API is being called correctly');
    console.log('4. Check if the discount was created as purchase but being treated as sales');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the debug
debugDiscountApprovalError();