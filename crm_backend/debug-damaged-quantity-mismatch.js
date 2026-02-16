import dotenv from 'dotenv';
import mongoose from 'mongoose';
import StockMovement from './models/Stock.js';
import GRN from './models/GRN.js';

dotenv.config();

async function debugDamagedQuantity() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const productId = '6991fb0065eba9543a0ec61b'; // Product 154154658
    const warehouseId = '68e8f0283f5fd5a817866df6';

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   STOCK MOVEMENTS FOR PRODUCT 154154658');
    console.log('═══════════════════════════════════════════════════════════\n');

    const movements = await StockMovement.find({
      productId: productId,
      warehouseId: warehouseId
    }).sort({ date: 1 });

    console.log(`Found ${movements.length} stock movements:\n`);

    let totalIn = 0;
    let totalOut = 0;
    let damagedCount = 0;

    movements.forEach((mov, idx) => {
      console.log(`${idx + 1}. Date: ${mov.date}`);
      console.log(`   Type: ${mov.type}`);
      console.log(`   Quantity: ${mov.quantity}`);
      console.log(`   Balance: ${mov.balance}`);
      console.log(`   Reference: ${mov.referenceNo} (${mov.referenceType})`);
      console.log(`   Remarks: ${mov.remarks}`);
      
      if (mov.type === 'IN') {
        totalIn += mov.quantity;
      } else if (mov.type === 'OUT') {
        totalOut += mov.quantity;
        if (mov.remarks && mov.remarks.includes('Damaged')) {
          damagedCount += mov.quantity;
        }
      }
      console.log(`   ─────────────────────────────────\n`);
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Total IN movements: ${totalIn}`);
    console.log(`Total OUT movements: ${totalOut}`);
    console.log(`Damaged quantity (from remarks): ${damagedCount}`);
    console.log(`Net Stock: ${totalIn - totalOut}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   GRN DATA CHECK');
    console.log('═══════════════════════════════════════════════════════════\n');

    const grn = await GRN.findOne({ grnNo: 'GRN-1771234629393' });
    
    if (grn) {
      const grnItem = grn.items.find(item => 
        item.productId.toString() === productId
      );
      
      if (grnItem) {
        console.log('GRN Item Details:');
        console.log(`  Received Quantity: ${grnItem.receivedQuantity}`);
        console.log(`  Damaged Quantity: ${grnItem.damageQuantity}`);
        console.log(`  Accepted Quantity: ${grnItem.acceptedQuantity}`);
        console.log(`\n  ⚠️  GRN shows ${grnItem.damageQuantity} damaged`);
        console.log(`  ⚠️  Stock movements show ${damagedCount} damaged`);
        
        if (grnItem.damageQuantity !== damagedCount) {
          console.log(`\n  ❌ MISMATCH FOUND!`);
          console.log(`     GRN damaged: ${grnItem.damageQuantity}`);
          console.log(`     Stock movements damaged: ${damagedCount}`);
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   CHECKING FRONTEND CALCULATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Check how frontend might be calculating damaged quantity
    const outMovements = movements.filter(m => m.type === 'OUT');
    console.log(`Total OUT movements count: ${outMovements.length}`);
    console.log(`Total OUT quantity sum: ${totalOut}`);
    
    console.log('\nOUT movements breakdown:');
    outMovements.forEach((mov, idx) => {
      console.log(`  ${idx + 1}. Quantity: ${mov.quantity}, Remarks: ${mov.remarks}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════\n');
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

debugDamagedQuantity();
