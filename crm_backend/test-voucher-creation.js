import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Voucher from './models/Voucher.js';
import BankAccount from './models/BankAccount.js';
import CashAccount from './models/CashAccount.js';
import User from './models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const testVoucherCreation = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get a test user
    const user = await User.findOne();
    if (!user) {
      console.error('❌ No user found in database');
      process.exit(1);
    }
    console.log('✅ Found user:', user.name);

    // Check if cash account exists
    let cashAccount = await CashAccount.findOne();
    if (!cashAccount) {
      console.log('Creating cash account...');
      cashAccount = new CashAccount({
        accountName: 'Cash Account',
        currentBalance: 0,
        openingBalance: 0
      });
      await cashAccount.save();
      console.log('✅ Cash account created');
    } else {
      console.log('✅ Cash account exists:', cashAccount.accountName);
    }

    // Test voucher data
    const testVoucherData = {
      voucherType: 'Receipt',
      voucherNumber: 'TEST-RV-001',
      voucherDate: new Date(),
      financialYear: '2025-26',
      partyType: 'Dealer',
      partyId: null, // Will be null for test
      partyName: 'Test Dealer',
      transactionMode: 'Cash',
      totalAmount: 5000,
      allocationType: 'OnAccount',
      narration: 'Test receipt voucher',
      status: 'Posted',
      createdBy: user._id
    };

    console.log('\nCreating test voucher...');
    console.log('Voucher data:', JSON.stringify(testVoucherData, null, 2));

    const voucher = new Voucher(testVoucherData);
    await voucher.save();

    console.log('✅ Voucher created successfully!');
    console.log('Voucher ID:', voucher._id);
    console.log('Voucher Number:', voucher.voucherNumber);

    // Clean up test voucher
    await Voucher.deleteOne({ _id: voucher._id });
    console.log('✅ Test voucher cleaned up');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
};

testVoucherCreation();
