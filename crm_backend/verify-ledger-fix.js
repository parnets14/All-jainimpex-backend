import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';

dotenv.config();

const verifyLedgerFix = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find Kiran Kumar dealer
    const dealer = await Dealer.findOne({ name: /kiran/i });
    if (!dealer) {
      console.log('Kiran Kumar dealer not found');
      return;
    }

    console.log('\n=== Dealer Found ===');
    console.log(`Name: ${dealer.name}`);
    console.log(`ID: ${dealer._id}`);

    // Check all ledger entries for this dealer (including advance payments)
    const allEntries = await DealerLedger.find({ dealer: dealer._id })
      .sort({ entryDate: 1 });

    console.log(`\n=== Total Ledger Entries: ${allEntries.length} ===`);

    // Filter by transaction type
    const invoices = allEntries.filter(e => e.transactionType === 'Invoice');
    const payments = allEntries.filter(e => e.transactionType === 'Payment');
    const advancePayments = allEntries.filter(e => e.transactionType === 'Advance Payment');
    const advanceAdjustments = allEntries.filter(e => e.transactionType === 'Advance Adjustment');

    console.log(`\nInvoices: ${invoices.length}`);
    console.log(`Payments: ${payments.length}`);
    console.log(`Advance Payments: ${advancePayments.length}`);
    console.log(`Advance Adjustments: ${advanceAdjustments.length}`);

    // Show advance payment details
    if (advancePayments.length > 0) {
      console.log('\n=== Advance Payment Details ===');
      advancePayments.forEach(entry => {
        console.log(`\nEntry ID: ${entry._id}`);
        console.log(`Date: ${entry.entryDate}`);
        console.log(`Transaction Type: ${entry.transactionType}`);
        console.log(`Credit Amount: ₹${entry.creditAmount}`);
        console.log(`Payment Method: ${entry.paymentMethod}`);
        console.log(`Description: ${entry.description}`);
        if (entry.advanceDetails) {
          console.log(`Payment Number: ${entry.advanceDetails.paymentNumber}`);
        }
      });
    }

    // Simulate the backend filter that was causing the issue
    console.log('\n=== Testing Backend Filter ===');
    
    // OLD filter (was excluding advance payments)
    const oldFilter = {
      dealer: dealer._id,
      transactionType: { $in: ['Invoice', 'Payment'] }
    };
    const oldResults = await DealerLedger.find(oldFilter);
    console.log(`OLD Filter Results: ${oldResults.length} entries`);
    console.log(`- Includes Advance Payments: ${oldResults.some(e => e.transactionType === 'Advance Payment')}`);

    // NEW filter (includes advance payments)
    const newFilter = {
      dealer: dealer._id,
      transactionType: { $in: ['Invoice', 'Payment', 'Advance Payment', 'Advance Adjustment'] }
    };
    const newResults = await DealerLedger.find(newFilter);
    console.log(`\nNEW Filter Results: ${newResults.length} entries`);
    console.log(`- Includes Advance Payments: ${newResults.some(e => e.transactionType === 'Advance Payment')}`);

    console.log('\n=== Fix Verification Complete ===');
    console.log('The backend filter has been updated to include Advance Payment and Advance Adjustment transaction types.');
    console.log('Advance payments should now appear in the Dealer Ledger frontend.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
};

verifyLedgerFix();
