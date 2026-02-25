import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPayment from './models/DealerPayment.js';
import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';

dotenv.config();

const checkAdvancePayment = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Find the payment
    const payment = await DealerPayment.findOne({ paymentNumber: 'DP-20260225-001' })
      .populate('dealer', 'name code advanceBalance');

    if (!payment) {
      console.log('❌ Payment DP-20260225-001 not found');
      return;
    }

    console.log('📋 Payment Details:');
    console.log('  Payment Number:', payment.paymentNumber);
    console.log('  Dealer:', payment.dealer?.name);
    console.log('  Payment Category:', payment.paymentCategory);
    console.log('  Payment Amount:', payment.paymentAmount);
    console.log('  Status:', payment.status);
    console.log('  Advance Details:', JSON.stringify(payment.advanceDetails, null, 2));
    console.log('  Created At:', payment.createdAt);
    console.log('  Approved At:', payment.approvedAt);
    console.log('  Approved By:', payment.approvedBy);

    // Check dealer's advance balance
    console.log('\n💰 Dealer Advance Balance:', payment.dealer?.advanceBalance || 0);

    // Check if ledger entry exists
    const ledgerEntries = await DealerLedger.find({
      dealer: payment.dealer._id,
      transactionType: 'Advance Payment'
    }).sort({ createdAt: -1 });

    console.log('\n📊 Ledger Entries for Advance Payment:');
    if (ledgerEntries.length === 0) {
      console.log('  ❌ No ledger entries found for advance payment');
    } else {
      ledgerEntries.forEach((entry, index) => {
        console.log(`\n  Entry ${index + 1}:`);
        console.log('    Date:', entry.entryDate);
        console.log('    Description:', entry.description);
        console.log('    Credit Amount:', entry.creditAmount);
        console.log('    Running Balance:', entry.runningBalance);
      });
    }

    // Check all ledger entries for this dealer
    const allLedgerEntries = await DealerLedger.find({
      dealer: payment.dealer._id
    }).sort({ createdAt: -1 }).limit(5);

    console.log('\n📋 Last 5 Ledger Entries for Dealer:');
    allLedgerEntries.forEach((entry, index) => {
      console.log(`\n  ${index + 1}. ${entry.transactionType}`);
      console.log('     Date:', entry.entryDate);
      console.log('     Description:', entry.description);
      console.log('     Debit:', entry.debitAmount);
      console.log('     Credit:', entry.creditAmount);
      console.log('     Balance:', entry.runningBalance);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

checkAdvancePayment();
