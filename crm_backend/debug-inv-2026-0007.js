import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerInvoice from './models/DealerInvoice.js';
import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';

dotenv.config();

const debugInvoice = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Get the invoice
    const invoice = await DealerInvoice.findOne({ invoiceNumber: 'INV-2026-0007' })
      .populate('dealer', 'name code creditDaysRegular creditDaysCD creditDays');

    if (!invoice) {
      console.log('❌ Invoice INV-2026-0007 not found');
      await mongoose.connection.close();
      return;
    }

    console.log('📄 Invoice Details:');
    console.log('═'.repeat(80));
    console.log(`Invoice Number: ${invoice.invoiceNumber}`);
    console.log(`Dealer: ${invoice.dealer?.name} (${invoice.dealer?.code})`);
    console.log(`Total Amount: ₹${invoice.totalAmount}`);
    console.log(`Invoice Date: ${new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}`);
    console.log(`Credit Days: ${invoice.creditDays || 'N/A'}`);
    console.log('═'.repeat(80));

    console.log('\n📦 Invoice Items:');
    console.log('═'.repeat(80));
    if (invoice.items && invoice.items.length > 0) {
      invoice.items.forEach((item, index) => {
        console.log(`\nItem ${index + 1}:`);
        console.log(`  Product: ${item.productName || 'N/A'}`);
        console.log(`  Quantity: ${item.quantity}`);
        console.log(`  Price: ₹${item.price}`);
        console.log(`  Sales Type: ${item.salesType || 'NOT SET'} ⚠️`);
        console.log(`  Discount: ${item.discount || 0}%`);
      });
    } else {
      console.log('No items found');
    }
    console.log('═'.repeat(80));

    // Check ledger entry
    const ledgerEntry = await DealerLedger.findOne({ invoiceNumber: 'INV-2026-0007' });
    
    if (ledgerEntry) {
      console.log('\n📊 Ledger Entry:');
      console.log('═'.repeat(80));
      console.log(`Sales Type: ${ledgerEntry.salesType || 'NOT SET'}`);
      console.log(`Credit Days Applied: ${ledgerEntry.creditDaysApplied || 'NOT SET'}`);
      console.log('═'.repeat(80));
    }

    // Analyze the issue
    console.log('\n🔍 Analysis:');
    console.log('═'.repeat(80));
    
    const salesTypes = invoice.items?.map(item => item.salesType).filter(Boolean) || [];
    const uniqueSalesTypes = [...new Set(salesTypes)];
    
    console.log(`Total items: ${invoice.items?.length || 0}`);
    console.log(`Items with salesType: ${salesTypes.length}`);
    console.log(`Unique sales types: ${uniqueSalesTypes.join(', ') || 'NONE'}`);
    
    if (salesTypes.length === 0) {
      console.log('\n❌ PROBLEM FOUND: Invoice items do NOT have salesType field!');
      console.log('This means the invoice was created before the salesType field was added to items.');
      console.log('Or the sales order items did not have salesType when invoice was generated.');
    } else if (uniqueSalesTypes.includes('CD Sales')) {
      console.log('\n✅ Invoice has CD Sales items');
      console.log(`Expected Sales Type: ${uniqueSalesTypes.length === 1 ? uniqueSalesTypes[0] : 'Mixed'}`);
    } else {
      console.log('\n✅ Invoice has Regular Sale items');
    }

    // Check dealer credit days
    console.log('\n💳 Dealer Credit Days:');
    console.log('═'.repeat(80));
    console.log(`Regular Sales: ${invoice.dealer?.creditDaysRegular || invoice.dealer?.creditDays || 0} days`);
    console.log(`CD Sales: ${invoice.dealer?.creditDaysCD || 0} days`);
    console.log('═'.repeat(80));

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

debugInvoice();
