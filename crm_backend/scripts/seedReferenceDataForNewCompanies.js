import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { schemeTypeSchema } from '../models/SchemeType.js';
import { paymentTermSchema } from '../models/PaymentTerm.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net';

// Reference data to seed
const schemeTypes = [
  {
    code: 'CASH_DISC',
    name: 'Cash Discount',
    description: 'Discount for cash payments',
    category: 'discount',
    isActive: true
  },
  {
    code: 'TRADE_DISC',
    name: 'Trade Discount',
    description: 'Discount for trade partners',
    category: 'discount',
    isActive: true
  },
  {
    code: 'VOL_DISC',
    name: 'Volume Discount',
    description: 'Discount based on purchase volume',
    category: 'discount',
    isActive: true
  },
  {
    code: 'SEASON_DISC',
    name: 'Seasonal Discount',
    description: 'Discount for seasonal promotions',
    category: 'discount',
    isActive: true
  },
  {
    code: 'EARLY_PAY',
    name: 'Early Payment Discount',
    description: 'Discount for early payment',
    category: 'discount',
    isActive: true
  }
];

const paymentTerms = [
  {
    code: 'IMM',
    name: 'Immediate',
    days: 0,
    description: 'Payment due immediately',
    isActive: true
  },
  {
    code: 'NET7',
    name: 'Net 7',
    days: 7,
    description: 'Payment due within 7 days',
    isActive: true
  },
  {
    code: 'NET15',
    name: 'Net 15',
    days: 15,
    description: 'Payment due within 15 days',
    isActive: true
  },
  {
    code: 'NET30',
    name: 'Net 30',
    days: 30,
    description: 'Payment due within 30 days',
    isActive: true
  },
  {
    code: 'NET45',
    name: 'Net 45',
    days: 45,
    description: 'Payment due within 45 days',
    isActive: true
  },
  {
    code: 'NET60',
    name: 'Net 60',
    days: 60,
    description: 'Payment due within 60 days',
    isActive: true
  },
  {
    code: 'NET90',
    name: 'Net 90',
    days: 90,
    description: 'Payment due within 90 days',
    isActive: true
  }
];

async function seedReferenceData() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    
    // Connect to the cluster
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB cluster');

    // Get connections to both new company databases
    const ridhiConnection = mongoose.connection.useDb('ridhi_crm');
    const shreeJainConnection = mongoose.connection.useDb('shreejain_crm');

    console.log('\n📦 Seeding Ridhi Build Mart database...');
    await seedCompanyData(ridhiConnection, 'Ridhi Build Mart');

    console.log('\n📦 Seeding Shree Jain Impex database...');
    await seedCompanyData(shreeJainConnection, 'Shree Jain Impex');

    console.log('\n✅ All reference data seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding reference data:', error);
    process.exit(1);
  }
}

async function seedCompanyData(connection, companyName) {
  try {
    // Get or create models on this connection
    const SchemeType = connection.models.SchemeType || connection.model('SchemeType', schemeTypeSchema);
    const PaymentTerm = connection.models.PaymentTerm || connection.model('PaymentTerm', paymentTermSchema);

    // Check if data already exists
    const existingSchemeTypes = await SchemeType.countDocuments();
    const existingPaymentTerms = await PaymentTerm.countDocuments();

    console.log(`  Current data in ${companyName}:`);
    console.log(`    - Scheme Types: ${existingSchemeTypes}`);
    console.log(`    - Payment Terms: ${existingPaymentTerms}`);

    // Seed Scheme Types
    if (existingSchemeTypes === 0) {
      console.log(`  📝 Inserting ${schemeTypes.length} scheme types...`);
      await SchemeType.insertMany(schemeTypes);
      console.log(`  ✅ Scheme types inserted`);
    } else {
      console.log(`  ⏭️  Scheme types already exist, skipping...`);
    }

    // Seed Payment Terms
    if (existingPaymentTerms === 0) {
      console.log(`  📝 Inserting ${paymentTerms.length} payment terms...`);
      await PaymentTerm.insertMany(paymentTerms);
      console.log(`  ✅ Payment terms inserted`);
    } else {
      console.log(`  ⏭️  Payment terms already exist, skipping...`);
    }

    // Verify the data
    const finalSchemeTypes = await SchemeType.countDocuments();
    const finalPaymentTerms = await PaymentTerm.countDocuments();

    console.log(`  ✅ ${companyName} now has:`);
    console.log(`    - Scheme Types: ${finalSchemeTypes}`);
    console.log(`    - Payment Terms: ${finalPaymentTerms}`);

  } catch (error) {
    console.error(`  ❌ Error seeding ${companyName}:`, error);
    throw error;
  }
}

// Run the seeding
seedReferenceData();
