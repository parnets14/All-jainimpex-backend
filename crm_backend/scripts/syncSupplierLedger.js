import mongoose from 'mongoose';
import SupplierLedger from '../models/SupplierLedger.js';
import SupplierInvoice from '../models/SupplierInvoice.js';
import SupplierPayment from '../models/SupplierPayment.js';
import Supplier from '../models/Supplier.js';
import { config } from 'dotenv';

// Load environment variables
config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const syncSupplierLedger = async () => {
  try {
    console.log('Starting supplier ledger sync...');
    
    // Clear existing supplier ledger entries
    await SupplierLedger.deleteMany({});
    console.log('Cleared existing supplier ledger entries');
    
    // Get all suppliers
    const suppliers = await Supplier.find({});
    console.log(`Found ${suppliers.length} suppliers`);
    
    for (const supplier of suppliers) {
      console.log(`Processing supplier: ${supplier.name}`);
      
      // Get all invoices for this supplier, sorted by date
      const invoices = await SupplierInvoice.find({ supplier: supplier._id })
        .sort({ invoiceDate: 1 });
      
      console.log(`Found ${invoices.length} invoices for ${supplier.name}`);
      
      let runningBalance = 0;
      
      // Process invoices
      for (const invoice of invoices) {
        // Create ledger entry for invoice
        const invoiceLedgerEntry = new SupplierLedger({
          supplier: supplier._id,
          supplierName: supplier.name,
          supplierCode: supplier.code,
          entryDate: invoice.invoiceDate,
          transactionType: "Invoice",
          invoice: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceValue: invoice.totalAmount,
          debitAmount: invoice.totalAmount,
          creditAmount: 0,
          runningBalance: runningBalance + invoice.totalAmount,
          description: `Invoice ${invoice.invoiceNumber}`,
          creditDays: invoice.creditDays || 0,
          dueDate: invoice.dueDate,
          createdBy: invoice.createdBy
        });
        
        await invoiceLedgerEntry.save();
        runningBalance += invoice.totalAmount;
        
        console.log(`Created ledger entry for invoice: ${invoice.invoiceNumber}`);
      }
      
      // Get all approved payments for this supplier, sorted by date
      const payments = await SupplierPayment.find({ 
        supplier: supplier._id,
        status: "Approved"
      }).sort({ paymentDate: 1 });
      
      console.log(`Found ${payments.length} approved payments for ${supplier.name}`);
      
      // Process payments
      for (const payment of payments) {
        // Create ledger entry for payment
        const paymentLedgerEntry = new SupplierLedger({
          supplier: supplier._id,
          supplierName: supplier.name,
          supplierCode: supplier.code,
          entryDate: payment.paymentDate,
          transactionType: "Payment",
          invoice: payment.supplierInvoice,
          invoiceNumber: payment.invoiceNumber,
          invoiceValue: payment.invoiceAmount,
          paymentMade: payment.paymentAmount,
          paymentMethod: payment.paymentMethod,
          chequeDetails: payment.chequeDetails,
          upiDetails: payment.upiDetails,
          bankTransferDetails: payment.bankTransferDetails,
          debitAmount: 0,
          creditAmount: payment.paymentAmount,
          runningBalance: runningBalance - payment.paymentAmount,
          description: `Payment ${payment.paymentNumber} for Invoice ${payment.invoiceNumber}`,
          remarks: payment.remarks,
          createdBy: payment.createdBy
        });
        
        await paymentLedgerEntry.save();
        runningBalance -= payment.paymentAmount;
        
        console.log(`Created ledger entry for payment: ${payment.paymentNumber}`);
      }
      
      console.log(`Completed processing supplier: ${supplier.name} (Final balance: ${runningBalance})`);
    }
    
    console.log('Supplier ledger sync completed successfully!');
    
    // Get final statistics
    const totalEntries = await SupplierLedger.countDocuments();
    const invoiceEntries = await SupplierLedger.countDocuments({ transactionType: "Invoice" });
    const paymentEntries = await SupplierLedger.countDocuments({ transactionType: "Payment" });
    
    console.log(`Total ledger entries created: ${totalEntries}`);
    console.log(`Invoice entries: ${invoiceEntries}`);
    console.log(`Payment entries: ${paymentEntries}`);
    
  } catch (error) {
    console.error('Error syncing supplier ledger:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
};

// Run the sync
connectDB().then(() => {
  syncSupplierLedger();
});
