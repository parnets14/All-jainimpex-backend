import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';
import { accountMasterSchema } from '../models/AccountMaster.js';

dotenv.config();

const getModels = (dbConnection) => {
  return {
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    SupplierInvoice: dbConnection.models.SupplierInvoice || dbConnection.model('SupplierInvoice', supplierInvoiceSchema),
    AccountMaster: dbConnection.models.AccountMaster || dbConnection.model('AccountMaster', accountMasterSchema)
  };
};

const main = async () => {
  try {
    const dbConnection = getCompanyConnection('shree-jain-impex');
    const { DealerInvoice, SupplierInvoice, AccountMaster } = getModels(dbConnection);
    
    console.log('\n' + '='.repeat(60));
    console.log('🔍 DEBUGGING SHREE JAIN IMPEX');
    console.log('='.repeat(60));
    
    // Check Dealer Invoice
    console.log('\n📋 Dealer Invoice INV-2026-0001:');
    const dealerInvoice = await DealerInvoice.findOne({ invoiceNumber: 'INV-2026-0001' }).lean();
    if (dealerInvoice) {
      console.log('  Total Amount:', dealerInvoice.totalAmount);
      console.log('  Subtotal:', dealerInvoice.subtotal);
      console.log('  GST Amount (gstAmount):', dealerInvoice.gstAmount);
      console.log('  Total GST (totalGst):', dealerInvoice.totalGst);
      console.log('  Status:', dealerInvoice.status);
      console.log('  Items:', dealerInvoice.items?.length || 0);
      
      if (dealerInvoice.items && dealerInvoice.items.length > 0) {
        console.log('\n  First Item:');
        const item = dealerInvoice.items[0];
        console.log('    Quantity:', item.quantity);
        console.log('    Unit Price:', item.unitPrice);
        console.log('    GST:', item.gst);
        console.log('    GST Amount:', item.gstAmount);
        console.log('    Total Price:', item.totalPrice);
      }
    } else {
      console.log('  ❌ Invoice not found');
    }
    
    // Check Supplier Invoice
    console.log('\n📋 Supplier Invoice SI-474643:');
    const supplierInvoice = await SupplierInvoice.findOne({ invoiceNumber: 'SI-474643' }).lean();
    if (supplierInvoice) {
      console.log('  Total Amount:', supplierInvoice.totalAmount);
      console.log('  Subtotal:', supplierInvoice.subtotal);
      console.log('  GST Amount (gstAmount):', supplierInvoice.gstAmount);
      console.log('  Total GST (totalGst):', supplierInvoice.totalGst);
      console.log('  Status:', supplierInvoice.status);
      console.log('  Items:', supplierInvoice.items?.length || 0);
    } else {
      console.log('  ❌ Invoice not found');
    }
    
    // Check System Accounts
    console.log('\n🏦 System Accounts:');
    const accounts = await AccountMaster.find({ isSystem: true }).lean();
    console.log(`  Found ${accounts.length} system accounts:`);
    accounts.forEach(acc => {
      console.log(`    - ${acc.accountName} (${acc.accountGroup})`);
    });
    
    // Check if required accounts exist
    console.log('\n✅ Required Accounts Check:');
    const requiredAccounts = [
      'Sundry Debtors',
      'Sundry Creditors',
      'Sales Account',
      'Purchase Account',
      'GST Payable',
      'GST Input Credit'
    ];
    
    for (const accountName of requiredAccounts) {
      const account = await AccountMaster.findOne({ accountName, isSystem: true });
      if (account) {
        console.log(`  ✅ ${accountName}: Found (${account.accountGroup})`);
      } else {
        console.log(`  ❌ ${accountName}: NOT FOUND`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

main();
