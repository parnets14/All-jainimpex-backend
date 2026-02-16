import dotenv from 'dotenv';
import mongoose from 'mongoose';
import PurchaseOrder from './models/PurchaseOrder.js';
import GRN from './models/GRN.js';

dotenv.config();

async function findRecentPOAndGRN() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Search for PO with partial match
    console.log('🔍 Searching for Purchase Orders containing "068"...\n');
    const pos = await PurchaseOrder.find({
      poNumber: { $regex: '068', $options: 'i' }
    }).sort({ createdAt: -1 }).limit(5);

    if (pos.length > 0) {
      console.log(`Found ${pos.length} Purchase Order(s):\n`);
      pos.forEach(po => {
        console.log(`PO Number: ${po.poNumber}`);
        console.log(`Date: ${po.poDate}`);
        console.log(`Supplier: ${po.supplier?.name || 'N/A'}`);
        console.log(`Products: ${po.products?.length || 0}`);
        console.log(`─────────────────────────────────\n`);
      });
    }

    // Search for GRN with partial match
    console.log('🔍 Searching for GRNs containing "1771234629393"...\n');
    const grns = await GRN.find({
      grnNumber: { $regex: '1771234629393', $options: 'i' }
    }).sort({ createdAt: -1 }).limit(5);

    if (grns.length > 0) {
      console.log(`Found ${grns.length} GRN(s):\n`);
      grns.forEach(grn => {
        console.log(`GRN Number: ${grn.grnNumber}`);
        console.log(`PO Number: ${grn.poNumber}`);
        console.log(`Date: ${grn.grnDate}`);
        console.log(`Products: ${grn.products?.length || 0}`);
        console.log(`─────────────────────────────────\n`);
      });
    }

    // Get most recent POs and GRNs
    console.log('📋 Most Recent 10 Purchase Orders:\n');
    const recentPOs = await PurchaseOrder.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('poNumber poDate supplier createdAt');
    
    recentPOs.forEach(po => {
      console.log(`${po.poNumber} - ${po.poDate} - Created: ${po.createdAt}`);
    });

    console.log('\n📋 Most Recent 10 GRNs:\n');
    const recentGRNs = await GRN.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('grnNumber poNumber grnDate createdAt');
    
    recentGRNs.forEach(grn => {
      console.log(`${grn.grnNumber} - PO: ${grn.poNumber} - ${grn.grnDate} - Created: ${grn.createdAt}`);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

findRecentPOAndGRN();
