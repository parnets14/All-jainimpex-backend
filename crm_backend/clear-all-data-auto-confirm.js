import mongoose from 'mongoose';
import dotenv from 'dotenv';

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
import Dealer from './models/Dealer.js';
import Supplier from './models/Supplier.js';

dotenv.config();

const clearAllTransactionalData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n' + '='.repeat(70));
    console.log('🗑️  DATABASE CLEANUP OPERATION (AUTO-CONFIRMED)');
    console.log('='.repeat(70));

    // Get current counts
    console.log('\nCurrent database counts:');
    const counts = {
      salesOrders: await SalesOrder.countDocuments(),
      dealerInvoices: await DealerInvoice.countDocuments(),
      dealerPayments: await DealerPayment.countDocuments(),
      dealerLedger: await DealerLedger.countDocuments(),
      purchaseOrders: await PurchaseOrder.countDocuments(),
      grns: await GRN.countDocuments(),
      stocks: await Stock.countDocuments(),
      stockAdjustments: await StockAdjustment.countDocuments(),
      supplierLedger: await SupplierLedger.countDocuments(),
      supplierPayments: await SupplierPayment.countDocuments()
    };

    console.log(`  - Sales Orders: ${counts.salesOrders}`);
    console.log(`  - Dealer Invoices: ${counts.dealerInvoices}`);
    console.log(`  - Dealer Payments: ${counts.dealerPayments}`);
    console.log(`  - Dealer Ledger Entries: ${counts.dealerLedger}`);
    console.log(`  - Purchase Orders: ${counts.purchaseOrders}`);
    console.log(`  - GRNs: ${counts.grns}`);
    console.log(`  - Stocks: ${counts.stocks}`);
    console.log(`  - Stock Adjustments: ${counts.stockAdjustments}`);
    console.log(`  - Supplier Ledger Entries: ${counts.supplierLedger}`);
    console.log(`  - Supplier Payments: ${counts.supplierPayments}`);

    const totalRecords = Object.values(counts).reduce((sum, count) => sum + count, 0);
    console.log(`\n  TOTAL RECORDS TO DELETE: ${totalRecords}`);

    console.log('\n' + '='.repeat(70));
    console.log('🗑️  Starting deletion process...');
    console.log('='.repeat(70));

    // Delete in order to maintain referential integrity
    const deletionSteps = [
      { name: 'Dealer Ledger', model: DealerLedger },
      { name: 'Dealer Payments', model: DealerPayment },
      { name: 'Dealer Invoices', model: DealerInvoice },
      { name: 'Sales Orders', model: SalesOrder },
      { name: 'Supplier Ledger', model: SupplierLedger },
      { name: 'Supplier Payments', model: SupplierPayment },
      { name: 'GRNs', model: GRN },
      { name: 'Purchase Orders', model: PurchaseOrder },
      { name: 'Stock Adjustments', model: StockAdjustment },
      { name: 'Stocks', model: Stock }
    ];

    const results = [];

    for (const step of deletionSteps) {
      try {
        console.log(`\n🗑️  Deleting ${step.name}...`);
        const result = await step.model.deleteMany({});
        console.log(`   ✅ Deleted ${result.deletedCount} ${step.name}`);
        results.push({ name: step.name, count: result.deletedCount, status: 'success' });
      } catch (error) {
        console.error(`   ❌ Error deleting ${step.name}:`, error.message);
        results.push({ name: step.name, count: 0, status: 'error', error: error.message });
      }
    }

    // Reset dealer balances and advance payments
    console.log('\n🔄 Resetting Dealer balances...');
    const dealerUpdateResult = await Dealer.updateMany(
      {},
      {
        $set: {
          outstandingBalance: 0,
          advanceBalance: 0,
          advancePayments: []
        }
      }
    );
    console.log(`   ✅ Reset ${dealerUpdateResult.modifiedCount} dealers`);

    // Reset supplier balances
    console.log('\n🔄 Resetting Supplier balances...');
    const supplierUpdateResult = await Supplier.updateMany(
      {},
      {
        $set: {
          outstandingBalance: 0
        }
      }
    );
    console.log(`   ✅ Reset ${supplierUpdateResult.modifiedCount} suppliers`);

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 DELETION SUMMARY');
    console.log('='.repeat(70));

    let totalDeleted = 0;
    results.forEach(result => {
      const status = result.status === 'success' ? '✅' : '❌';
      console.log(`${status} ${result.name}: ${result.count} records deleted`);
      if (result.status === 'success') {
        totalDeleted += result.count;
      }
    });

    console.log('\n' + '-'.repeat(70));
    console.log(`TOTAL RECORDS DELETED: ${totalDeleted}`);
    console.log('-'.repeat(70));

    console.log('\n✅ Database cleanup completed successfully!');
    console.log('\n📝 What was preserved:');
    console.log('  - Dealers (balances reset)');
    console.log('  - Suppliers (balances reset)');
    console.log('  - Products');
    console.log('  - Categories');
    console.log('  - Users');
    console.log('  - Warehouses');
    console.log('  - Other master data');

    console.log('\n💡 Next steps:');
    console.log('  1. Restart your backend server');
    console.log('  2. Verify the application works correctly');
    console.log('  3. Start creating new transactions');

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the script
clearAllTransactionalData();
