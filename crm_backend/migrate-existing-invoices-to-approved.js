import mongoose from 'mongoose';
import DealerInvoice from './models/DealerInvoice.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Migration Script: Mark Existing Invoices as Approved
 * 
 * This script updates all existing invoices that have invoice numbers
 * to be marked as approved (isDraft: false, status: "Approved")
 * 
 * Run this ONCE after deploying the draft invoice workflow changes
 */

const migrateExistingInvoices = async () => {
  try {
    console.log('🔄 Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database');

    console.log('\n📊 Analyzing existing invoices...');
    
    // Find all invoices that have invoice numbers (existing invoices)
    const existingInvoices = await DealerInvoice.find({
      invoiceNumber: { $ne: null, $exists: true }
    });

    console.log(`Found ${existingInvoices.length} existing invoices with invoice numbers`);

    if (existingInvoices.length === 0) {
      console.log('✅ No invoices to migrate');
      process.exit(0);
    }

    // Count how many need updating
    const needsUpdate = existingInvoices.filter(inv => 
      inv.isDraft !== false || inv.status !== 'Approved'
    );

    console.log(`${needsUpdate.length} invoices need to be marked as approved`);

    if (needsUpdate.length === 0) {
      console.log('✅ All invoices already marked as approved');
      process.exit(0);
    }

    // Confirm before proceeding
    console.log('\n⚠️  This will update the following fields for existing invoices:');
    console.log('   - isDraft: false');
    console.log('   - status: "Approved" (if not already set)');
    console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to proceed...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\n🔄 Starting migration...');

    // Update all existing invoices
    const result = await DealerInvoice.updateMany(
      {
        invoiceNumber: { $ne: null, $exists: true }
      },
      {
        $set: {
          isDraft: false,
          status: 'Approved'
        }
      }
    );

    console.log(`\n✅ Migration complete!`);
    console.log(`   - Matched: ${result.matchedCount} invoices`);
    console.log(`   - Modified: ${result.modifiedCount} invoices`);

    // Verify the migration
    console.log('\n🔍 Verifying migration...');
    const verifyDrafts = await DealerInvoice.countDocuments({
      invoiceNumber: { $ne: null, $exists: true },
      isDraft: true
    });

    const verifyApproved = await DealerInvoice.countDocuments({
      invoiceNumber: { $ne: null, $exists: true },
      isDraft: false,
      status: 'Approved'
    });

    console.log(`   - Invoices with numbers still marked as draft: ${verifyDrafts}`);
    console.log(`   - Invoices with numbers marked as approved: ${verifyApproved}`);

    if (verifyDrafts === 0) {
      console.log('\n✅ Migration verified successfully!');
    } else {
      console.log('\n⚠️  Warning: Some invoices still marked as draft');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run the migration
migrateExistingInvoices();
