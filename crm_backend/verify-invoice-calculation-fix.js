import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import DealerInvoice from './models/DealerInvoice.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const verifyCalculationFix = async () => {
  try {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) {
      console.error('❌ MONGO_URL not found in .env file');
      process.exit(1);
    }
    
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected to MongoDB\n');

    // Test case: Create a sample invoice item calculation
    console.log('🧪 TEST CASE: Invoice Calculation with Dealer Extra Discount');
    console.log('='.repeat(70));
    
    const testItem = {
      quantity: 2,
      unitPrice: 1250,
      gst: 18,
      discountPercentage: 47,  // Base discount (direct + level-based)
      dealerExtraDiscount: 3   // Additional dealer extra
    };
    
    console.log('\n📦 Test Item:');
    console.log('  Quantity:', testItem.quantity);
    console.log('  Unit Price: ₹', testItem.unitPrice);
    console.log('  GST:', testItem.gst + '%');
    console.log('  Base Discount:', testItem.discountPercentage + '%');
    console.log('  Dealer Extra:', testItem.dealerExtraDiscount + '%');
    
    // Manual calculation
    const baseAmount = testItem.quantity * testItem.unitPrice;
    const totalDiscountPercentage = testItem.discountPercentage + testItem.dealerExtraDiscount;
    const discountAmount = (baseAmount * totalDiscountPercentage) / 100;
    const amountAfterDiscount = baseAmount - discountAmount;
    const gstAmount = (amountAfterDiscount * testItem.gst) / 100;
    const finalAmount = amountAfterDiscount + gstAmount;
    
    console.log('\n🧮 EXPECTED CALCULATION:');
    console.log('  Subtotal: ₹', baseAmount.toFixed(2));
    console.log('  Total Discount % (47% + 3%):', totalDiscountPercentage + '%');
    console.log('  Discount Amount: ₹', discountAmount.toFixed(2));
    console.log('  Amount After Discount: ₹', amountAfterDiscount.toFixed(2));
    console.log('  GST Amount (18% on ₹' + amountAfterDiscount.toFixed(2) + '): ₹', gstAmount.toFixed(2));
    console.log('  Final Amount: ₹', finalAmount.toFixed(2));
    
    // Find the actual invoice
    console.log('\n\n🔍 CHECKING ACTUAL INVOICE INV-2026-0005:');
    console.log('='.repeat(70));
    
    const invoice = await DealerInvoice.findOne({ invoiceNumber: 'INV-2026-0005' });
    
    if (!invoice) {
      console.log('❌ Invoice INV-2026-0005 not found');
      process.exit(1);
    }
    
    console.log('\n✅ Invoice found!');
    console.log('Status:', invoice.status);
    console.log('Total Amount: ₹', invoice.totalAmount.toFixed(2));
    console.log('Total Discount: ₹', invoice.totalDiscount.toFixed(2));
    console.log('Total GST: ₹', invoice.totalGst.toFixed(2));
    
    console.log('\n📦 INVOICE ITEMS VERIFICATION:');
    console.log('='.repeat(70));
    
    let allCorrect = true;
    
    invoice.items.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.productName}`);
      console.log('   Quantity:', item.quantity);
      console.log('   Unit Price: ₹', item.unitPrice);
      console.log('   Base Discount:', item.discountPercentage + '%');
      console.log('   Dealer Extra:', item.dealerExtraDiscount + '%');
      
      // Calculate expected values
      const itemBase = item.quantity * item.unitPrice;
      const itemTotalDiscount = (item.discountPercentage || 0) + (item.dealerExtraDiscount || 0);
      const itemDiscountAmount = (itemBase * itemTotalDiscount) / 100;
      const itemAfterDiscount = itemBase - itemDiscountAmount;
      const itemGst = (itemAfterDiscount * item.gst) / 100;
      const itemFinal = itemAfterDiscount + itemGst;
      
      console.log('\n   Expected:');
      console.log('   - Subtotal: ₹', itemBase.toFixed(2));
      console.log('   - Total Discount %:', itemTotalDiscount + '%');
      console.log('   - Discount Amount: ₹', itemDiscountAmount.toFixed(2));
      console.log('   - After Discount: ₹', itemAfterDiscount.toFixed(2));
      console.log('   - GST Amount: ₹', itemGst.toFixed(2));
      console.log('   - Final Amount: ₹', itemFinal.toFixed(2));
      
      console.log('\n   Stored:');
      console.log('   - Discount Amount: ₹', (item.discountAmount || 0).toFixed(2));
      console.log('   - GST Amount: ₹', (item.gstAmount || 0).toFixed(2));
      console.log('   - Final Amount: ₹', (item.totalPrice || 0).toFixed(2));
      
      // Validation
      const discountMatch = Math.abs((item.discountAmount || 0) - itemDiscountAmount) < 0.01;
      const gstMatch = Math.abs((item.gstAmount || 0) - itemGst) < 0.01;
      const totalMatch = Math.abs((item.totalPrice || 0) - itemFinal) < 0.01;
      
      console.log('\n   ✓ Validation:');
      console.log('   - Discount Amount:', discountMatch ? '✅ CORRECT' : '❌ INCORRECT');
      console.log('   - GST Amount:', gstMatch ? '✅ CORRECT' : '❌ INCORRECT');
      console.log('   - Final Amount:', totalMatch ? '✅ CORRECT' : '❌ INCORRECT');
      
      if (!discountMatch || !gstMatch || !totalMatch) {
        allCorrect = false;
      }
    });
    
    console.log('\n\n' + '='.repeat(70));
    if (allCorrect) {
      console.log('✅ ALL CALCULATIONS ARE CORRECT!');
      console.log('The fix is working properly. Dealer extra discount is included.');
    } else {
      console.log('❌ SOME CALCULATIONS ARE INCORRECT!');
      console.log('The invoice needs to be recalculated or recreated.');
    }
    console.log('='.repeat(70));
    
    console.log('\n💡 NOTE:');
    console.log('If calculations are incorrect, the invoice was created BEFORE the fix.');
    console.log('You need to either:');
    console.log('1. Delete and recreate the invoice, OR');
    console.log('2. Run a migration script to recalculate existing invoices');
    
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

verifyCalculationFix();
