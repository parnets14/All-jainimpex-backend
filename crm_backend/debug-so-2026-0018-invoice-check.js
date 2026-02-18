import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import SalesOrder from './models/SalesOrder.js';
import DealerInvoice from './models/DealerInvoice.js';
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const checkSalesOrderAndInvoice = async () => {
  try {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) {
      console.error('❌ MONGO_URL not found in .env file');
      process.exit(1);
    }
    
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected to MongoDB');

    // Find the sales order
    const salesOrder = await SalesOrder.findOne({ orderNumber: 'SO-2026-0018' })
      .populate('dealer', 'name code dealerType')
      .populate('products.product', 'itemName productCode HSNCode gst')
      .lean();

    if (!salesOrder) {
      console.log('❌ Sales Order SO-2026-0018 not found');
      process.exit(1);
    }

    console.log('\n📋 SALES ORDER SO-2026-0018 DETAILS:');
    console.log('=====================================');
    console.log('Order Number:', salesOrder.orderNumber);
    console.log('Dealer:', salesOrder.dealer?.name);
    console.log('Status:', salesOrder.status);
    console.log('Total Amount:', salesOrder.totalAmount);
    console.log('\n📦 PRODUCTS:');
    console.log('=====================================');

    salesOrder.products.forEach((product, index) => {
      console.log(`\n${index + 1}. ${product.productName || product.product?.itemName}`);
      console.log('   Product Code:', product.productCode || product.product?.productCode);
      console.log('   HSN Code:', product.HSNCode || product.product?.HSNCode);
      console.log('   Quantity:', product.quantity);
      console.log('   Unit Price:', product.unitPrice);
      console.log('   GST %:', product.gst || product.product?.gst);
      console.log('   Subtotal:', product.quantity * product.unitPrice);
      
      console.log('\n   💰 DISCOUNT DETAILS:');
      console.log('   -------------------');
      console.log('   Discount %:', product.discountPercentage || 0);
      console.log('   Discount Amount:', product.discountAmount || 0);
      console.log('   Dealer Extra Discount:', product.dealerExtraDiscount || 0);
      
      if (product.appliedDiscount) {
        console.log('\n   📊 APPLIED DISCOUNT:');
        console.log('   Discount Name:', product.appliedDiscount.discountName);
        console.log('   Discount Type:', product.appliedDiscount.discountType);
        console.log('   Direct Discount %:', product.appliedDiscount.directDiscountPercentage || 0);
        console.log('   Max Discount Limit:', product.appliedDiscount.maxDiscountPercentage || 'N/A');
        
        if (product.appliedDiscount.levels && product.appliedDiscount.levels.length > 0) {
          console.log('\n   🎚️ LEVEL-BASED DISCOUNTS:');
          product.appliedDiscount.levels.forEach(level => {
            console.log(`   - ${level.levelName}: ${level.discountPercentage}%`);
          });
        }
      }
      
      if (product.selectedDiscountLevels && product.selectedDiscountLevels.length > 0) {
        console.log('\n   ✅ SELECTED LEVELS:', product.selectedDiscountLevels.join(', '));
      }
      
      if (product.manualDiscountLevels && Object.keys(product.manualDiscountLevels).length > 0) {
        console.log('\n   ✏️ MANUAL PERCENTAGES:');
        Object.entries(product.manualDiscountLevels).forEach(([level, percentage]) => {
          console.log(`   - ${level}: ${percentage}%`);
        });
      }
      
      // Calculate expected values
      const subtotal = product.quantity * product.unitPrice;
      const totalDiscountPercentage = (product.discountPercentage || 0) + (product.dealerExtraDiscount || 0);
      const discountAmount = (subtotal * totalDiscountPercentage) / 100;
      const amountAfterDiscount = subtotal - discountAmount;
      const gstAmount = (amountAfterDiscount * (product.gst || product.product?.gst || 0)) / 100;
      const finalAmount = amountAfterDiscount + gstAmount;
      
      console.log('\n   🧮 CALCULATED VALUES:');
      console.log('   -------------------');
      console.log('   Subtotal:', subtotal.toFixed(2));
      console.log('   Total Discount % (base + dealer extra):', totalDiscountPercentage.toFixed(2) + '%');
      console.log('   Discount Amount:', discountAmount.toFixed(2));
      console.log('   Amount After Discount:', amountAfterDiscount.toFixed(2));
      console.log('   GST Amount:', gstAmount.toFixed(2));
      console.log('   Final Amount:', finalAmount.toFixed(2));
      
      console.log('\n   📝 STORED VALUES:');
      console.log('   -------------------');
      console.log('   Stored Discount Amount:', product.discountAmount || 0);
      console.log('   Stored Total Price:', product.totalPrice || 0);
      
      // Check if values match
      const discountMatch = Math.abs((product.discountAmount || 0) - discountAmount) < 0.01;
      const totalMatch = Math.abs((product.totalPrice || 0) - finalAmount) < 0.01;
      
      console.log('\n   ✓ VALIDATION:');
      console.log('   Discount Amount Match:', discountMatch ? '✅ YES' : '❌ NO');
      console.log('   Final Amount Match:', totalMatch ? '✅ YES' : '❌ NO');
    });

    // Check if invoice exists for this sales order
    console.log('\n\n🧾 CHECKING FOR INVOICES:');
    console.log('=====================================');
    
    const invoices = await DealerInvoice.find({ salesOrder: salesOrder._id })
      .select('invoiceNumber status totalAmount totalDiscount totalGst items')
      .lean();
    
    if (invoices.length === 0) {
      console.log('❌ No invoices found for this sales order');
    } else {
      console.log(`✅ Found ${invoices.length} invoice(s):`);
      
      invoices.forEach((invoice, idx) => {
        console.log(`\n${idx + 1}. Invoice: ${invoice.invoiceNumber}`);
        console.log('   Status:', invoice.status);
        console.log('   Total Amount:', invoice.totalAmount);
        console.log('   Total Discount:', invoice.totalDiscount);
        console.log('   Total GST:', invoice.totalGst);
        console.log('   Number of Items:', invoice.items?.length || 0);
        
        if (invoice.items && invoice.items.length > 0) {
          console.log('\n   📦 INVOICE ITEMS:');
          invoice.items.forEach((item, itemIdx) => {
            console.log(`\n   ${itemIdx + 1}. ${item.productName}`);
            console.log('      Quantity:', item.quantity);
            console.log('      Unit Price:', item.unitPrice);
            console.log('      Discount %:', item.discountPercentage || 0);
            console.log('      Dealer Extra %:', item.dealerExtraDiscount || 0);
            console.log('      Total Discount %:', (item.discountPercentage || 0) + (item.dealerExtraDiscount || 0));
            console.log('      Discount Amount:', item.discountAmount || 0);
            console.log('      GST Amount:', item.gstAmount || 0);
            console.log('      Total Price:', item.totalPrice || 0);
          });
        }
      });
    }

    console.log('\n✅ Check complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkSalesOrderAndInvoice();
