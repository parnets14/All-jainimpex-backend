import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Check the specific GRN and its product details
async function checkGrnProductDetails() {
  try {
    console.log('🔍 Checking GRN Product Details...\n');

    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');

    const db = mongoose.connection.db;

    // Get the specific GRN
    const grnCollection = db.collection('grns');
    const grn = await grnCollection.findOne({ grnNo: 'GRN-1769162863117' });

    if (!grn) {
      console.log('❌ GRN not found');
      return;
    }

    console.log(`✅ Found GRN: ${grn.grnNo}`);
    console.log(`Supplier ID: ${grn.supplierId}`);
    console.log(`Items: ${grn.items?.length || 0}`);

    // Get product details
    const productCollection = db.collection('products');
    const brandCollection = db.collection('brands');

    for (let i = 0; i < grn.items.length; i++) {
      const item = grn.items[i];
      console.log(`\nItem ${i + 1}:`);
      console.log(`  Product ID: ${item.productId}`);
      console.log(`  Quantity: ${item.quantity}`);
      console.log(`  Unit Price: ₹${item.unitPrice}`);

      // Get product details
      const product = await productCollection.findOne({ _id: item.productId });
      if (product) {
        console.log(`  Product Name: ${product.name}`);
        console.log(`  Product Code: ${product.productCode}`);
        console.log(`  Brand ID: ${product.brand}`);
        console.log(`  Category ID: ${product.category}`);

        // Get brand details
        if (product.brand) {
          const brand = await brandCollection.findOne({ _id: product.brand });
          if (brand) {
            console.log(`  Brand Name: ${brand.name}`);
            
            // Check if this is Cera brand
            const ceraDiscountBrandId = '6968f3465eb9746eb301e6e2';
            if (product.brand.toString() === ceraDiscountBrandId) {
              console.log('  ✅ This product should receive Cera brand discount (6% direct + 0-90% floating)');
            } else {
              console.log(`  ❌ This product won't receive Cera discount (different brand)`);
              console.log(`     Product brand: ${product.brand}`);
              console.log(`     Cera brand: ${ceraDiscountBrandId}`);
            }
          }
        }
      } else {
        console.log('  ❌ Product not found');
      }
    }

    // Get supplier details
    const supplierCollection = db.collection('suppliers');
    const supplier = await supplierCollection.findOne({ _id: grn.supplierId });
    if (supplier) {
      console.log(`\nSupplier: ${supplier.name || supplier.companyName}`);
    }

    console.log('\n📋 Summary:');
    console.log('1. Use GRN: GRN-1769162863117');
    console.log('2. Check if the product in this GRN is Cera brand');
    console.log('3. If yes, it should show 6% direct discount');
    console.log('4. If no, create a GRN with Cera brand products or create a global discount');

  } catch (error) {
    console.error('❌ Check failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkGrnProductDetails();