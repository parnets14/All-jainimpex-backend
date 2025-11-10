import mongoose from "mongoose";
import dotenv from "dotenv";
import DealerInvoice from "../models/DealerInvoice.js";
import CreditNote from "../models/CreditNote.js";
import DealerLedger from "../models/DealerLedger.js";
import DealerPayment from "../models/DealerPayment.js";

dotenv.config();

// Set to true to actually perform deletion, false to just show what would be deleted
const PERFORM_DELETION = false;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL || "mongodb://localhost:27017/crm").then(async () => {
  console.log('✅ Connected to MongoDB');
  
  try {
    console.log('\n🔍 Searching for invoices that might have been created from credit notes...\n');
    
    // Get all credit notes
    const creditNotes = await CreditNote.find({})
      .populate('originalInvoice', 'invoiceNumber dealer')
      .select('_id creditNoteNumber originalInvoice createdAt dealer');
    console.log(`Found ${creditNotes.length} credit notes`);
    
    // Strategy 1: Find invoices created on the same day as credit notes for the same dealer
    const suspiciousInvoices = new Map(); // Use Map to avoid duplicates
    
    for (const creditNote of creditNotes) {
      if (!creditNote.originalInvoice) continue;
      
      const creditNoteDate = new Date(creditNote.createdAt);
      const startOfDay = new Date(creditNoteDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(creditNoteDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      // Find invoices created on the same day for the same dealer
      const sameDayInvoices = await DealerInvoice.find({
        dealer: creditNote.dealer,
        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay
        },
        _id: { $ne: creditNote.originalInvoice._id } // Exclude the original invoice
      }).select('_id invoiceNumber createdAt totalAmount items');
      
      if (sameDayInvoices.length > 0) {
        sameDayInvoices.forEach(inv => {
          if (!suspiciousInvoices.has(inv._id.toString())) {
            suspiciousInvoices.set(inv._id.toString(), {
              invoice: inv,
              creditNote: creditNote.creditNoteNumber,
              originalInvoice: creditNote.originalInvoice.invoiceNumber,
              reason: 'Created on same day as credit note'
            });
          }
        });
      }
    }
    
    console.log(`\n⚠️  Found ${suspiciousInvoices.size} suspicious invoices that might have been created from credit notes`);
    
    if (suspiciousInvoices.size === 0) {
      console.log('\n✅ No suspicious invoices found.');
      console.log('💡 Credit notes do not appear to have created duplicate invoices.');
      console.log('💡 If you want to delete credit notes themselves, modify this script.');
      process.exit(0);
    }
    
    // Display suspicious invoices
    console.log('\n📋 Suspicious Invoices Found:\n');
    let index = 1;
    const invoiceIdsToDelete = [];
    
    for (const [invoiceId, data] of suspiciousInvoices.entries()) {
      const inv = data.invoice;
      console.log(`${index}. Invoice: ${inv.invoiceNumber}`);
      console.log(`   ID: ${inv._id}`);
      console.log(`   Amount: ₹${inv.totalAmount.toLocaleString()}`);
      console.log(`   Created: ${inv.createdAt}`);
      console.log(`   Related Credit Note: ${data.creditNote}`);
      console.log(`   Original Invoice: ${data.originalInvoice}`);
      console.log(`   Reason: ${data.reason}`);
      
      // Count related data
      const ledgerCount = await DealerLedger.countDocuments({ invoice: inv._id });
      const paymentCount = await DealerPayment.countDocuments({ dealerInvoice: inv._id });
      console.log(`   Related: ${ledgerCount} ledger entries, ${paymentCount} payments`);
      console.log('');
      
      invoiceIdsToDelete.push({
        id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        ledgerCount,
        paymentCount
      });
      
      index++;
    }
    
    if (!PERFORM_DELETION) {
      console.log('\n⚠️  DELETION IS DISABLED (PERFORM_DELETION = false)');
      console.log('⚠️  To enable deletion, set PERFORM_DELETION = true in the script');
      console.log('\n📊 Summary of what would be deleted:');
      console.log(`   - ${invoiceIdsToDelete.length} invoices`);
      const totalLedger = invoiceIdsToDelete.reduce((sum, inv) => sum + inv.ledgerCount, 0);
      const totalPayments = invoiceIdsToDelete.reduce((sum, inv) => sum + inv.paymentCount, 0);
      console.log(`   - ${totalLedger} ledger entries`);
      console.log(`   - ${totalPayments} payments`);
      process.exit(0);
    }
    
    // Perform deletion
    console.log('\n🗑️  Starting deletion...\n');
    let deletedInvoiceCount = 0;
    let deletedLedgerCount = 0;
    let deletedPaymentCount = 0;
    
    for (const inv of invoiceIdsToDelete) {
      try {
        // Delete related ledger entries
        const ledgerResult = await DealerLedger.deleteMany({ invoice: inv.id });
        deletedLedgerCount += ledgerResult.deletedCount;
        
        // Delete related payments
        const paymentResult = await DealerPayment.deleteMany({ dealerInvoice: inv.id });
        deletedPaymentCount += paymentResult.deletedCount;
        
        // Delete the invoice
        await DealerInvoice.findByIdAndDelete(inv.id);
        deletedInvoiceCount++;
        
        console.log(`✅ Deleted invoice ${inv.invoiceNumber}`);
        console.log(`   - ${ledgerResult.deletedCount} ledger entries`);
        console.log(`   - ${paymentResult.deletedCount} payments`);
      } catch (error) {
        console.error(`❌ Error deleting invoice ${inv.invoiceNumber}:`, error.message);
      }
    }
    
    console.log(`\n✅ Deletion complete!`);
    console.log(`   - Deleted ${deletedInvoiceCount} invoices`);
    console.log(`   - Deleted ${deletedLedgerCount} ledger entries`);
    console.log(`   - Deleted ${deletedPaymentCount} payments`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}).catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

