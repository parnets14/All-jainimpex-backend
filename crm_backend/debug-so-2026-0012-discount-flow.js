import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';
import DiscountMapping from './models/DiscountMapping.js';
import Dealer from './models/Dealer.js';

dotenv.config();

const debugSalesOrderDiscountFlow = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find sales order SO-2026-0012
    const salesOrder = await SalesOrder.findOne({ orderNumber: 'SO-2026-0012' })
      .populate('dealer')
      .populate({
        path: 'items.product',
        populate: [
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' },
          { path: 'brand', select: 'name' },
          { path: 'subcategory1', select: 'name parentExtendedSubcategory' },
          { path: 'subcategory2', select: 'name parentExtendedSubcategory' }
        ]
      });
    
    if (!salesOrder) {
      console.log('❌ Sales order SO-2026-0012 not found');
      return;
    }
    
    console.log('\n📋 SALES ORDER DETAILS:');
    console.log('Order Number:', salesOrder.orderNumber);
    console.log('Dealer:', salesOrder.dealer.name);
    console.log('Dealer Type:', salesOrder.dealer.dealerType);
    console.log('Items Count:', salesOrder.items.length);
    console.log('Total Amount:', salesOrder.totalAmount);
    
    console.log('\n🔍 ANALYZING EACH PRODUCT AND ITS DISCOUNTS:\n');
    
    for (let i = 0; i < salesOrder.items.length; i++) {
      const item = salesOrder.items[i];
      const product = item.product;
      
      console.log(`\n${'='.repeat(80)}`);
      console.log(`PRODUCT ${i + 1}: ${product.itemName}`);
      console.log(`${'='.repeat(80)}`);
      
      // Show product hierarchy
      console.log('\n📊 PRODUCT HIERARCHY:');
      console.log('  Category:', product.category?.name || 'N/A');
      console.log('  Subcategory:', product.subcategory?.name || 'N/A');
      console.log('  Brand:', product.brand?.name || 'N/A');
      console.log('  Extended Level 1:', product.subcategory1?.name || 'N/A');
      console.log('  Extended Level 2:', product.subcategory2?.name || 'N/A');
      
      // Find applicable discounts using the model's method
      console.log('\n🎯 FINDING APPLICABLE DISCOUNTS:');
      const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
        product._id,
        'sales',
        salesOrder.dealer.dealerType
      );
      
      console.log(`  Found ${applicableDiscounts.length} applicable discount(s)`);
      
      if (applicableDiscounts.length > 0) {
        applicableDiscounts.forEach((discount, idx) => {
          console.log(`\n  Discount ${idx + 1}:`);
          console.log(`    Name: ${discount.discountName}`);
          console.log(`    Type: ${discount.discountType}`);
          console.log(`    Target Type: ${discount.targetType}`);
          console.log(`    Target Info:`, discount.targetInfo);
          console.log(`    Direct Discount: ${discount.directDiscountPercentage || 0}%`);
          console.log(`    Max Discount Limit: ${discount.maxDiscountPercentage || 100}%`);
          
          if (discount.levels && discount.levels.length > 0) {
            console.log(`    Available Levels:`);
            discount.levels.forEach(level => {
              console.log(`      - ${level.levelName}: ${level.discountPercentage}%`);
            });
          }
        });
      } else {
        console.log('  ❌ No applicable discounts found');
      }
      
      // Check dealer extra discounts
      console.log('\n💰 CHECKING DEALER EXTRA DISCOUNTS:');
      if (salesOrder.dealer.extraDiscounts && salesOrder.dealer.extraDiscounts.length > 0) {
        console.log(`  Dealer has ${salesOrder.dealer.extraDiscounts.length} extra discount(s)`);
        
        const matchingExtraDiscounts = salesOrder.dealer.extraDiscounts.filter(ed => {
          if (!ed.isActive) return false;
          
          switch (ed.targetType) {
            case 'product':
              return ed.targetId.toString() === product._id.toString();
            case 'brand':
              return ed.targetId.toString() === product.brand?._id.toString();
            case 'category':
              return ed.targetId.toString() === product.category?._id.toString();
            case 'subcategory':
              return ed.targetId.toString() === product.subcategory?._id.toString();
            case 'extendedSubcategory':
              return ed.targetId.toString() === product.subcategory1?._id.toString() ||
                     ed.targetId.toString() === product.subcategory2?._id.toString();
            default:
              return false;
          }
        });
        
        if (matchingExtraDiscounts.length > 0) {
          console.log(`  ✅ Found ${matchingExtraDiscounts.length} matching extra discount(s):`);
          matchingExtraDiscounts.forEach(ed => {
            console.log(`    - ${ed.targetType}: ${ed.targetName} = ${ed.discountPercentage}%`);
          });
        } else {
          console.log('  ❌ No matching extra discounts for this product');
        }
      } else {
        console.log('  ℹ️ Dealer has no extra discounts configured');
      }
      
      // Show what's stored in sales order item
      console.log('\n📦 SALES ORDER ITEM DATA:');
      console.log('  Quantity:', item.quantity);
      console.log('  Unit Price:', item.unitPrice);
      console.log('  Discount Percentage:', item.discountPercentage || 0, '%');
      console.log('  Discount Amount:', item.discountAmount || 0);
      console.log('  Total Price:', item.totalPrice);
      
      if (item.appliedDiscount) {
        console.log('\n  Applied Discount Info:');
        console.log('    Discount ID:', item.appliedDiscount.discountId);
        console.log('    Discount Name:', item.appliedDiscount.discountName);
        console.log('    Discount Type:', item.appliedDiscount.discountType);
        console.log('    Target Type:', item.appliedDiscount.targetType);
        
        if (item.appliedDiscount.selectedLevel) {
          console.log('    Selected Level:', item.appliedDiscount.selectedLevel);
        }
        
        if (item.appliedDiscount.levels && item.appliedDiscount.levels.length > 0) {
          console.log('    Available Levels:', item.appliedDiscount.levels.length);
        }
      }
      
      // Calculate expected discount
      console.log('\n🧮 DISCOUNT CALCULATION:');
      if (applicableDiscounts.length > 0) {
        const discount = applicableDiscounts[0];
        let expectedDiscount = 0;
        
        if (discount.discountType === 'direct') {
          expectedDiscount = discount.directDiscountPercentage || 0;
          console.log(`  Direct Discount: ${expectedDiscount}%`);
        } else if (discount.discountType === 'level_based') {
          console.log(`  Level-based discount (user must select level)`);
          if (item.appliedDiscount?.selectedLevel) {
            const level = discount.levels?.find(l => l.levelName === item.appliedDiscount.selectedLevel);
            if (level) {
              expectedDiscount = level.discountPercentage;
              console.log(`  Selected Level: ${item.appliedDiscount.selectedLevel} = ${expectedDiscount}%`);
            }
          }
        } else if (discount.discountType === 'both') {
          const directDiscount = discount.directDiscountPercentage || 0;
          console.log(`  Direct Discount: ${directDiscount}%`);
          
          if (item.appliedDiscount?.selectedLevel) {
            const level = discount.levels?.find(l => l.levelName === item.appliedDiscount.selectedLevel);
            if (level) {
              const levelDiscount = level.discountPercentage;
              expectedDiscount = directDiscount + levelDiscount;
              console.log(`  Selected Level: ${item.appliedDiscount.selectedLevel} = ${levelDiscount}%`);
              console.log(`  Total: ${directDiscount}% + ${levelDiscount}% = ${expectedDiscount}%`);
            }
          } else {
            expectedDiscount = directDiscount;
            console.log(`  No level selected, using direct only: ${expectedDiscount}%`);
          }
        }
        
        console.log(`\n  Expected Discount: ${expectedDiscount}%`);
        console.log(`  Actual Discount: ${item.discountPercentage || 0}%`);
        
        if (Math.abs((item.discountPercentage || 0) - expectedDiscount) > 0.01) {
          console.log(`  ⚠️ MISMATCH DETECTED!`);
        } else {
          console.log(`  ✅ Discount matches expected value`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('ANALYSIS COMPLETE');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

debugSalesOrderDiscountFlow();
