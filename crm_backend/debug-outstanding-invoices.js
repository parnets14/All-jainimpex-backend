// Debug why invoice is not showing in outstanding invoices
import mongoose from 'mongoose';
import DealerInvoice from './models/DealerInvoice.js';
import Dealer from './models/Dealer.js';
import dotenv from 'dotenv';

dotenv.config();

const debugOutstandingInvoices = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB\n');

    // Find Kiran Kumar dealer
    const dealer = await Dealer.findOne({ name: /kiran kumar/i });
    
    if (!dealer) {
      console.log('❌ Dealer "Kiran Kumar" not found');
      return;
    }

    console.log('✅ Found Dealer:');
    console.log('Name:', dealer.name);
    console.log('ID:', dealer._id);
    console.log('');

    // Find all invoices for this dealer
    const allInvoices = await DealerInvoice.find({ dealer: dealer._id });
    
    console.log(`📋 Total Invoices for ${dealer.name}: ${allInvoices.length}\n`);

    if (allInvoices.length === 0) {
      console.log('❌ No invoices found for this dealer');
      return;
    }

    // Check each invoice
    allInvoices.forEach((invoice, index) => {
      console.log(`\n${index + 1}. Invoice: ${invoice.invoiceNumber}`);
      console.log('   ================================');
      console.log('   Status:', invoice.status);
      console.log('   Payment Status:', invoice.paymentStatus);
      console.log('   Is Deleted:', invoice.isDeleted || false);
      console.log('   Total Amount:', `₹${invoice.totalAmount?.toLocaleString('en-IN')}`);
      console.log('   Amount Paid:', `₹${(invoice.amountPaid || 0).toLocaleString('en-IN')}`);
      console.log('   Pending Amount:', `₹${(invoice.pendingAmount || invoice.totalAmount).toLocaleString('en-IN')}`);
      
      // Check conditions for outstanding invoices API
      const conditions = {
        isApproved: invoice.status === 'Approved',
        notDeleted: !invoice.isDeleted,
        notFullyPaid: invoice.paymentStatus !== 'Paid',
        hasPending: (invoice.pendingAmount || invoice.totalAmount) > 0
      };
      
      console.log('\n   Conditions Check:');
      console.log('   ✓ Status is Approved:', conditions.isApproved ? '✅ YES' : '❌ NO');
      console.log('   ✓ Not Deleted:', conditions.notDeleted ? '✅ YES' : '❌ NO');
      console.log('   ✓ Not Fully Paid:', conditions.notFullyPaid ? '✅ YES' : '❌ NO');
      console.log('   ✓ Has Pending Amount:', conditions.hasPending ? '✅ YES' : '❌ NO');
      
      const shouldShow = Object.values(conditions).every(v => v === true);
      console.log('\n   🎯 Should Show in Outstanding Invoices:', shouldShow ? '✅ YES' : '❌ NO');
      
      if (!shouldShow) {
        console.log('\n   ⚠️  Failing Conditions:');
        if (!conditions.isApproved) console.log('      - Status is not "Approved" (current:', invoice.status + ')');
        if (!conditions.notDeleted) console.log('      - Invoice is deleted');
        if (!conditions.notFullyPaid) console.log('      - Payment status is "Paid"');
        if (!conditions.hasPending) console.log('      - No pending amount');
      }
    });

    // Show what the API query would look like
    console.log('\n\n📊 API Query for Outstanding Invoices:');
    console.log('================================');
    console.log('Query:', JSON.stringify({
      dealer: dealer._id,
      status: 'Approved',
      isDeleted: { $ne: true },
      paymentStatus: { $ne: 'Paid' },
      $or: [
        { pendingAmount: { $gt: 0 } },
        { $and: [{ pendingAmount: { $exists: false } }, { totalAmount: { $gt: 0 } }] }
      ]
    }, null, 2));

    // Test the actual query
    console.log('\n\n🔍 Testing Actual API Query:');
    console.log('================================');
    
    const outstandingInvoices = await DealerInvoice.find({
      dealer: dealer._id,
      status: 'Approved',
      isDeleted: { $ne: true },
      paymentStatus: { $ne: 'Paid' },
      $or: [
        { pendingAmount: { $gt: 0 } },
        { $and: [{ pendingAmount: { $exists: false } }, { totalAmount: { $gt: 0 } }] }
      ]
    });

    console.log(`Found ${outstandingInvoices.length} outstanding invoice(s)\n`);
    
    if (outstandingInvoices.length > 0) {
      outstandingInvoices.forEach((inv, i) => {
        console.log(`${i + 1}. ${inv.invoiceNumber} - ₹${(inv.pendingAmount || inv.totalAmount).toLocaleString('en-IN')}`);
      });
    } else {
      console.log('❌ No invoices match the query');
      console.log('\n💡 Possible reasons:');
      console.log('   1. Invoice status is not "Approved"');
      console.log('   2. Invoice is marked as deleted');
      console.log('   3. Payment status is "Paid"');
      console.log('   4. Pending amount is 0 or negative');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n\nDisconnected from MongoDB');
  }
};

debugOutstandingInvoices();
