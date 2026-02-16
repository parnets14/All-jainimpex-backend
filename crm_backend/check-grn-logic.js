import mongoose from 'mongoose';
import dotenv from 'dotenv';
import GRN from './models/GRN.js';
import Product from './models/Product.js';

dotenv.config();

const checkGRNLogic = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    const grnNo = 'GRN-1771236654183';
    
    console.log(`\n🔍 Checking GRN Logic for: ${grnNo}`);
    console.log('='.repeat(70));

    const grn = await GRN.findOne({ grnNo }).populate('items.productId', 'productCode itemName');
    
    if (!grn) {
      console.log(`❌ GRN not found`);
      process.exit(1);
    }

    console.log(`\n📦 GRN Details:`);
    console.log(`   GRN No: ${grn.grnNo}`);
    console.log(`   Date: ${new Date(grn.grnDate).toLocaleString()}`);

    grn.items.forEach((item, i) => {
      console.log(`\n   Item ${i + 1}: ${item.productId?.itemName || 'Unknown'} (${item.productId?.productCode || 'N/A'})`);
      console.log(`      Received Quantity: ${item.receivedQuantity}`);
      console.log(`      Accepted Quantity: ${item.acceptedQuantity}`);
      console.log(`      Damage Quantity: ${item.damageQuantity || 0}`);
      console.log(`      Rejected Quantity: ${item.rejectedQuantity || 0}`);
      
      const total = (item.acceptedQuantity || 0) + (item.damageQuantity || 0) + (item.rejectedQuantity || 0);
      console.log(`      Total (Accepted + Damaged + Rejected): ${total}`);
      console.log(`      Matches Received? ${total === item.receivedQuantity ? '✅ YES' : '❌ NO'}`);
    });

    console.log(`\n💡 Business Logic Understanding:`);
    console.log(`   If Received = Accepted + Damaged + Rejected:`);
    console.log(`   - Damaged units are PART OF the received quantity`);
    console.log(`   - Stock should increase by Accepted only`);
    console.log(`   - Damaged units never enter usable stock`);
    console.log(`\n   If Received = Accepted (and Damaged is separate):`);
    console.log(`   - Damaged units are EXTRA/SEPARATE`);
    console.log(`   - Stock increases by Accepted, then decreases by Damaged`);
    console.log(`   - Net effect: Accepted - Damaged`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

checkGRNLogic();
