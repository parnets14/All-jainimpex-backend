import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import PaymentTerm from '../models/PaymentTerm.js';
import SchemeType from '../models/SchemeType.js';

dotenv.config();

const paymentTerms = [
  { name: 'Cash on Delivery', code: 'COD', days: 0 },
  { name: 'Net 15 (15 days)', code: 'NET15', days: 15 },
  { name: 'Net 30 (30 days)', code: 'NET30', days: 30 },
  { name: 'Net 45 (45 days)', code: 'NET45', days: 45 },
  { name: 'Net 60 (60 days)', code: 'NET60', days: 60 },
  { name: 'Custom', code: 'CUSTOM', days: null },
];

const schemeTypes = [
  { name: 'Early Payment', code: 'EARLY_PAYMENT', description: 'Discount for early payment' },
  { name: 'Loyalty Reward', code: 'LOYALTY_REWARD', description: 'Reward for loyal suppliers' },
  { name: 'Quarterly Bonus', code: 'QUARTERLY_BONUS', description: 'Bonus paid quarterly' },
  { name: 'Volume Discount', code: 'VOLUME_DISCOUNT', description: 'Discount based on purchase volume' },
];

async function seed() {
  await connectDB();

  // Seed Payment Terms
  for (const pt of paymentTerms) {
    const exists = await PaymentTerm.findOne({ code: pt.code });
    if (!exists) {
      await PaymentTerm.create(pt);
      console.log(`✅ Payment Term created: ${pt.name}`);
    } else {
      console.log(`⏭️  Already exists: ${pt.name}`);
    }
  }

  // Seed Scheme Types
  for (const st of schemeTypes) {
    const exists = await SchemeType.findOne({ code: st.code });
    if (!exists) {
      await SchemeType.create(st);
      console.log(`✅ Scheme Type created: ${st.name}`);
    } else {
      console.log(`⏭️  Already exists: ${st.name}`);
    }
  }

  console.log('\n✅ Seeding complete.');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
