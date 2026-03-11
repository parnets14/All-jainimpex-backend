import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';
import DealerLedger from './models/DealerLedger.js';
import PaymentAllocation from './models/PaymentAllocation.js';

dotenv.config();

const fixDealerPaymentLedger = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find dealer "Kiran Kumar"
    const dealer = await Dealer.findOne({ 
      name: /Kiran Kumar/i
    });

    if (!dealer) {
      console.log('❌ Dealer "Kiran Kumar" not found');
      process.exit(1);
    }

    console.log(`\n📋 Processing dealer: ${dealer.name}`);
    console.log(`   Credit Limit: ₹${dealer.creditLimit?.toLocaleString() || 0}`);

    // Get all payment allocations for this dealer
    const allocations = await PaymentAllocation.find({ 
      partyId: dealer._id 
    }).sort({ allocationDate: 1 });

    console.log(`\n💳 Found ${allocations.length} payment allocations`);

    let createdCount = 0;
    let skippedCount = 0;

    for (const allocation of allocations) {
      // Check if ledger entry already exists for this allocation
      const existingEntry = await DealerLedger.findOne({
        dealer: dealer._id,
        transactionType: 'Payment',
        description: { $regex: allocation.allocationNumber }
      });

      if (existingEntry) {
        console.log(`⏭️  Skipping ${allocation.allocationNumber} - ledger entry already exists`);
        skippedCount++;
        continue;
      }

      // Create ledger entry for this payment allocation
      const invoiceNumbers = allocation.allocations.map(a => a.invoiceNumber).join(', ');
      
      const ledgerEntry = new DealerLedger({
        dealer: dealer._id,
        dealerName: dealer.name,
        dealerCode: dealer.dealerCode,
        transactionType: 'Payment',
        invoiceNumber: invoiceNumbers,
        debitAmount: 0,
        creditAmount: allocation.totalAllocated || 0,
        paymentReceived: allocation.totalAllocated || 0,
        paymentMethod: allocation.voucherType || 'Receipt',
        description: `Payment allocation: ${allocation.allocationNumber} - Voucher: ${allocation.voucherNumber}`,
        remarks: `Allocated to invoices: ${invoiceNumbers}`,
        entryDate: allocation.allocationDate,
        createdBy: allocation.createdBy || null
      });

      await ledgerEntry.save();
      console.log(`✅ Created ledger entry for ${allocation.allocationNumber} - ₹${allocation.totalAllocated.toLocaleString()}`);
      createdCount++;
    }

    console.log(`\n📊 SUMMARY:`);
    console.log(`   Created: ${createdCount} ledger entries`);
    console.log(`   Skipped: ${skippedCount} (already exist)`);

    // Recalculate outstanding
    const allLedgerEntries = await DealerLedger.find({ dealer: dealer._id })
      .sort({ entryDate: 1 });

    const currentOutstanding = allLedgerEntries.reduce((sum, entry) => {
      return sum + (entry.debitAmount || 0) - (entry.creditAmount || 0);
    }, 0);

    console.log(`\n💰 UPDATED OUTSTANDING:`);
    console.log(`   Current Outstanding: ₹${currentOutstanding.toLocaleString()}`);
    console.log(`   Available Credit: ₹${Math.max(0, dealer.creditLimit - currentOutstanding).toLocaleString()}`);

    if (currentOutstanding <= 0) {
      console.log(`\n✅ SUCCESS: Dealer outstanding is now ₹0 or credit balance!`);
    } else {
      console.log(`\n⚠️  Dealer still has outstanding: ₹${currentOutstanding.toLocaleString()}`);
    }

    console.log('\n✅ Fix Complete');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixDealerPaymentLedger();
