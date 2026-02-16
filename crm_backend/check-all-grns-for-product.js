import dotenv from 'dotenv';
import mongoose from 'mongoose';
import GRN from './models/GRN.js';

dotenv.config();

async function checkAllGRNsForProduct() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const productId = '6991fb0065eba9543a0ec61b'; // Product 154154658
    const warehouseId = '68e8f0283f5fd5a817866df6';

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   ALL GRNs CONTAINING PRODUCT 154154658');
    console.log('═══════════════════════════════════════════════════════════\n');

    const grns = await GRN.find({
      'items.productId': productId,
      warehouseId: warehouseId
    }).sort({ createdAt: -1 });

    console.log(`Found ${grns.length} GRN(s) for this product:\n`);

    let totalDamaged = 0;

    grns.forEach((grn, idx) => {
      console.log(`${idx + 1}. GRN Number: ${grn.grnNo}`);
      console.log(`   Date: ${grn.grnDate || grn.createdAt}`);
      console.log(`   Status: ${grn.status}`);
      
      const item = grn.items.find(i => i.productId.toString() === productId);
      if (item) {
        console.log(`   Received: ${item.receivedQuantity}`);
        console.log(`   Damaged: ${item.damageQuantity}`);
        console.log(`   Accepted: ${item.acceptedQuantity}`);
        totalDamaged += item.damageQuantity || 0;
      }
      console.log(`   ─────────────────────────────────\n`);
    });

    console.log(`\nTotal Damaged Quantity (sum from all GRNs): ${totalDamaged}`);
    console.log(`\n⚠️  If this equals 2, then there are 2 GRNs with 1 damaged each`);
    console.log(`⚠️  Or 1 GRN is being counted twice in the calculation`);

    console.log('\n═══════════════════════════════════════════════════════════\n');
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkAllGRNsForProduct();
