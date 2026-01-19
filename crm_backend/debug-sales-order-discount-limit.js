import mongoose from 'mongoose';
import SalesOrder from './models/SalesOrder.js';
import DiscountMapping from './models/DiscountMapping.js';
import Dealer from './models/Dealer.js';

// Connect to MongoDB Atlas
mongoose.connect('mongodb+srv://parnetstech14:parnets14@jainimpexcrm.grb5bho.mongodb.net/?retryWrites=true&w=majority&appName=JainImpexCRM');

const debugSalesOrderDiscountLimit = async () => {
  try {
    console.log('🔍 DEBUGGING SALES ORDER DISCOUNT LIMIT ISSUE');
    console.log('=' .repeat(60));
    
    // Find the specific sales order SO-2026-0002
    const salesOrder = await SalesOrder.findOne({ 
      salesOrderNumber: 'SO-2026-0002' 
    }).populate('dealer').populate('products.product');
    
    if (!salesOrder) {
      console.log('❌ Sales Order SO-2026-0002 not found');
      return;
    }
    
    console.log('📋 SALES ORDER DETAILS:');
    console.log(`   Order Number: ${salesOrder.salesOrderNumber}`);
    console.log(`   Dealer: ${salesOrder.dealer?.name}`);
    console.log(`   Dealer Type: ${salesOrder.dealer?.dealerType}`);
    console.log(`   Status: ${salesOrder.status}`);
    console.log(`   Created: ${salesOrder.createdAt}`);
    console.log('');
    
    // Check each product's discount
    console.log('🎯 PRODUCT DISCOUNT ANALYSIS:');
    console.log('-'.repeat(50));
    
    for (let i = 0; i < salesOrder.products.length; i++) {
      const product = salesOrder.products[i];
      console.log(`\n📦 Product ${i + 1}: ${product.productName}`);
      console.log(`   Product ID: ${product.product}`);
      console.log(`   Discount Percentage: ${product.discountPercentage}%`);
      console.log(`   Discount Amount: ₹${product.discountAmount}`);
      console.log(`   Selected Level: ${product.selectedDiscountLevel || 'None'}`);
      console.log(`   Applied Discount:`, product.appliedDiscount);
      
      // Find applicable discount mapping for this product
      const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
        product.product,
        'sales',
        salesOrder.dealer?.dealerType
      );
      
      console.log(`   📊 Available Discounts: ${applicableDiscounts.length}`);
      
      if (applicableDiscounts.length > 0) {
        const discount = applicableDiscounts[0];
        console.log(`   🎁 Discount Details:`);
        console.log(`      Name: ${discount.discountName}`);
        console.log(`      Type: ${discount.discountType}`);
        console.log(`      Max Limit: ${discount.maxDiscountPercentage}%`);
        console.log(`      Direct Discount: ${discount.directDiscountPercentage}%`);
        
        if (discount.levels && discount.levels.length > 0) {
          console.log(`      Available Levels:`);
          discount.levels.forEach(level => {
            console.log(`         - ${level.levelName}: ${level.discountPercentage}%`);
          });
        }
        
        // Check if current discount exceeds max limit
        if (product.discountPercentage > discount.maxDiscountPercentage) {
          console.log(`   ⚠️  LIMIT VIOLATION DETECTED!`);
          console.log(`      Applied: ${product.discountPercentage}%`);
          console.log(`      Max Allowed: ${discount.maxDiscountPercentage}%`);
          console.log(`      Excess: ${product.discountPercentage - discount.maxDiscountPercentage}%`);
        } else {
          console.log(`   ✅ Within limit (${product.discountPercentage}% ≤ ${discount.maxDiscountPercentage}%)`);
        }
      } else {
        console.log(`   ❌ No applicable discount found`);
      }
    }
    
    // Check dealer extra discounts
    console.log('\n💰 DEALER EXTRA DISCOUNTS:');
    console.log('-'.repeat(30));
    
    if (salesOrder.dealer?.extraDiscounts && salesOrder.dealer.extraDiscounts.length > 0) {
      console.log(`   Found ${salesOrder.dealer.extraDiscounts.length} extra discounts:`);
      salesOrder.dealer.extraDiscounts.forEach((extraDiscount, idx) => {
        console.log(`   ${idx + 1}. Target: ${extraDiscount.targetType}`);
        console.log(`      Target ID: ${extraDiscount.targetId}`);
        console.log(`      Discount: ${extraDiscount.discountPercentage}%`);
        console.log(`      Description: ${extraDiscount.description}`);
      });
    } else {
      console.log('   No extra discounts found for this dealer');
    }
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log('=' .repeat(30));
    const totalDiscountAmount = salesOrder.products.reduce((sum, p) => sum + (p.discountAmount || 0), 0);
    const totalOrderAmount = salesOrder.totalAmount || 0;
    const grossAmount = salesOrder.grossAmount || 0;
    const discountPercentage = grossAmount > 0 ? ((totalDiscountAmount / grossAmount) * 100) : 0;
    
    console.log(`   Gross Amount: ₹${grossAmount.toLocaleString()}`);
    console.log(`   Total Discount: ₹${totalDiscountAmount.toLocaleString()}`);
    console.log(`   Total Amount: ₹${totalOrderAmount.toLocaleString()}`);
    console.log(`   Overall Discount %: ${discountPercentage.toFixed(2)}%`);
    
    // Check if any product violates limits
    const violations = [];
    for (const product of salesOrder.products) {
      const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
        product.product,
        'sales',
        salesOrder.dealer?.dealerType
      );
      
      if (applicableDiscounts.length > 0) {
        const maxLimit = applicableDiscounts[0].maxDiscountPercentage;
        if (product.discountPercentage > maxLimit) {
          violations.push({
            productName: product.productName,
            applied: product.discountPercentage,
            maxLimit: maxLimit,
            excess: product.discountPercentage - maxLimit
          });
        }
      }
    }
    
    if (violations.length > 0) {
      console.log('\n🚨 LIMIT VIOLATIONS FOUND:');
      console.log('=' .repeat(40));
      violations.forEach((violation, idx) => {
        console.log(`   ${idx + 1}. ${violation.productName}`);
        console.log(`      Applied: ${violation.applied}%`);
        console.log(`      Max Limit: ${violation.maxLimit}%`);
        console.log(`      Excess: ${violation.excess}%`);
      });
      
      console.log('\n🔧 RECOMMENDED ACTIONS:');
      console.log('   1. Add validation in Sales Order Dashboard');
      console.log('   2. Prevent saving orders that exceed limits');
      console.log('   3. Show warning messages to users');
      console.log('   4. Consider approval workflow for limit violations');
    } else {
      console.log('\n✅ No limit violations found');
    }
    
  } catch (error) {
    console.error('❌ Error debugging sales order:', error);
  } finally {
    mongoose.connection.close();
  }
};

debugSalesOrderDiscountLimit();