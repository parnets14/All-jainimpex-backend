import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerLedger from './models/DealerLedger.js';
import DealerInvoice from './models/DealerInvoice.js';

dotenv.config();

const debugLedgerData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get a sample ledger entry
    const sampleEntry = await DealerLedger.findOne({ invoiceNumber: { $exists: true } })
      .sort({ createdAt: -1 })
      .limit(1);

    console.log('\n📊 Sample Ledger Entry:');
    console.log('Invoice Number:', sampleEntry?.invoiceNumber);
    console.log('Sales Type:', sampleEntry?.salesType);
    console.log('Credit Days Applied:', sampleEntry?.creditDaysApplied);
    console.log('Credit Days (old):', sampleEntry?.creditDays);
    console.log('Entry Date:', sampleEntry?.entryDate);
    console.log('\nFull Entry:', JSON.stringify(sampleEntry, null, 2));

    // Check if the invoice has the data
    if (sampleEntry?.invoiceNumber) {
      const invoice = await DealerInvoice.findOne({ invoiceNumber: sampleEntry.invoiceNumber });
      console.log('\n📄 Related Invoice:');
      console.log('Invoice Number:', invoice?.invoiceNumber);
      console.log('Items:', invoice?.items?.length);
      if (invoice?.items?.length > 0) {
        console.log('First Item Sales Type:', invoice.items[0].salesType);
      }
    }

    // Count entries with and without salesType
    const totalEntries = await DealerLedger.countDocuments();
    const entriesWithSalesType = await DealerLedger.countDocuments({ salesType: { $exists: true, $ne: null } });
    const entriesWithCreditDaysApplied = await DealerLedger.countDocuments({ creditDaysApplied: { $exists: true, $ne: null } });

    console.log('\n📈 Statistics:');
    console.log('Total Ledger Entries:', totalEntries);
    console.log('Entries with Sales Type:', entriesWithSalesType);
    console.log('Entries with Credit Days Applied:', entriesWithCreditDaysApplied);
    console.log('Entries missing Sales Type:', totalEntries - entriesWithSalesType);

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

debugLedgerData();
