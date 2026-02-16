import dotenv from 'dotenv';
import mongoose from 'mongoose';
import PurchaseOrder from './models/PurchaseOrder.js';
import GRN from './models/GRN.js';
import Stock from './models/Stock.js';

dotenv.config();

async function debugPOGRNStock() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const poNumber = 'PO-20260216-068';

    // Get PO details
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   PURCHASE ORDER DETAILS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const po = await PurchaseOrder.findOne({ poNumber });

    if (!po) {
      console.log('❌ Purchase Order not found!');
      await mongoose.connection.close();
      return;
    }

    console.log(`PO Number: ${po.poNumber}`);
    console.log(`Date: ${po.orderDate || po.createdAt}`);
    console.log(`Supplier ID: ${po.supplierId}`);
    console.log(`Warehouse ID: ${po.warehouseId}`);
    console.log(`Status: ${po.status}`);
    console.log(`Subtotal: ₹${po.subtotal}`);
    console.log(`GST Total: ₹${po.gstTotal}`);
    console.log(`Total: ₹${po.total}`);
    console.log(`\nProducts (${po.lines?.length || 0}):`);
    
    if (po.lines && po.lines.length > 0) {
      po.lines.forEach((item, idx) => {
        console.log(`\n${idx + 1}. Product ID: ${item.productId}`);
        console.log(`   Quantity: ${item.quantity}`);
        console.log(`   Price: ₹${item.price}`);
        console.log(`   GST: ${item.gst}%`);
        console.log(`   Total: ₹${item.total}`);
      });
    } else {
      console.log('   No products found in PO');
    }

    // Get GRN for this PO
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('   GRN DETAILS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const grns = await GRN.find({ poNumber });

    if (grns.length === 0) {
      console.log('❌ No GRN found for this PO!');
    } else {
      grns.forEach((grn, grnIdx) => {
        console.log(`\nGRN #${grnIdx + 1}:`);
        console.log(`GRN Number: ${grn.grnNumber}`);
        console.log(`Date: ${grn.grnDate || grn.createdAt}`);
        console.log(`Warehouse ID: ${grn.warehouseId}`);
        console.log(`Status: ${grn.status}`);
        console.log(`\nProducts Received (${grn.products?.length || 0}):`);
        
        if (grn.products && grn.products.length > 0) {
          grn.products.forEach((item, idx) => {
            console.log(`\n${idx + 1}. Product ID: ${item.product}`);
            console.log(`   Ordered: ${item.orderedQuantity}`);
            console.log(`   Received: ${item.receivedQuantity}`);
            console.log(`   Rate: ₹${item.rate}`);
          });
        }
      });
    }

    // Check stock for products in this PO
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('   STOCK VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (po.lines && po.lines.length > 0) {
      for (const item of po.lines) {
        if (!item.productId) continue;

        const productId = item.productId;
        const warehouseId = po.warehouseId;

        console.log(`\n📦 Product ID: ${productId}`);
        console.log(`   PO Quantity: ${item.quantity}`);
        console.log(`   PO Price: ₹${item.price}`);

        // Find stock entry
        const stock = await Stock.findOne({
          product: productId,
          warehouse: warehouseId
        });

        if (stock) {
          console.log(`   ✅ Stock Entry Found:`);
          console.log(`      Current Stock: ${stock.quantity}`);
          console.log(`      Warehouse ID: ${stock.warehouse}`);
          console.log(`      Last Updated: ${stock.updatedAt}`);
        } else {
          console.log(`   ❌ No Stock Entry Found`);
          console.log(`      Expected Warehouse ID: ${warehouseId}`);
        }

        // Check if GRN received this product
        if (grns.length > 0) {
          const grnItem = grns[0].products?.find(p => 
            p.product?.toString() === productId.toString()
          );
          
          if (grnItem) {
            console.log(`   📋 GRN Received: ${grnItem.receivedQuantity}`);
            
            if (stock) {
              const difference = stock.quantity - grnItem.receivedQuantity;
              if (difference !== 0) {
                console.log(`   ⚠️  MISMATCH: Stock (${stock.quantity}) vs GRN Received (${grnItem.receivedQuantity})`);
                console.log(`      Difference: ${difference > 0 ? '+' : ''}${difference}`);
              } else {
                console.log(`   ✅ Stock matches GRN received quantity`);
              }
            }
          } else {
            console.log(`   ⚠️  Product not found in GRN`);
          }
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

debugPOGRNStock();
