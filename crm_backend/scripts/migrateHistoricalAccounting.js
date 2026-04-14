/**
 * Migration Script: Generate Journal Entries for Historical Data
 * 
 * This script creates automatic journal entries for all existing approved
 * invoices and payments that don't have journal entries yet.
 * 
 * Run: node scripts/migrateHistoricalAccounting.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { 
  createDealerInvoiceEntry, 
  createSupplierInvoiceEntry,
  createDealerPaymentEntry,
  createSupplierPaymentEntry 
} from '../services/accountingService.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';
import { dealerPaymentSchema } from '../models/DealerPayment.js';
import { supplierPaymentSchema } from '../models/SupplierPayment.js';
import { journalVoucherSchema } from '../models/JournalVoucher.js';

dotenv.config();

const COMPANIES = [
  { id: 'jain-impex', name: 'JainImpexCRM' },
  { id: 'ridhi', name: 'ridhi_crm' },
  { id: 'shree-jain-impex', name: 'shreejain_crm' }
];

// System user ID for migration (will use first super admin found)
let SYSTEM_USER_ID = null;

const getModels = (dbConnection) => {
  return {
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    SupplierInvoice: dbConnection.models.SupplierInvoice || dbConnection.model('SupplierInvoice', supplierInvoiceSchema),
    DealerPayment: dbConnection.models.DealerPayment || dbConnection.model('DealerPayment', dealerPaymentSchema),
    SupplierPayment: dbConnection.models.SupplierPayment || dbConnection.model('SupplierPayment', supplierPaymentSchema),
    JournalVoucher: dbConnection.models.JournalVoucher || dbConnection.model('JournalVoucher', journalVoucherSchema)
  };
};

const findSystemUser = async (dbConnection) => {
  try {
    const User = dbConnection.models.User || dbConnection.model('User', (await import('../models/User.js')).userSchema);
    // Try both role formats: 'super_admin' and 'Super Admin'
    let superAdmin = await User.findOne({ role: 'super_admin' });
    if (!superAdmin) {
      superAdmin = await User.findOne({ role: 'Super Admin' });
    }
    return superAdmin ? superAdmin._id : null;
  } catch (error) {
    console.error('Error finding system user:', error);
    return null;
  }
};

const migrateDealerInvoices = async (companyId, companyName, dbConnection) => {
  console.log(`\n📋 Migrating Dealer Invoices for ${companyName}...`);
  
  const { DealerInvoice, JournalVoucher } = getModels(dbConnection);
  
  try {
    // Find all approved invoices
    const approvedInvoices = await DealerInvoice.find({
      status: 'Approved',
      isDraft: false,
      isDeleted: { $ne: true }
    }).lean();
    
    console.log(`   Found ${approvedInvoices.length} approved dealer invoices`);
    
    let created = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const invoice of approvedInvoices) {
      try {
        // Check if journal entry already exists
        const existingEntry = await JournalVoucher.findOne({
          referenceType: 'DealerInvoice',
          referenceId: invoice._id
        });
        
        if (existingEntry) {
          skipped++;
          continue;
        }
        
        // Create journal entry
        const entry = await createDealerInvoiceEntry(invoice, dbConnection, SYSTEM_USER_ID);
        
        if (entry) {
          created++;
          console.log(`   ✅ Created entry for invoice ${invoice.invoiceNumber}`);
        } else {
          failed++;
          console.log(`   ⚠️ Failed to create entry for invoice ${invoice.invoiceNumber}`);
        }
      } catch (error) {
        failed++;
        console.error(`   ❌ Error processing invoice ${invoice.invoiceNumber}:`, error.message);
      }
    }
    
    console.log(`   📊 Summary: ${created} created, ${skipped} skipped, ${failed} failed`);
    return { created, skipped, failed };
    
  } catch (error) {
    console.error(`   ❌ Error migrating dealer invoices:`, error);
    return { created: 0, skipped: 0, failed: 0 };
  }
};

const migrateSupplierInvoices = async (companyId, companyName, dbConnection) => {
  console.log(`\n📋 Migrating Supplier Invoices for ${companyName}...`);
  
  const { SupplierInvoice, JournalVoucher } = getModels(dbConnection);
  
  try {
    // Find all approved invoices
    const approvedInvoices = await SupplierInvoice.find({
      status: 'Approved'
    }).lean();
    
    console.log(`   Found ${approvedInvoices.length} approved supplier invoices`);
    
    let created = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const invoice of approvedInvoices) {
      try {
        // Check if journal entry already exists
        const existingEntry = await JournalVoucher.findOne({
          referenceType: 'SupplierInvoice',
          referenceId: invoice._id
        });
        
        if (existingEntry) {
          skipped++;
          continue;
        }
        
        // Create journal entry
        const entry = await createSupplierInvoiceEntry(invoice, dbConnection, SYSTEM_USER_ID);
        
        if (entry) {
          created++;
          console.log(`   ✅ Created entry for invoice ${invoice.invoiceNumber}`);
        } else {
          failed++;
          console.log(`   ⚠️ Failed to create entry for invoice ${invoice.invoiceNumber}`);
        }
      } catch (error) {
        failed++;
        console.error(`   ❌ Error processing invoice ${invoice.invoiceNumber}:`, error.message);
      }
    }
    
    console.log(`   📊 Summary: ${created} created, ${skipped} skipped, ${failed} failed`);
    return { created, skipped, failed };
    
  } catch (error) {
    console.error(`   ❌ Error migrating supplier invoices:`, error);
    return { created: 0, skipped: 0, failed: 0 };
  }
};

const migrateDealerPayments = async (companyId, companyName, dbConnection) => {
  console.log(`\n💰 Migrating Dealer Payments for ${companyName}...`);
  
  const { DealerPayment, JournalVoucher } = getModels(dbConnection);
  
  try {
    // Find all approved payments
    const approvedPayments = await DealerPayment.find({
      status: 'Approved'
    }).lean();
    
    console.log(`   Found ${approvedPayments.length} approved dealer payments`);
    
    let created = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const payment of approvedPayments) {
      try {
        // Check if journal entry already exists
        const existingEntry = await JournalVoucher.findOne({
          referenceType: 'DealerPayment',
          referenceId: payment._id
        });
        
        if (existingEntry) {
          skipped++;
          continue;
        }
        
        // Create payment data for journal entry
        const paymentData = {
          _id: payment._id,
          paymentNumber: payment.paymentNumber || `PAY-${payment._id.toString().slice(-8)}`,
          amount: payment.paymentAmount,
          paymentDate: payment.paymentDate,
          paymentMode: payment.paymentMethod,
          dealerName: payment.dealerName || 'Dealer'
        };
        
        // Create journal entry
        const entry = await createDealerPaymentEntry(paymentData, dbConnection, SYSTEM_USER_ID);
        
        if (entry) {
          created++;
          console.log(`   ✅ Created entry for payment ${paymentData.paymentNumber}`);
        } else {
          failed++;
          console.log(`   ⚠️ Failed to create entry for payment ${paymentData.paymentNumber}`);
        }
      } catch (error) {
        failed++;
        console.error(`   ❌ Error processing payment ${payment.paymentNumber}:`, error.message);
      }
    }
    
    console.log(`   📊 Summary: ${created} created, ${skipped} skipped, ${failed} failed`);
    return { created, skipped, failed };
    
  } catch (error) {
    console.error(`   ❌ Error migrating dealer payments:`, error);
    return { created: 0, skipped: 0, failed: 0 };
  }
};

const migrateSupplierPayments = async (companyId, companyName, dbConnection) => {
  console.log(`\n💰 Migrating Supplier Payments for ${companyName}...`);
  
  const { SupplierPayment, JournalVoucher } = getModels(dbConnection);
  
  try {
    // Find all approved payments
    const approvedPayments = await SupplierPayment.find({
      status: 'Approved'
    }).lean();
    
    console.log(`   Found ${approvedPayments.length} approved supplier payments`);
    
    let created = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const payment of approvedPayments) {
      try {
        // Check if journal entry already exists
        const existingEntry = await JournalVoucher.findOne({
          referenceType: 'SupplierPayment',
          referenceId: payment._id
        });
        
        if (existingEntry) {
          skipped++;
          continue;
        }
        
        // Create payment data for journal entry
        const paymentData = {
          _id: payment._id,
          paymentNumber: payment.paymentNumber || `SPAY-${payment._id.toString().slice(-8)}`,
          amount: payment.paymentAmount,
          paymentDate: payment.paymentDate,
          paymentMode: payment.paymentMethod,
          supplierName: payment.supplierName || 'Supplier'
        };
        
        // Create journal entry
        const entry = await createSupplierPaymentEntry(paymentData, dbConnection, SYSTEM_USER_ID);
        
        if (entry) {
          created++;
          console.log(`   ✅ Created entry for payment ${paymentData.paymentNumber}`);
        } else {
          failed++;
          console.log(`   ⚠️ Failed to create entry for payment ${paymentData.paymentNumber}`);
        }
      } catch (error) {
        failed++;
        console.error(`   ❌ Error processing payment ${payment.paymentNumber}:`, error.message);
      }
    }
    
    console.log(`   📊 Summary: ${created} created, ${skipped} skipped, ${failed} failed`);
    return { created, skipped, failed };
    
  } catch (error) {
    console.error(`   ❌ Error migrating supplier payments:`, error);
    return { created: 0, skipped: 0, failed: 0 };
  }
};

const migrateCompany = async (companyId, companyName) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏢 Processing Company: ${companyName}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    const dbConnection = getCompanyConnection(companyId);
    
    // Find system user for this company
    SYSTEM_USER_ID = await findSystemUser(dbConnection);
    if (!SYSTEM_USER_ID) {
      console.log(`   ⚠️ No super admin found for ${companyName}, skipping...`);
      return {
        dealerInvoices: { created: 0, skipped: 0, failed: 0 },
        supplierInvoices: { created: 0, skipped: 0, failed: 0 },
        dealerPayments: { created: 0, skipped: 0, failed: 0 },
        supplierPayments: { created: 0, skipped: 0, failed: 0 }
      };
    }
    
    console.log(`   ✅ Using system user: ${SYSTEM_USER_ID}`);
    
    // Migrate all transaction types
    const dealerInvoices = await migrateDealerInvoices(companyId, companyName, dbConnection);
    const supplierInvoices = await migrateSupplierInvoices(companyId, companyName, dbConnection);
    const dealerPayments = await migrateDealerPayments(companyId, companyName, dbConnection);
    const supplierPayments = await migrateSupplierPayments(companyId, companyName, dbConnection);
    
    return {
      dealerInvoices,
      supplierInvoices,
      dealerPayments,
      supplierPayments
    };
    
  } catch (error) {
    console.error(`   ❌ Error processing company ${companyName}:`, error);
    return {
      dealerInvoices: { created: 0, skipped: 0, failed: 0 },
      supplierInvoices: { created: 0, skipped: 0, failed: 0 },
      dealerPayments: { created: 0, skipped: 0, failed: 0 },
      supplierPayments: { created: 0, skipped: 0, failed: 0 }
    };
  }
};

const main = async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 HISTORICAL ACCOUNTING MIGRATION');
  console.log('='.repeat(60));
  console.log('\nThis script will create journal entries for all existing');
  console.log('approved invoices and payments across all companies.\n');
  
  const startTime = Date.now();
  const results = {};
  
  try {
    // Process each company
    for (const company of COMPANIES) {
      results[company.id] = await migrateCompany(company.id, company.name);
    }
    
    // Print final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    
    for (const company of COMPANIES) {
      const result = results[company.id];
      const companyCreated = 
        result.dealerInvoices.created + 
        result.supplierInvoices.created + 
        result.dealerPayments.created + 
        result.supplierPayments.created;
      
      const companySkipped = 
        result.dealerInvoices.skipped + 
        result.supplierInvoices.skipped + 
        result.dealerPayments.skipped + 
        result.supplierPayments.skipped;
      
      const companyFailed = 
        result.dealerInvoices.failed + 
        result.supplierInvoices.failed + 
        result.dealerPayments.failed + 
        result.supplierPayments.failed;
      
      console.log(`\n🏢 ${company.name}:`);
      console.log(`   Dealer Invoices:   ${result.dealerInvoices.created} created, ${result.dealerInvoices.skipped} skipped, ${result.dealerInvoices.failed} failed`);
      console.log(`   Supplier Invoices: ${result.supplierInvoices.created} created, ${result.supplierInvoices.skipped} skipped, ${result.supplierInvoices.failed} failed`);
      console.log(`   Dealer Payments:   ${result.dealerPayments.created} created, ${result.dealerPayments.skipped} skipped, ${result.dealerPayments.failed} failed`);
      console.log(`   Supplier Payments: ${result.supplierPayments.created} created, ${result.supplierPayments.skipped} skipped, ${result.supplierPayments.failed} failed`);
      console.log(`   Total: ${companyCreated} created, ${companySkipped} skipped, ${companyFailed} failed`);
      
      totalCreated += companyCreated;
      totalSkipped += companySkipped;
      totalFailed += companyFailed;
    }
    
    console.log('\n' + '-'.repeat(60));
    console.log(`📈 GRAND TOTAL:`);
    console.log(`   ✅ Created: ${totalCreated}`);
    console.log(`   ⏭️  Skipped: ${totalSkipped}`);
    console.log(`   ❌ Failed:  ${totalFailed}`);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️  Duration: ${duration} seconds`);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION COMPLETE!');
    console.log('='.repeat(60));
    console.log('\nYou can now view the journal entries in:');
    console.log('Finance & Accounts → Voucher Entry → Journal Voucher tab\n');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
};

// Run migration
main();
