import dotenv from 'dotenv';
import mongoose from 'mongoose';
import GRN from './models/GRN.js';

dotenv.config();

async function checkAllRecentGRNs() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   ALL RECENT GRNs (Last 20)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const grns = await GRN.find()
      .sort({ createdAt: -1 })
      .limit(20);

    if (grns.length === 0) {
      console.log('❌ No GRNs found in database!');
    } else {
      console.log(`Found ${grns.length} GRNs:\n`);
      
      grns.forEach((grn, idx) => {
        console.log(`${idx + 1}. GRN Number: ${grn.grnNumber || 'N/A'}`);
        console.log(`   PO Number: ${grn.poNumber || 'N/A'}`);
        console.log(`   Date: ${grn.grnDate || grn.createdAt}`);
        console.log(`   Warehouse ID: ${grn.warehouseId || 'N/A'}`);
        console.log(`   Status: ${grn.status || 'N/A'}`);
        console.log(`   Products: ${grn.products?.length || 0}`);
        console.log(`   Created: ${grn.createdAt}`);
        console.log(`   ─────────────────────────────────\n`);
      });

      // Check if any GRN has the PO number we're looking for
      const targetPO = 'PO-20260216-068';
      const matchingGRN = grns.find(g => g.poNumber === targetPO);
      
      if (matchingGRN) {
        console.log(`\n✅ Found GRN for ${targetPO}:`);
        console.log(JSON.stringify(matchingGRN, null, 2));
      } else {
        console.log(`\n❌ No GRN found for ${targetPO}`);
      }
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAllRecentGRNs();
