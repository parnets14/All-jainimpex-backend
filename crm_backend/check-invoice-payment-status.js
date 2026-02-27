// Check invoice payment status and why it's not showing in Payment Allocation
import mongoose from 'mongoose';
import DealerInvoice from './models/DealerInvoice.js';
import Dealer from './models/Dealer.js';
import dotenv from 'dotenv';

dotenv.config();

const checkInvoiceStatus = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB\n');

    // Find the most recent invoice
    const recentInvoice = await DealerInvoice.findOne()
      .sort({ createdAt: -1 })
      .populate('dealer', 'name');
    
    if (!recentInvoice) {
      console.log('❌ No invoices found in database');
      return;
    }

    console.log('📋 Most Recent Invoice Details:');
    console.log('================================');
    console.log('Invoice Number:', recentInvoice.invoiceNumber);
    console.log('Dealer:', recentInvoice.dealer?.name || 'N/A');
    console.log('Invoice Date:', recentInvoice.invoiceDate);
    console.log('Total Amount:', `₹${recentInvoice.totalAmount?.toLocaleString('en-IN')}`);
    console.log('\n💰 Payment Status:');
    console.log('================================');
    console.log('Payment Status:', recentInvoice.paymentStatus);
    console.log('Amount Paid:', `₹${(recentInvoice.amountPaid || 0).toLocaleString('en-IN')}`);
    console.log('Pending Amount:', `₹${(recentInvoice.pendingAmount || recentInvoice.totalAmount).toLocaleString('en-IN')}`);
    
    console.log('\n📊 Invoice Status:');
    console.log('================================');
    console.log('Status:', recentInvoice.status);
    console.log('Is Deleted:', recentInvoice.isDeleted || false);
    console.log('Is Cancelled:', recentInvoice.status === 'Cancelled');
    
    console.log('\n✅ Should Show in Payment Allocation?');
    console.log('================================');
    
    const shouldShow = 
      recentInvoice.status === 'Approved' &&
      !recentInvoice.isDeleted &&
      recentInvoice.paymentStatus !== 'Paid' &&
      (recentInvoice.pendingAmount || recentInvoice.totalAmount) > 0;
    
    if (shouldShow) {
      console.log('✅ YES - This invoice SHOULD appear in Payment Allocation');
      console.log('\nConditions Met:');
      console.log('  ✓ Status is Approved');
      console.log('  ✓ Not deleted');
      console.log('  ✓ Payment status is not Paid');
      console.log('  ✓ Has pending amount');
    } else {
      console.log('❌ NO - This invoice will NOT appear in Payment Allocation');
      console.log('\nReasons:');
      if (recentInvoice.status !== 'Approved') {
        console.log(`  ✗ Status is "${recentInvoice.status}" (must be "Approved")`);
      }
      if (recentInvoice.isDeleted) {
        console.log('  ✗ Invoice is deleted');
      }
      if (recentInvoice.paymentStatus === 'Paid') {
        console.log('  ✗ Payment status is "Paid"');
      }
      if ((recentInvoice.pendingAmount || recentInvoice.totalAmount) <= 0) {
        console.log('  ✗ No pending amount');
      }
    }

    // Check all invoices for this dealer
    console.log('\n\n📊 All Invoices for This Dealer:');
    console.log('================================');
    
    const allInvoices = await DealerInvoice.find({ 
      dealer: recentInvoice.dealer._id 
    }).sort({ createdAt: -1 });
    
    console.log(`Total invoices: ${allInvoices.length}\n`);
    
    allInvoices.forEach((inv, index) => {
      const pending = inv.pendingAmount || inv.totalAmount;
      const showStatus = 
        inv.status === 'Approved' &&
        !inv.isDeleted &&
        inv.paymentStatus !== 'Paid' &&
        pending > 0;
      
      console.log(`${index + 1}. ${inv.invoiceNumber}`);
      console.log(`   Status: ${inv.status} | Payment: ${inv.paymentStatus}`);
      console.log(`   Amount: ₹${inv.totalAmount?.toLocaleString('en-IN')} | Pending: ₹${pending.toLocaleString('en-IN')}`);
      console.log(`   Show in Payment Allocation: ${showStatus ? '✅ YES' : '❌ NO'}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
};

checkInvoiceStatus();
