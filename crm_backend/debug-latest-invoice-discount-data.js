import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

const debugLatestInvoiceDiscountData = async () => {
  try {
    await connectDB();

    const DealerInvoice = mongoose.model('DealerInvoice');

    // Get the latest invoice
    const latestInvoice = await DealerInvoice.findOne()
      .sort({ createdAt: -1 })
      .lean();

    if (!latestInvoice) {
      console.log('No invoices found in database');
      return;
    }

    console.log('\n=== LATEST INVOICE DEBUG ===');
    console.log('Invoice Number:', latestInvoice.invoiceNumber);
    console.log('Invoice Date:', latestInvoice.invoiceDate);
    console.log('Dealer:', latestInvoice.dealerName);
    console.log('Total Amount:', latestInvoice.totalAmount);
    console.log('\n=== ITEMS DISCOUNT DATA ===\n');

    latestInvoice.items.forEach((item, index) => {
      console.log(`\n--- ITEM ${index + 1}: ${item.productName} ---`);
      console.log('Product Code:', item.productCode);
      console.log('Quantity:', item.quantity);
      console.log('Unit Price:', item.unitPrice);
      console.log('Discount Percentage:', item.discountPercentage);
      console.log('Discount Amount:', item.discountAmount);
      console.log('Total Price:', item.totalPrice);
      
      console.log('\n📊 DISCOUNT DETAILS:');
      console.log('selectedDiscountLevels:', item.selectedDiscountLevels);
      console.log('manualDiscountLevels:', item.manualDiscountLevels);
      console.log('dealerExtraDiscount:', item.dealerExtraDiscount);
      
      console.log('\n📋 APPLIED DISCOUNTS ARRAY:');
      if (item.appliedDiscounts && item.appliedDiscounts.length > 0) {
        item.appliedDiscounts.forEach((discount, idx) => {
          console.log(`\n  Applied Discount ${idx + 1}:`);
          console.log('  - Discount Name:', discount.discountName);
          console.log('  - Direct Discount %:', discount.directDiscountPercentage);
          console.log('  - Max Discount %:', discount.maxDiscountPercentage);
          console.log('  - Target Type:', discount.targetType);
          console.log('  - Levels:', JSON.stringify(discount.levels, null, 2));
        });
      } else {
        console.log('  ❌ NO APPLIED DISCOUNTS FOUND');
      }
      
      console.log('\n' + '='.repeat(60));
    });

    console.log('\n\n=== INVOICE TOTALS ===');
    console.log('Subtotal:', latestInvoice.subtotal);
    console.log('Total Discount:', latestInvoice.totalDiscount);
    console.log('Total GST:', latestInvoice.totalGst);
    console.log('Total Amount:', latestInvoice.totalAmount);

    console.log('\n\n=== RAW ITEM DATA (First Item) ===');
    console.log(JSON.stringify(latestInvoice.items[0], null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
};

debugLatestInvoiceDiscountData();
