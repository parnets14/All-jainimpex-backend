import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Supplier from './models/Supplier.js';
import Product from './models/Product.js';
import GRN from './models/GRN.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

// Debug script to simulate the exact supplier invoice creation process
async function debugSupplierInvoiceUIDisplay() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🎯 Debugging Supplier Invoice UI Display Issue...\n');

    // Step 1: Get the GRN and supplier data
    const grnNumber = 'GRN-1769586738376';
    const grn = await GRN.findOne({ grnNo: grnNumber })
      .populate('supplierId')
      .populate({
        path: 'items.productId',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' }
        ]
      });
    
    if (!grn) {
      console.log(`❌ GRN ${grnNumber} not found`);
      return;
    }

    console.log(`📋 GRN: ${grn.grnNo}`);
    console.log(`🏢 Supplier: ${grn.supplierId?.name} (ID: ${grn.supplierId?._id})`);

    // Step 2: Get supplier with extra discounts
    const supplier = await Supplier.findById(grn.supplierId._id);
    if (!supplier || !supplier.extraDiscounts || supplier.extraDiscounts.length === 0) {
      console.log('❌ No supplier extra discounts found');
      return;
    }

    console.log(`\n🎯 Supplier Extra Discounts (${supplier.extraDiscounts.length}):`);
    supplier.extraDiscounts.forEach((discount, index) => {
      console.log(`   ${index + 1}. ${discount.targetType}: ${discount.targetName} - ${discount.discountPercentage}%`);
    });

    // Step 3: Simulate the calculatePurchaseDiscounts function
    console.log('\n🔄 Simulating calculatePurchaseDiscounts function...');
    
    const items = grn.items;
    const supplierId = grn.supplierId._id;
    
    // Get supplier extra discounts (active only)
    const supplierExtraDiscounts = supplier.extraDiscounts.filter(d => d.isActive !== false);
    console.log(`📊 Active supplier extra discounts: ${supplierExtraDiscounts.length}`);

    // Process each item
    const processedItems = items.map((item, index) => {
      const product = item.productId;
      
      console.log(`\n📦 Processing Item ${index + 1}: ${product.itemName}`);
      
      // Extract product hierarchy IDs
      const productBrandId = product.brand?._id || product.brand;
      const productCategoryId = product.category?._id || product.category;
      const productSubcategoryId = product.subcategory?._id || product.subcategory;

      console.log(`   Product Hierarchy:`);
      console.log(`     Brand: ${productBrandId} (${product.brand?.name})`);
      console.log(`     Category: ${productCategoryId} (${product.category?.name})`);
      console.log(`     Subcategory: ${productSubcategoryId} (${product.subcategory?.name})`);

      // Find applicable supplier extra discounts
      let supplierExtraDiscountPercentage = 0;
      let supplierExtraDiscountAmount = 0;
      let appliedSupplierDiscounts = [];

      if (supplierExtraDiscounts.length > 0) {
        console.log(`   🔍 Checking ${supplierExtraDiscounts.length} supplier extra discounts...`);
        
        const applicableSupplierDiscounts = supplierExtraDiscounts.filter(discount => {
          if (!discount.isActive && discount.isActive !== undefined) return false;
          
          let matches = false;
          const discountTargetId = String(discount.targetId).trim();

          switch (discount.targetType) {
            case 'brand':
              const productBrandStr = String(productBrandId || '').trim();
              matches = productBrandStr === discountTargetId;
              console.log(`     Brand match: ${productBrandStr} vs ${discountTargetId} = ${matches}`);
              break;
            case 'category':
              const productCategoryStr = String(productCategoryId || '').trim();
              matches = productCategoryStr === discountTargetId;
              console.log(`     Category match: ${productCategoryStr} vs ${discountTargetId} = ${matches}`);
              break;
            case 'subcategory':
              const productSubcategoryStr = String(productSubcategoryId || '').trim();
              matches = productSubcategoryStr === discountTargetId;
              console.log(`     Subcategory match: ${productSubcategoryStr} vs ${discountTargetId} = ${matches}`);
              break;
            case 'product':
              const productIdStr = String(product._id).trim();
              matches = productIdStr === discountTargetId;
              console.log(`     Product match: ${productIdStr} vs ${discountTargetId} = ${matches}`);
              break;
          }

          return matches;
        });

        console.log(`   📊 Applicable discounts found: ${applicableSupplierDiscounts.length}`);

        if (applicableSupplierDiscounts.length > 0) {
          const bestDiscount = applicableSupplierDiscounts.reduce((best, current) => 
            current.discountPercentage > best.discountPercentage ? current : best
          );

          supplierExtraDiscountPercentage = bestDiscount.discountPercentage;
          
          // Calculate amounts
          const quantity = item.acceptedQuantity || item.quantity || 0;
          const unitPrice = item.unitPrice || 0;
          const itemSubtotal = quantity * unitPrice;
          
          // Apply supplier extra discount
          supplierExtraDiscountAmount = (itemSubtotal * supplierExtraDiscountPercentage) / 100;

          appliedSupplierDiscounts.push({
            type: "Supplier Extra Discount",
            targetType: bestDiscount.targetType,
            targetName: bestDiscount.targetName,
            percentage: supplierExtraDiscountPercentage,
            amount: supplierExtraDiscountAmount,
            description: bestDiscount.description
          });

          console.log(`   ✅ SUPPLIER EXTRA DISCOUNT APPLIED:`);
          console.log(`      Discount: ${supplierExtraDiscountPercentage}%`);
          console.log(`      Amount: ₹${supplierExtraDiscountAmount.toFixed(2)}`);
          console.log(`      Target: ${bestDiscount.targetType} - ${bestDiscount.targetName}`);
        } else {
          console.log(`   ❌ No applicable supplier extra discounts found`);
        }
      }

      // Create the item structure that would be sent to UI
      const processedItem = {
        ...item.toObject(),
        // Supplier extra discount fields
        supplierExtraDiscount: {
          hasExtraDiscount: supplierExtraDiscountPercentage > 0,
          extraDiscountPercentage: supplierExtraDiscountPercentage,
          extraDiscountAmount: supplierExtraDiscountAmount,
          appliedSupplierDiscounts: appliedSupplierDiscounts
        }
      };

      console.log(`   📋 Final Item Structure:`);
      console.log(`      hasExtraDiscount: ${processedItem.supplierExtraDiscount.hasExtraDiscount}`);
      console.log(`      extraDiscountPercentage: ${processedItem.supplierExtraDiscount.extraDiscountPercentage}`);
      console.log(`      extraDiscountAmount: ${processedItem.supplierExtraDiscount.extraDiscountAmount}`);
      console.log(`      appliedSupplierDiscounts: ${processedItem.supplierExtraDiscount.appliedSupplierDiscounts.length} items`);

      return processedItem;
    });

    // Step 4: Check what the UI would see
    console.log('\n🖥️ UI DISPLAY CHECK:');
    processedItems.forEach((item, index) => {
      console.log(`\nItem ${index + 1}: ${item.productId.itemName}`);
      
      const hasExtraDiscount = item.supplierExtraDiscount?.hasExtraDiscount;
      console.log(`  hasExtraDiscount: ${hasExtraDiscount}`);
      
      if (hasExtraDiscount) {
        console.log(`  ✅ UI SHOULD SHOW:`);
        console.log(`     "Supplier Extra: ${item.supplierExtraDiscount.extraDiscountPercentage}% OFF (Auto-Applied)"`);
        console.log(`     "Supplier Extra (${item.supplierExtraDiscount.extraDiscountPercentage}%): -₹${item.supplierExtraDiscount.extraDiscountAmount.toLocaleString()}"`);
      } else {
        console.log(`  ❌ UI WILL NOT SHOW supplier extra discount section`);
      }
    });

    console.log('\n🔧 TROUBLESHOOTING STEPS:');
    console.log('1. Check browser console for any JavaScript errors');
    console.log('2. Verify that the GRN selection triggers discount calculation');
    console.log('3. Check if supplier is selected before GRN selection');
    console.log('4. Ensure the calculatePurchaseDiscounts function is called');
    console.log('5. Check if the UI components are rendering the discount sections');

    console.log('\n✅ Debug completed!');

  } catch (error) {
    console.error('❌ Error debugging supplier invoice UI display:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the debug
debugSupplierInvoiceUIDisplay();