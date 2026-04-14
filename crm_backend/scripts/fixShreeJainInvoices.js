import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';

dotenv.config();

const getModels = (dbConnection) => {
  return {
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    SupplierInvoice: dbConnection.models.SupplierInvoice || dbConnection.model('SupplierInvoice', supplierInvoiceSchema)
  };
};

const main = async () => {
  try {
    const dbConnection = getCompanyConnection('shree-jain-impex');
    const { DealerInvoice, SupplierInvoice } = getModels(dbConnection);
    
    console.log('\n' + '='.repeat(60));
    console.log('🔧 FIXING SHREE JAIN IMPEX INVOICES');
    console.log('='.repeat(60));
    
    // Fix Dealer Invoice
    console.log('\n📋 Fixing Dealer Invoice INV-2026-0001...');
    const dealerInvoice = await DealerInvoice.findOne({ invoiceNumber: 'INV-2026-0001' });
    if (dealerInvoice) {
      console.log('  Current Values:');
      console.log('    Subtotal:', dealerInvoice.subtotal);
      console.log('    Total GST:', dealerInvoice.totalGst);
      console.log('    Total Amount:', dealerInvoice.totalAmount);
      
      // Recalculate correct total
      const correctTotal = dealerInvoice.subtotal + (dealerInvoice.totalGst || 0);
      console.log('\n  Correct Total Should Be:', correctTotal);
      
      if (Math.abs(dealerInvoice.totalAmount - correctTotal) > 0.01) {
        dealerInvoice.totalAmount = correctTotal;
        await dealerInvoice.save();
        console.log('  ✅ Fixed! New Total Amount:', dealerInvoice.totalAmount);
      } else {
        console.log('  ✅ Already correct');
      }
    } else {
      console.log('  ❌ Invoice not found');
    }
    
    // Fix Supplier Invoice
    console.log('\n📋 Fixing Supplier Invoice SI-474643...');
    const supplierInvoice = await SupplierInvoice.findOne({ invoiceNumber: 'SI-474643' });
    if (supplierInvoice) {
      console.log('  Current Values:');
      console.log('    Subtotal:', supplierInvoice.subtotal);
      console.log('    Total GST:', supplierInvoice.totalGst);
      console.log('    Total Amount:', supplierInvoice.totalAmount);
      
      // Recalculate correct total
      const correctTotal = supplierInvoice.subtotal + (supplierInvoice.totalGst || 0);
      console.log('\n  Correct Total Should Be:', correctTotal);
      
      if (Math.abs(supplierInvoice.totalAmount - correctTotal) > 0.01) {
        supplierInvoice.totalAmount = correctTotal;
        await supplierInvoice.save();
        console.log('  ✅ Fixed! New Total Amount:', supplierInvoice.totalAmount);
      } else {
        console.log('  ✅ Already correct');
      }
    } else {
      console.log('  ❌ Invoice not found');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ FIXES COMPLETE!');
    console.log('='.repeat(60));
    console.log('\nYou can now run the migration script again:');
    console.log('node scripts/migrateHistoricalAccounting.js\n');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

main();
