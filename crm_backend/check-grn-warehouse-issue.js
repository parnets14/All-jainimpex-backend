import dotenv from 'dotenv';
import mongoose from 'mongoose';
import GRN from './models/GRN.js';
import StockMovement from './models/Stock.js';

dotenv.config();

async function checkGRNWarehouseIssue() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const grnNumber = 'GRN-1771234629393';

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   CHECKING GRN: ${grnNumber}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    const grn = await GRN.findOne({ grnNo: grnNumber });

    if (!grn) {
      console.log('❌ GRN not found!');
      await mongoose.connection.close();
      return;
    }

    console.log('GRN Details:');
    console.log(`  GRN Number: ${grn.grnNo}`);
    console.log(`  PO ID: ${grn.poId}`);
    console.log(`  Warehouse ID: ${grn.warehouseId}`);
    console.log(`  Warehouse ID Type: ${typeof grn.warehouseId}`);
    console.log(`  Warehouse ID is null: ${grn.warehouseId === null}`);
    console.log(`  Warehouse ID is undefined: ${grn.warehouseId === undefined}`);
    console.log(`  Status: ${grn.status}`);
    console.log(`  Items: ${grn.items?.length || 0}`);
    console.log(`  Created: ${grn.createdAt}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   STOCK MOVEMENTS FOR THIS GRN');
    console.log('═══════════════════════════════════════════════════════════\n');

    const movements = await StockMovement.find({ referenceNo: grnNumber });

    if (movements.length === 0) {
      console.log('❌ No stock movements found for this GRN!');
    } else {
      console.log(`Found ${movements.length} stock movements:\n`);
      movements.forEach((mov, idx) => {
        console.log(`${idx + 1}. Type: ${mov.type}`);
        console.log(`   Product ID: ${mov.productId}`);
        console.log(`   Warehouse ID: ${mov.warehouseId}`);
        console.log(`   Warehouse ID Type: ${typeof mov.warehouseId}`);
        console.log(`   Warehouse ID is null: ${mov.warehouseId === null}`);
        console.log(`   Warehouse ID is undefined: ${mov.warehouseId === undefined}`);
        console.log(`   Quantity: ${mov.quantity}`);
        console.log(`   Balance: ${mov.balance}`);
        console.log(`   ─────────────────────────────────\n`);
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   DIAGNOSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (grn.warehouseId === null || grn.warehouseId === undefined) {
      console.log('❌ ROOT CAUSE: GRN has NULL warehouse ID!');
      console.log('   This means the GRN was created without a warehouse.');
      console.log('   Stock movements inherit this null warehouse from GRN.');
      console.log('\n   FIX NEEDED:');
      console.log('   1. Update GRN with correct warehouse ID');
      console.log('   2. Update all stock movements for this GRN with correct warehouse ID');
    } else {
      console.log('✅ GRN has valid warehouse ID');
      if (movements.some(m => m.warehouseId === null || m.warehouseId === undefined)) {
        console.log('❌ But stock movements have NULL warehouse!');
        console.log('   This is a stock movement creation bug.');
      } else {
        console.log('✅ Stock movements also have valid warehouse IDs');
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

checkGRNWarehouseIssue();
