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
    await mongoose.connect(process.env.MONGO_URL);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const testSupplierLedger = async () => {
  try {
    console.log('Testing supplier ledger functionality...');
    
    // Check if we have any suppliers
    const suppliers = await Supplier.find({});
    console.log(`Found ${suppliers.length} suppliers`);
    
    if (suppliers.length === 0) {
      console.log('No suppliers found. Creating a test supplier...');
      const testSupplier = new Supplier({
        name: 'Test Supplier',
        code: 'TS001',
        companyName: 'Test Supplier Company',
        gstin: '29ABCDE1234F1Z5',
        phone: '9876543210',
        email: 'test@supplier.com',
        address: 'Test Address, Test City',
        status: 'Active'
      });
      await testSupplier.save();
      console.log('Test supplier created');
      suppliers.push(testSupplier);
    }
    
    // Check if we have any supplier invoices
    const invoices = await SupplierInvoice.find({});
    console.log(`Found ${invoices.length} supplier invoices`);
    
    // Check if we have any supplier payments
    const payments = await SupplierPayment.find({});
    console.log(`Found ${payments.length} supplier payments`);
    
    // Check current supplier ledger entries
    const ledgerEntries = await SupplierLedger.find({});
    console.log(`Found ${ledgerEntries.length} supplier ledger entries`);
    
    // If we have invoices or payments but no ledger entries, create them
    if ((invoices.length > 0 || payments.length > 0) && ledgerEntries.length === 0) {
      console.log('Creating ledger entries from existing data...');
      
      // Process invoices
      for (const invoice of invoices) {
        const supplier = await Supplier.findById(invoice.supplier);
        if (!supplier) continue;
        
        // Get the last entry for this supplier to calculate running balance
        const lastEntry = await SupplierLedger.findOne(
          { supplier: supplier._id },
          {},
          { sort: { 'createdAt': -1 } }
        );
        
        let previousBalance = 0;
        if (lastEntry) {
          previousBalance = lastEntry.runningBalance;
        }
        
        const ledgerEntry = new SupplierLedger({
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
          runningBalance: previousBalance + invoice.totalAmount,
          description: `Invoice ${invoice.invoiceNumber}`,
          creditDays: invoice.creditDays || 0,
          dueDate: invoice.dueDate,
          createdBy: invoice.createdBy
        });
        
        await ledgerEntry.save();
        console.log(`Created ledger entry for invoice: ${invoice.invoiceNumber}`);
      }
      
      // Process approved payments
      const approvedPayments = await SupplierPayment.find({ status: "Approved" });
      for (const payment of approvedPayments) {
        const invoice = await SupplierInvoice.findById(payment.supplierInvoice);
        if (!invoice) continue;
        
        const supplier = await Supplier.findById(payment.supplier);
        if (!supplier) continue;
        
        // Get the last entry for this supplier to calculate running balance
        const lastEntry = await SupplierLedger.findOne(
          { supplier: supplier._id },
          {},
          { sort: { 'createdAt': -1 } }
        );
        
        let previousBalance = 0;
        if (lastEntry) {
          previousBalance = lastEntry.runningBalance;
        }
        
        const ledgerEntry = new SupplierLedger({
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
          runningBalance: previousBalance - payment.paymentAmount,
          description: `Payment ${payment.paymentNumber} for Invoice ${payment.invoiceNumber}`,
          remarks: payment.remarks,
          createdBy: payment.createdBy
        });
        
        await ledgerEntry.save();
        console.log(`Created ledger entry for payment: ${payment.paymentNumber}`);
      }
    }
    
    // Final count
    const finalLedgerEntries = await SupplierLedger.find({});
    console.log(`Total supplier ledger entries: ${finalLedgerEntries.length}`);
    
    // Show some sample entries
    if (finalLedgerEntries.length > 0) {
      console.log('\nSample ledger entries:');
      const sampleEntries = await SupplierLedger.find({})
        .populate('supplier', 'name code')
        .sort({ createdAt: -1 })
        .limit(5);
      
      sampleEntries.forEach(entry => {
        console.log(`- ${entry.transactionType}: ${entry.description} | Balance: ${entry.runningBalance}`);
      });
    }
    
  } catch (error) {
    console.error('Error testing supplier ledger:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
};

// Run the test
connectDB().then(() => {
  testSupplierLedger();
});
