import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const SalesOrderSchema = new mongoose.Schema({}, { strict: false, collection: 'salesorders' });
const SalesOrder = mongoose.model('SalesOrder', SalesOrderSchema);

async function checkSalesOrderDiscount() {
  try {
    const mongoUri = process.env.MONGO_URL;
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find the sales order SO-2026-0002
    const salesOrder = await SalesOrder.findOne({ orderNumber: 'SO-2026-0002' });
    
    if (!salesOrder) {
      console.log('❌ Sales order SO-2026-0002 not found');
      return;
    }

    console.log('\n📋 Sales Order Found:');
    console.log('Order Number:', salesOrder.orderNumber);
    console.log('Dealer:', salesOrder.dealer);
    console.log('Status:', salesOrder.status);
    console.log('\n📦 Products:');
    
    salesOrder.products.forEach((product, index) => {
      console.log(`\n--- Product ${index + 1} ---`);
      console.log('Product ID:', product.product);
      console.log('Product Name:', product.productName);
      console.log('Product Code:', product.productCode);
      console.log('Quantity:', product.quantity);
      console.log('Unit Price:', product.unitPrice);
      console.log('Discount Percentage:', product.discountPercentage);
      console.log('Discount Amount:', product.discountAmount);
      console.log('Applied Discount:', JSON.stringify(product.appliedDiscount, null, 2));
      console.log('Total Price:', product.totalPrice);
    });

    console.log('\n💰 Order Totals:');
    console.log('Gross Amount:', salesOrder.grossAmount);
    console.log('Total Discount:', salesOrder.totalDiscount);
    console.log('Total GST:', salesOrder.totalGst);
    console.log('Total Amount:', salesOrder.totalAmount);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Export for use in other checks
export { checkSalesOrderDiscount };


// Also check discount mappings
const DiscountMappingSchema = new mongoose.Schema({}, { strict: false, collection: 'discountmappings' });
const DiscountMapping = mongoose.model('DiscountMapping', DiscountMappingSchema);

async function checkDiscountMappings() {
  try {
    const mongoUri = process.env.MONGO_URL;
    await mongoose.connect(mongoUri);
    console.log('\n✅ Connected to MongoDB for discount check');

    // Get all approved discount mappings
    const discounts = await DiscountMapping.find({ 
      status: 'Approved',
      isActive: true 
    });
    
    console.log(`\n📊 Found ${discounts.length} approved discount mappings:`);
    
    discounts.forEach((discount, index) => {
      console.log(`\n--- Discount ${index + 1} ---`);
      console.log('Discount Name:', discount.discountName);
      console.log('Mapping Type:', discount.mappingType);
      console.log('Target Type:', discount.targetType);
      console.log('Discount Type:', discount.discountType);
      console.log('Product:', discount.product);
      console.log('Brand:', discount.brand);
      console.log('Category:', discount.category);
      console.log('Subcategory:', discount.subcategory);
      console.log('Direct Discount %:', discount.directDiscountPercentage);
      console.log('Levels:', discount.levels);
      console.log('Valid From:', discount.validFrom);
      console.log('Valid To:', discount.validTo);
      console.log('Status:', discount.status);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run both checks
checkSalesOrderDiscount().then(() => {
  return checkDiscountMappings();
});
