import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import models
import SalesOrder from './models/SalesOrder.js';

async function testSalesOrderDiscountFields() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧾 Testing Sales Order Discount Fields');
    console.log('=====================================');

    // Find a sample sales order
    const sampleOrder = await SalesOrder.findOne()
      .populate("products.product", "itemName productCode")
      .populate("products.appliedDiscount.discountId", "discountName discountType");

    if (!sampleOrder) {
      console.log('❌ No sales orders found in database');
      return;
    }

    console.log(`\n📋 Sample Order: ${sampleOrder.orderNumber}`);
    console.log(`   Dealer: ${sampleOrder.dealerName}`);
    console.log(`   Products: ${sampleOrder.products.length}`);

    // Check each product for discount fields
    sampleOrder.products.forEach((product, index) => {
      console.log(`\n${index + 1}. Product: ${product.productName || product.product?.itemName}`);
      console.log(`   Product Code: ${product.productCode || product.product?.productCode}`);
      console.log(`   Quantity: ${product.quantity}`);
      console.log(`   Unit Price: ₹${product.unitPrice}`);
      console.log(`   Total Price: ₹${product.totalPrice}`);
      
      // Check discount fields
      console.log(`   --- Discount Information ---`);
      console.log(`   Discount Percentage: ${product.discountPercentage || 0}%`);
      console.log(`   Discount Amount: ₹${product.discountAmount || 0}`);
      console.log(`   Discount Type: ${product.discountType || 'None'}`);
      console.log(`   Selected Level: ${product.selectedDiscountLevel || 'N/A'}`);
      
      if (product.appliedDiscount) {
        console.log(`   Applied Discount:`);
        console.log(`     - ID: ${product.appliedDiscount.discountId}`);
        console.log(`     - Name: ${product.appliedDiscount.discountName}`);
        console.log(`     - Type: ${product.appliedDiscount.discountType}`);
        console.log(`     - Target: ${product.appliedDiscount.targetType}`);
        console.log(`     - Level: ${product.appliedDiscount.selectedLevel || 'N/A'}`);
      } else {
        console.log(`   Applied Discount: None`);
      }
    });

    // Test the model schema
    console.log('\n🔍 Testing Model Schema:');
    console.log('========================');
    
    const schema = SalesOrder.schema.paths['products'].schema.paths;
    const discountFields = [
      'discountPercentage',
      'discountAmount', 
      'discountType',
      'selectedDiscountLevel',
      'appliedDiscount'
    ];

    discountFields.forEach(field => {
      if (schema[field]) {
        console.log(`✅ ${field}: ${schema[field].instance || 'Mixed'}`);
      } else {
        console.log(`❌ ${field}: Missing from schema`);
      }
    });

    // Check if any orders have discount data
    const ordersWithDiscounts = await SalesOrder.countDocuments({
      'products.discountPercentage': { $gt: 0 }
    });

    const ordersWithAppliedDiscounts = await SalesOrder.countDocuments({
      'products.appliedDiscount': { $exists: true, $ne: null }
    });

    console.log('\n📊 Discount Data Statistics:');
    console.log('============================');
    console.log(`Total Orders: ${await SalesOrder.countDocuments()}`);
    console.log(`Orders with Discount Percentage > 0: ${ordersWithDiscounts}`);
    console.log(`Orders with Applied Discount Info: ${ordersWithAppliedDiscounts}`);

    if (ordersWithDiscounts === 0 && ordersWithAppliedDiscounts === 0) {
      console.log('\n⚠️ No orders found with discount information.');
      console.log('   This might be because:');
      console.log('   1. Existing orders were created before discount fields were added');
      console.log('   2. No discounts have been applied to orders yet');
      console.log('   3. The discount fields are not being saved properly');
    }

    console.log('\n✅ Sales Order Discount Fields Test Completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📝 Disconnected from MongoDB');
  }
}

testSalesOrderDiscountFields();