import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerLedger from './models/DealerLedger.js';

dotenv.config();

const verifyLedgerSalesType = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Get all ledger entries with invoices
    const ledgerEntries = await DealerLedger.find({
      invoiceNumber: { $exists: true, $ne: null }
    }).sort({ entryDate: -1 }).limit(10);

    console.log(`📊 Showing last 10 invoice ledger entries:\n`);
    console.log('═'.repeat(120));
    console.log(
      'Invoice Number'.padEnd(20) +
      'Sales Type'.padEnd(20) +
      'Credit Days Applied'.padEnd(25) +
      'Invoice Value'.padEnd(20) +
      'Entry Date'
    );
    console.log('═'.repeat(120));

    for (const entry of ledgerEntries) {
      console.log(
        (entry.invoiceNumber || 'N/A').padEnd(20) +
        (entry.salesType || 'NOT SET').padEnd(20) +
        (entry.creditDaysApplied !== undefined ? `${entry.creditDaysApplied} days` : 'NOT SET').padEnd(25) +
        `₹${(entry.debitAmount || 0).toLocaleString('en-IN')}`.padEnd(20) +
        new Date(entry.entryDate).toLocaleDateString('en-IN')
      );
    }

    console.log('═'.repeat(120));

    // Count entries with and without sales type
    const totalInvoices = await DealerLedger.countDocuments({
      invoiceNumber: { $exists: true, $ne: null }
    });

    const withSalesType = await DealerLedger.countDocuments({
      invoiceNumber: { $exists: true, $ne: null },
      salesType: { $exists: true, $ne: null }
    });

    const withCreditDays = await DealerLedger.countDocuments({
      invoiceNumber: { $exists: true, $ne: null },
      creditDaysApplied: { $exists: true, $ne: null, $gt: 0 }
    });

    console.log(`\n📈 Summary:`);
    console.log(`Total invoice entries: ${totalInvoices}`);
    console.log(`With Sales Type: ${withSalesType} (${((withSalesType/totalInvoices)*100).toFixed(1)}%)`);
    console.log(`With Credit Days Applied: ${withCreditDays} (${((withCreditDays/totalInvoices)*100).toFixed(1)}%)`);

    if (withSalesType < totalInvoices) {
      console.log(`\n⚠️  ${totalInvoices - withSalesType} entries still need sales type`);
      console.log(`💡 Run: node update-existing-ledger-entries.js to fix them`);
    } else {
      console.log(`\n✅ All invoice entries have sales type!`);
    }

    console.log(`\n📝 Note: New invoices created from now on will automatically have sales type and credit days.`);

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

verifyLedgerSalesType();
