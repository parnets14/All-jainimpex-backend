import dotenv from 'dotenv';
import mongoose from 'mongoose';
import GRN from './models/GRN.js';
import Stock from './models/Stock.js';
import Product from './models/Product.js';

dotenv.config();

async function checkRecentGRNAndStock() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   RECENT GRN ANALYSIS (Last 5)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const recentGRNs = await GRN.find()
      .sort({ createdAt: -1 })
      .limit(5);

    if (recentGRNs.length === 0) {
      console.log('❌ No GRNs found!\n');
    } else {
      for (let i = 0; i < recentGRNs.length; i++) {
        const grn = recentGRNs[i];
        console.log(`\n📦 GRN #${i + 1}:`);
        console.log(`   GRN Number: ${grn.grnNo || 'MISSING'}`);
        console.log(`   PO ID: ${grn.poId || 'MISSING'}`);
        console.log(`   Warehouse ID: ${grn.warehouseId}`);
        console.log(`   Status: ${grn.status}`);
        console.log(`   Date: ${grn.grnDate || grn.createdAt}`);
        console.log(`   Total Amount: ₹${grn.totalAmount || 0}`);
        console.log(`   Items: ${grn.items?.length || 0}`);
        
        if (grn.items && grn.items.length > 0) {
          console.log(`\n   Products Received:`);
          for (const item of grn.items) {
            const product = await Product.findById(item.productId).select('name productCode');
            console.log(`   - ${product?.name || 'Unknown'} (${product?.productCode || 'N/A'})`);
            console.log(`     Received: ${item.receivedQuantity}, Accepted: ${item.acceptedQuantity}`);
            console.log(`     Price: ₹${item.unitPrice}, Total: ₹${item.totalPrice}`);
          }
        } else {
          console.log(`   ⚠️  NO ITEMS IN THIS GRN!`);
        }
        console.log(`   ─────────────────────────────────`);
      }
    }

    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('   RECENT STOCK MOVEMENTS (Last 10)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const recentStock = await Stock.find()
      .sort({ updatedAt: -1 })
      .limit(10);

    if (recentStock.length === 0) {
      console.log('❌ No stock entries found!\n');
    } else {
      for (const stock of recentStock) {
        const product = await Product.findById(stock.product).select('name productCode');
        console.log(`\n📊 ${product?.name || 'Unknown Product'}`);
        console.log(`   Product Code: ${product?.productCode || 'N/A'}`);
        console.log(`   Current Quantity: ${stock.quantity}`);
        console.log(`   Warehouse ID: ${stock.warehouse}`);
        console.log(`   Last Updated: ${stock.updatedAt}`);
        console.log(`   ─────────────────────────────────`);
      }
    }

    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('   STOCK SUMMARY BY WAREHOUSE');
    console.log('═══════════════════════════════════════════════════════════\n');

    const stockByWarehouse = await Stock.aggregate([
      {
        $group: {
          _id: '$warehouse',
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' }
        }
      },
      { $sort: { totalQuantity: -1 } }
    ]);

    if (stockByWarehouse.length === 0) {
      console.log('❌ No stock data available!\n');
    } else {
      for (const wh of stockByWarehouse) {
        console.log(`Warehouse ID: ${wh._id}`);
        console.log(`  Products: ${wh.totalProducts}`);
        console.log(`  Total Quantity: ${wh.totalQuantity}`);
        console.log(`  ─────────────────────────────────`);
      }
    }

    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('   DIAGNOSIS FOR PO-20260216-068');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Check if there's a GRN for this specific PO
    const targetPOId = '6979b839be2f2eaac8767ccd'; // You may need to adjust this
    const grnForPO = await GRN.findOne({ poId: targetPOId });

    if (grnForPO) {
      console.log('✅ GRN found for this PO:');
      console.log(`   GRN Number: ${grnForPO.grnNo || 'MISSING'}`);
      console.log(`   Items: ${grnForPO.items?.length || 0}`);
      console.log(`   Status: ${grnForPO.status}`);
    } else {
      console.log('❌ No GRN found for this PO');
      console.log('   This explains why stock was not updated!');
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkRecentGRNAndStock();
