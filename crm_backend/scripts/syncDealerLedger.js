import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import DealerLedger from '../models/DealerLedger.js';
import Dealer from '../models/Dealer.js';
import DealerInvoice from '../models/DealerInvoice.js';
import CreditNote from '../models/CreditNote.js';
import SalesOrder from '../models/SalesOrder.js';
import User from '../models/User.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL).then(async () => {
  console.log('Connected to MongoDB');
  
  try {
    // Get a user to use as createdBy
    let user = await User.findOne({ role: 'super_admin' });
    if (!user) {
      user = await User.findOne();
      if (!user) {
        console.log('No users found. Creating a dummy user ID...');
        user = { _id: new mongoose.Types.ObjectId() };
      }
    }
    console.log('Using user:', user.email || 'Dummy User', 'as createdBy');
    
    // Get all dealers
    const dealers = await Dealer.find({});
    console.log(`Found ${dealers.length} dealers`);
    
    let totalCreated = 0;
    
    for (const dealer of dealers) {
      console.log(`\nProcessing dealer: ${dealer.code} - ${dealer.name}`);
      
      // Get all invoices for the dealer that don't have ledger entries
      const invoices = await DealerInvoice.find({ dealer: dealer._id });
      const creditNotes = await CreditNote.find({ dealer: dealer._id });
      
      console.log(`  Found ${invoices.length} invoices and ${creditNotes.length} credit notes`);
      
      let dealerCreated = 0;
      
      // Create ledger entries for invoices
      for (const invoice of invoices) {
        const existingEntry = await DealerLedger.findOne({ invoice: invoice._id });
        if (!existingEntry) {
          // Get the last entry for this dealer to calculate running balance
          const lastEntry = await DealerLedger.findOne(
            { dealer: dealer._id },
            {},
            { sort: { 'createdAt': -1 } }
          );
          
          let previousBalance = 0;
          if (lastEntry) {
            previousBalance = lastEntry.runningBalance;
          }
          
          // Try to find the related sales order to get salesType and creditDaysApplied
          let salesType = null;
          let creditDaysApplied = invoice.creditDays || 0;
          
          if (invoice.salesOrder) {
            const salesOrder = await SalesOrder.findById(invoice.salesOrder);
            if (salesOrder) {
              salesType = salesOrder.salesType;
              creditDaysApplied = salesOrder.creditDaysApplied || salesOrder.creditDays || 0;
            }
          }
          
          const ledgerEntry = new DealerLedger({
            dealer: dealer._id,
            dealerName: invoice.dealerName || invoice.customerName,
            dealerCode: invoice.dealerCode || dealer.code,
            entryDate: invoice.invoiceDate,
            transactionType: "Invoice",
            invoice: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceValue: invoice.totalAmount,
            salesType: salesType,
            creditDaysApplied: creditDaysApplied,
            debitAmount: invoice.totalAmount,
            creditAmount: 0,
            runningBalance: previousBalance + invoice.totalAmount,
            description: `Invoice ${invoice.invoiceNumber}${salesType ? ` (${salesType})` : ''}`,
            creditDays: creditDaysApplied,
            dueDate: invoice.dueDate,
            pointsEarned: invoice.totalPoints || 0,
            schemeAmount: invoice.totalDiscount || 0,
            createdBy: user._id
          });
          await ledgerEntry.save();
          dealerCreated++;
          console.log(`    Created ledger entry for invoice: ${invoice.invoiceNumber} (₹${invoice.totalAmount})${salesType ? ` - ${salesType}` : ''}`);
        }
      }
      
      // Create ledger entries for credit notes
      for (const creditNote of creditNotes) {
        const existingEntry = await DealerLedger.findOne({ creditNote: creditNote._id });
        if (!existingEntry) {
          // Get the last entry for this dealer to calculate running balance
          const lastEntry = await DealerLedger.findOne(
            { dealer: dealer._id },
            {},
            { sort: { 'createdAt': -1 } }
          );
          
          let previousBalance = 0;
          if (lastEntry) {
            previousBalance = lastEntry.runningBalance;
          }
          
          const ledgerEntry = new DealerLedger({
            dealer: dealer._id,
            dealerName: creditNote.dealerName,
            dealerCode: creditNote.dealerCode,
            entryDate: creditNote.creditNoteDate,
            transactionType: "Credit Note",
            creditNote: creditNote._id,
            creditNoteNumber: creditNote.creditNoteNumber,
            creditAmount: creditNote.creditAmount,
            debitAmount: 0,
            runningBalance: previousBalance - creditNote.creditAmount,
            description: `Credit Note ${creditNote.creditNoteNumber}`,
            remarks: creditNote.creditReason,
            paymentMethod: creditNote.paymentMethod,
            chequeDetails: creditNote.chequeDetails,
            upiDetails: creditNote.upiDetails,
            bankTransferDetails: creditNote.bankTransferDetails,
            createdBy: user._id
          });
          await ledgerEntry.save();
          dealerCreated++;
          console.log(`    Created ledger entry for credit note: ${creditNote.creditNoteNumber} (₹${creditNote.creditAmount})`);
        }
      }
      
      console.log(`  Created ${dealerCreated} ledger entries for ${dealer.name}`);
      totalCreated += dealerCreated;
    }
    
    console.log(`\n✅ Sync completed! Created ${totalCreated} ledger entries in total.`);
    console.log('You can now view the dealer ledger entries in the frontend.');
    
  } catch (error) {
    console.error('Error syncing ledger entries:', error);
  } finally {
    mongoose.connection.close();
  }
}).catch(error => {
  console.error('MongoDB connection error:', error);
});
