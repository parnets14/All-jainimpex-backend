import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import the Dealer model
import Dealer from './models/Dealer.js';

async function testExtraDiscountsView() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_inpex_crm');
    console.log('✅ Connected to MongoDB');

    // Find a dealer with extra discounts
    const dealerWithDiscounts = await Dealer.findOne({ 
      extraDiscounts: { $exists: true, $ne: [] } 
    });

    if (!dealerWithDiscounts) {
      console.log('❌ No dealer found with extra discounts');
      
      // Create a test dealer with extra discounts
      console.log('🔄 Creating test dealer with extra discounts...');
      
      const testDealer = new Dealer({
        code: 'TEST001',
        name: 'Test Dealer for View Mode',
        contactPerson: 'Test Contact',
        phone: '1234567890',
        address: 'Test Address',
        dealerType: 'Retail',
        dealerCategory: ['507f1f77bcf86cd799439011'], // dummy ObjectId
        regionId: '507f1f77bcf86cd799439011', // dummy ObjectId
        salesExecutiveId: '507f1f77bcf86cd799439011', // dummy ObjectId
        extraDiscounts: [
          {
            targetType: 'brand',
            targetId: new mongoose.Types.ObjectId(),
            targetName: 'Test Brand',
            discountPercentage: 5.5,
            description: 'Special brand discount',
            isActive: true,
            createdAt: new Date()
          },
          {
            targetType: 'product',
            targetId: new mongoose.Types.ObjectId(),
            targetName: 'Test Product',
            discountPercentage: 10.0,
            description: 'Product specific discount',
            isActive: true,
            createdAt: new Date()
          }
        ]
      });

      await testDealer.save();
      console.log('✅ Test dealer created with extra discounts');
      
      // Retrieve the created dealer
      const createdDealer = await Dealer.findById(testDealer._id);
      console.log('📊 Created dealer extra discounts:');
      console.log(JSON.stringify(createdDealer.extraDiscounts, null, 2));
      
      return;
    }

    console.log('✅ Found dealer with extra discounts:', dealerWithDiscounts.name);
    console.log('📊 Dealer ID:', dealerWithDiscounts._id);
    console.log('📊 Extra discounts count:', dealerWithDiscounts.extraDiscounts.length);
    
    console.log('\n📋 Extra Discounts Details:');
    dealerWithDiscounts.extraDiscounts.forEach((discount, index) => {
      console.log(`\n${index + 1}. Discount:`);
      console.log(`   Target Type: ${discount.targetType}`);
      console.log(`   Target ID: ${discount.targetId}`);
      console.log(`   Target Name: ${discount.targetName}`);
      console.log(`   Discount Percentage: ${discount.discountPercentage}%`);
      console.log(`   Description: ${discount.description || 'N/A'}`);
      console.log(`   Is Active: ${discount.isActive}`);
      console.log(`   Created At: ${discount.createdAt}`);
    });

    // Test the view mode data structure
    console.log('\n🔍 Testing View Mode Data Structure:');
    const viewModeData = {
      extraDiscounts: dealerWithDiscounts.extraDiscounts.map(discount => ({
        targetType: discount.targetType,
        targetName: discount.targetName,
        discountPercentage: discount.discountPercentage,
        description: discount.description,
        isActive: discount.isActive,
        createdAt: discount.createdAt
      }))
    };
    
    console.log('📊 View mode data:');
    console.log(JSON.stringify(viewModeData, null, 2));

    // Calculate summary statistics
    const totalDiscounts = dealerWithDiscounts.extraDiscounts.length;
    const activeDiscounts = dealerWithDiscounts.extraDiscounts.filter(d => d.isActive !== false).length;
    const inactiveDiscounts = dealerWithDiscounts.extraDiscounts.filter(d => d.isActive === false).length;
    const avgDiscount = totalDiscounts > 0 ? 
      (dealerWithDiscounts.extraDiscounts.reduce((sum, d) => sum + (d.discountPercentage || 0), 0) / totalDiscounts).toFixed(2) 
      : 0;

    console.log('\n📈 Summary Statistics:');
    console.log(`   Total: ${totalDiscounts} discounts`);
    console.log(`   Active: ${activeDiscounts}`);
    console.log(`   Inactive: ${inactiveDiscounts}`);
    console.log(`   Average: ${avgDiscount}% extra discount`);

  } catch (error) {
    console.error('❌ Error testing extra discounts view:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the test
testExtraDiscountsView();