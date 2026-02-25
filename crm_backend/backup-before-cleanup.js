import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Import all models
import SalesOrder from './models/SalesOrder.js';
import DealerInvoice from './models/DealerInvoice.js';
import DealerPayment from './models/DealerPayment.js';
import DealerLedger from './models/DealerLedger.js';
import PurchaseOrder from './models/PurchaseOrder.js';
import GRN from './models/GRN.js';
import Stock from './models/Stock.js';
import StockAdjustment from './models/StockAdjustment.js';
import SupplierLedger from './models/SupplierLedger.js';
import SupplierPayment from './models/SupplierPayment.js';

dotenv.config();

const backupTransactionalData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Create backup directory with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupDir = path.join(process.cwd(), 'backups', `backup-${timestamp}`);
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log(`\n📦 Creating backup in: ${backupDir}`);
    console.log('='.repeat(70));

    const collections = [
      { name: 'sales-orders', model: SalesOrder },
      { name: 'dealer-invoices', model: DealerInvoice },
      { name: 'dealer-payments', model: DealerPayment },
      { name: 'dealer-ledger', model: DealerLedger },
      { name: 'purchase-orders', model: PurchaseOrder },
      { name: 'grns', model: GRN },
      { name: 'stocks', model: Stock },
      { name: 'stock-adjustments', model: StockAdjustment },
      { name: 'supplier-ledger', model: SupplierLedger },
      { name: 'supplier-payments', model: SupplierPayment }
    ];

    let totalRecords = 0;

    for (const collection of collections) {
      try {
        console.log(`\n📄 Backing up ${collection.name}...`);
        const data = await collection.model.find({}).lean();
        const filePath = path.join(backupDir, `${collection.name}.json`);
        
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`   ✅ Backed up ${data.length} records to ${collection.name}.json`);
        totalRecords += data.length;
      } catch (error) {
        console.error(`   ❌ Error backing up ${collection.name}:`, error.message);
      }
    }

    // Create backup metadata
    const metadata = {
      timestamp: new Date().toISOString(),
      totalRecords,
      collections: collections.map(c => c.name),
      note: 'Backup created before cleanup operation'
    };

    fs.writeFileSync(
      path.join(backupDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    console.log('\n' + '='.repeat(70));
    console.log('✅ Backup completed successfully!');
    console.log(`📊 Total records backed up: ${totalRecords}`);
    console.log(`📁 Backup location: ${backupDir}`);
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Error during backup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the script
backupTransactionalData();
