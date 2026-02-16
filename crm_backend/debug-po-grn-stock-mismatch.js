import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PurchaseOrder from './models/PurchaseOrder.js';
import GRN from './models/GRN.js';
import Stock from './models/Stock.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';

dotenv.config();

const debugPOGRNStockMismatch = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   PO-GRN-STOCK MISMATCH DEBUG');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Find the Purchase Order
    const poNumber = 'PO-20260216-068';
    console.log(`🔍 Searching for Purchase Order: ${poNumber}`);
    console.log('─────────────────────────────────────────────────────────\n');

    const purchaseOrder = await PurchaseOrder.findOne({ orderNumber: poNumber })
      .populate('supplier', 'name')
      .populate('products.product', 'itemName productCode')
      .populate('warehouse', 'name')
      .lean();

    if (!purchaseOrder) {
      console.log('❌ Purchase Order not found!');
      process.exit(1);
    }

    console.log('📋 Purchase Order Details:');
    console.log(`   Order Number: ${purchaseOrder.orderNumber}`);
    console.log(`   Supplier: ${purchaseOrder.supplier?.name || 'N/A'}`);
    console.log(`   Warehouse: ${purchaseOrder.warehouse?.name || 'N/A'}`);
    console.log(`   Warehouse ID: ${purchaseOrder.warehouse?._id || purchaseOrder.warehouse}`);
    console.log(`   Status: ${purchaseOrder.status}`);
    console.log(`   Order Date: ${new Date(purchaseOrder.orderDate).toLocaleDateString()}`);
    console.log();

    console.log('📦 Products in Purchase Order:');
    purchaseOrder.products.forEach((product, index) => {
      console.log(`\n   ${index + 1}. ${product.product?.itemName || 'Unknown'}`);
      console.log(`      Product Code: ${product.product?.productCode || 'N/A'}`);
      console.log(`      Product ID: ${product.product?._id || product.product}`);
      console.log(`      Ordered Quantity: ${product.quantity}`);
      console.log(`      Received Quantity: ${product.receivedQuantity || 0}`);
      console.log(`      Unit Price: ₹${product.unitPrice}`);
    });
    console.log();

    // Find the GRN
    const grnNumber = 'GRN-1771234629393';
    console.log(`\n🔍 Searching for GRN: ${grnNumber}`);
    console.log('─────────────────────────────────────────────────────────\n');

    const grn = await GRN.findOne({ grnNumber: grnNumber })
      .populate('purchaseOrder', 'orderNumber')
      .populate('supplier', 'name')
      .populate('warehouse', 'name')
      .populate('products.product', 'itemName productCode')
      .lean();

    if (!grn) {
      console.log('❌ GRN not found!');
      process.exit(1);
    }

    console.log('📋 GRN Details:');
    console.log(`   GRN Number: ${grn.grnNumber}`);
    console.log(`   Purchase Order: ${grn.purchaseOrder?.orderNumber || 'N/A'}`);
    console.log(`   Supplier: ${grn.supplier?.name || 'N/A'}`);
    console.log(`   Warehouse: ${grn.warehouse?.name || 'N/A'}`);
    console.log(`   Warehouse ID: ${grn.warehouse?._id || grn.warehouse}`);
    console.log(`   Status: ${grn.status}`);
    console.log(`   GRN Date: ${new Date(grn.grnDate).toLocaleDateString()}`);
    console.log();

    console.log('📦 Products in GRN:');
    grn.products.forEach((product, index) => {
      console.log(`\n   ${index + 1}. ${product.product?.itemName || 'Unknown'}`);
      console.log(`      Product Code: ${product.product?.productCode || 'N/A'}`);
      console.log(`      Product ID: ${product.product?._id || product.product}`);
      console.log(`      Ordered Quantity: ${product.orderedQuantity}`);
      console.log(`      Received Quantity: ${product.receivedQuantity}`);
      console.log(`      Accepted Quantity: ${product.acceptedQuantity}`);
      console.log(`      Rejected Quantity: ${product.rejectedQuantity || 0}`);
      console.log(`      Damaged Quantity: ${product.damagedQuantity || 0}`);
    });
    console.log();

    // Check Stock for each product
    console.log('\n🔍 Checking Stock Entries');
    console.log('─────────────────────────────────────────────────────────\n');

    for (const grnProduct of grn.products) {
      const productId = grnProduct.product?._id || grnProduct.product;
      const warehouseId = grn.warehouse?._id || grn.warehouse;

      console.log(`\n📦 Product: ${grnProduct.product?.itemName || 'Unknown'}`);
      console.log(`   Product ID: ${productId}`);
      console.log(`   Warehouse ID: ${warehouseId}`);

      // Find stock entry
      const stockEntry = await Stock.findOne({
        productId: productId,
        warehouseId: warehouseId
      }).lean();

      if (stockEntry) {
        console.log(`\n   ✅ Stock Entry Found:`);
        console.log(`      Total Quantity: ${stockEntry.totalQty || 0}`);
        console.log(`      Damaged Quantity: ${stockEntry.damagedQty || 0}`);
        console.log(`      Blocked Quantity: ${stockEntry.blockedQty || 0}`);
        console.log(`      Net Stock: ${stockEntry.netStock || 0}`);
        console.log(`      Min Stock Level: ${stockEntry.minStockLevel || 0}`);
      } else {
        console.log(`\n   ❌ No Stock Entry Found!`);
      }

      // Check stock movements
      const StockMovement = (await import('./models/Stock.js')).default;
      const movements = await StockMovement.find({
        productId: productId,
        warehouseId: warehouseId,
        referenceNo: grnNumber
      }).sort({ date: -1, createdAt: -1 }).lean();

      if (movements.length > 0) {
        console.log(`\n   📊 Stock Movements for this GRN:`);
        movements.forEach((movement, index) => {
          console.log(`\n      Movement ${index + 1}:`);
          console.log(`         Type: ${movement.type}`);
          console.log(`         Quantity: ${movement.quantity}`);
          console.log(`         Balance: ${movement.balance}`);
          console.log(`         Reference: ${movement.referenceNo}`);
          console.log(`         Date: ${new Date(movement.date).toLocaleString()}`);
          console.log(`         Remarks: ${movement.remarks || 'N/A'}`);
        });
      } else {
        console.log(`\n   ⚠️  No Stock Movements Found for this GRN!`);
      }
    }

    // Analysis
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('   MISMATCH ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('🔍 Checking for Discrepancies:\n');

    for (const grnProduct of grn.products) {
      const productId = grnProduct.product?._id || grnProduct.product;
      const warehouseId = grn.warehouse?._id || grn.warehouse;
      const productName = grnProduct.product?.itemName || 'Unknown';

      console.log(`📦 ${productName}:`);

      // Find corresponding PO product
      const poProduct = purchaseOrder.products.find(p => 
        (p.product?._id || p.product).toString() === productId.toString()
      );

      if (poProduct) {
        console.log(`   PO Ordered: ${poProduct.quantity}`);
        console.log(`   GRN Received: ${grnProduct.receivedQuantity}`);
        console.log(`   GRN Accepted: ${grnProduct.acceptedQuantity}`);

        if (poProduct.quantity !== grnProduct.receivedQuantity) {
          console.log(`   ⚠️  MISMATCH: PO quantity (${poProduct.quantity}) ≠ GRN received (${grnProduct.receivedQuantity})`);
        }
      }

      // Check stock
      const stockEntry = await Stock.findOne({
        productId: productId,
        warehouseId: warehouseId
      }).lean();

      if (stockEntry) {
        console.log(`   Stock Total: ${stockEntry.totalQty || 0}`);
        console.log(`   Stock Net: ${stockEntry.netStock || 0}`);

        // Expected stock should be at least the accepted quantity
        if (stockEntry.netStock < grnProduct.acceptedQuantity) {
          console.log(`   ⚠️  MISMATCH: Stock (${stockEntry.netStock}) < GRN accepted (${grnProduct.acceptedQuantity})`);
        } else {
          console.log(`   ✅ Stock matches or exceeds GRN accepted quantity`);
        }
      } else {
        console.log(`   ❌ CRITICAL: No stock entry exists!`);
      }

      console.log();
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('1. Check if GRN was properly processed');
    console.log('2. Verify stock movements were created');
    console.log('3. Check if there are any sales orders that reduced stock');
    console.log('4. Verify warehouse IDs match between PO, GRN, and Stock');
    console.log('5. Check for any manual stock adjustments');
    console.log();

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
};

debugPOGRNStockMismatch();
