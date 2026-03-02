import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SupplierInvoice from './models/SupplierInvoice.js';
import GRN from './models/GRN.js';
import PurchaseOrder from './models/PurchaseOrder.js';
import Product from './models/Product.js';

dotenv.config();

const checkPriceDeviationData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Check Supplier Invoices
    const invoiceCount = await SupplierInvoice.countDocuments();
    console.log(`\n📊 Supplier Invoices: ${invoiceCount}`);

    if (invoiceCount > 0) {
      const sampleInvoice = await SupplierInvoice.findOne()
        .populate('supplier', 'name')
        .populate('purchaseOrder', 'poNumber')
        .populate('items.product', 'itemName unitPrice');
      
      console.log('\n📄 Sample Invoice:');
      console.log('  Invoice Number:', sampleInvoice.invoiceNumber);
      console.log('  Invoice Date:', sampleInvoice.invoiceDate);
      console.log('  Supplier:', sampleInvoice.supplier?.name || 'N/A');
      console.log('  PO Number:', sampleInvoice.purchaseOrder?.poNumber || 'N/A');
      console.log('  Status:', sampleInvoice.status);
      console.log('  Items:', sampleInvoice.items.length);
      
      if (sampleInvoice.items.length > 0) {
        const item = sampleInvoice.items[0];
        console.log('\n  First Item:');
        console.log('    Product:', item.product?.itemName || 'N/A');
        console.log('    Master Price (Product.unitPrice):', item.product?.unitPrice || 0);
        console.log('    Invoice Price:', item.unitPrice || 0);
        console.log('    Quantity:', item.quantity || 0);
      }
    }

    // Check GRNs
    const grnCount = await GRN.countDocuments();
    console.log(`\n📦 GRNs: ${grnCount}`);

    // Check Purchase Orders
    const poCount = await PurchaseOrder.countDocuments();
    console.log(`📝 Purchase Orders: ${poCount}`);

    // Check Products with unitPrice
    const productCount = await Product.countDocuments();
    const productsWithPrice = await Product.countDocuments({ unitPrice: { $gt: 0 } });
    console.log(`\n🏷️  Products: ${productCount}`);
    console.log(`🏷️  Products with unitPrice > 0: ${productsWithPrice}`);

    if (productsWithPrice > 0) {
      const sampleProduct = await Product.findOne({ unitPrice: { $gt: 0 } });
      console.log('\n  Sample Product:');
      console.log('    Name:', sampleProduct.itemName);
      console.log('    Code:', sampleProduct.productCode);
      console.log('    Unit Price:', sampleProduct.unitPrice);
    }

    // Check if invoices have product references
    if (invoiceCount > 0) {
      const invoicesWithProducts = await SupplierInvoice.countDocuments({
        'items.product': { $exists: true, $ne: null }
      });
      console.log(`\n✅ Invoices with product references: ${invoicesWithProducts}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY:');
    console.log('='.repeat(60));
    
    if (invoiceCount === 0) {
      console.log('❌ No Supplier Invoices found!');
      console.log('   → Create some supplier invoices first');
    } else if (productsWithPrice === 0) {
      console.log('❌ No Products with unitPrice found!');
      console.log('   → Set unitPrice in Product Master');
    } else {
      console.log('✅ Data looks good! Price deviation report should work.');
      console.log(`   → ${invoiceCount} invoices available`);
      console.log(`   → ${productsWithPrice} products with prices`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

checkPriceDeviationData();
