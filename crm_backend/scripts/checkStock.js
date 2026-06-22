// Check opening stock for shree-jain-impex
// Usage: node scripts/checkStock.js

import { getCompanyConnection } from '../config/multiDatabase.js';

async function run() {
  try {
    console.log('\n🔍 Checking stock data for shree-jain-impex...\n');
    const db = await getCompanyConnection('shree-jain-impex');
    await db.asPromise();

    const { stockMovementSchema } = await import('../models/Stock.js');
    const { default: ProductModel } = await import('../models/Product.js');
    const StockMovement = db.models.StockMovement || db.model('StockMovement', stockMovementSchema);
    const Product = db.models.Product || db.model('Product', ProductModel.schema);

    // Count stock movements
    const totalMovements = await StockMovement.countDocuments();
    const openingMovements = await StockMovement.countDocuments({ referenceType: 'OPENING' });
    const grnMovements = await StockMovement.countDocuments({ referenceType: 'GRN' });

    console.log(`📊 Total stock movements: ${totalMovements}`);
    console.log(`   OPENING: ${openingMovements}`);
    console.log(`   GRN: ${grnMovements}\n`);

    // Show first 10 opening stock entries with product details
    if (openingMovements > 0) {
      const openings = await StockMovement.find({ referenceType: 'OPENING' })
        .limit(10)
        .populate('productId', 'productCode itemName')
        .lean();
      
      console.log('── OPENING STOCK ENTRIES (first 10) ──');
      openings.forEach(m => {
        const name = m.productId?.itemName || m.productId?.productCode || m.productId;
        console.log(`  ${name}: qty=${m.quantity}, rate=₹${m.rate || 0}, balance=${m.balance}`);
      });
    } else {
      console.log('❌ NO OPENING STOCK found.');
    }

    // Check if any products have openingStock field set
    const productsWithStock = await Product.countDocuments({ openingStock: { $gt: 0 } });
    const totalProducts = await Product.countDocuments();
    console.log(`\n📦 Products: ${totalProducts} total, ${productsWithStock} have openingStock > 0`);

    if (productsWithStock > 0) {
      const samples = await Product.find({ openingStock: { $gt: 0 } })
        .limit(5)
        .select('productCode itemName openingStock')
        .lean();
      console.log('── PRODUCTS WITH OPENING STOCK (first 5) ──');
      samples.forEach(p => {
        console.log(`  ${p.itemName || p.productCode}: openingStock=${p.openingStock}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

setTimeout(run, 2000);
