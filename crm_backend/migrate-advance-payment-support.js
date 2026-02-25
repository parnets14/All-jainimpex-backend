import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';
import DealerPayment from './models/DealerPayment.js';

// Load environment variables
dotenv.config();

const migrateAdvanceSupport = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n📋 Starting migration for advance payment support...\n');

    // Step 1: Add advance balance to all dealers
    console.log('Step 1: Adding advance balance fields to dealers...');
    const dealerUpdateResult = await Dealer.updateMany(
      { 
        $or: [
          { advanceBalance: { $exists: false } },
          { advancePayments: { $exists: false } }
        ]
      },
      { 
        $set: { 
          advanceBalance: 0,
          advancePayments: []
        }
      }
    );
    console.log(`✅ Updated ${dealerUpdateResult.modifiedCount} dealers with advance balance fields`);

    // Step 2: Update existing payments to have payment category and advance details
    console.log('\nStep 2: Adding payment category and advance details to existing payments...');
    const paymentUpdateResult = await DealerPayment.updateMany(
      { 
        $or: [
          { paymentCategory: { $exists: false } },
          { advanceDetails: { $exists: false } }
        ]
      },
      {
        $set: {
          paymentCategory: "Invoice Payment",
          advanceDetails: {
            isAdvance: false,
            advanceAmount: 0,
            adjustedAmount: 0,
            remainingAdvance: 0,
            adjustedAgainstInvoices: []
          }
        }
      }
    );
    console.log(`✅ Updated ${paymentUpdateResult.modifiedCount} payments with payment category and advance details`);

    // Step 3: Verify the migration
    console.log('\n📊 Verification:');
    const totalDealers = await Dealer.countDocuments();
    const dealersWithAdvance = await Dealer.countDocuments({ 
      advanceBalance: { $exists: true },
      advancePayments: { $exists: true }
    });
    console.log(`   - Total dealers: ${totalDealers}`);
    console.log(`   - Dealers with advance fields: ${dealersWithAdvance}`);

    const totalPayments = await DealerPayment.countDocuments();
    const paymentsWithCategory = await DealerPayment.countDocuments({ 
      paymentCategory: { $exists: true },
      advanceDetails: { $exists: true }
    });
    console.log(`   - Total payments: ${totalPayments}`);
    console.log(`   - Payments with category and advance details: ${paymentsWithCategory}`);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log('   - All dealers now have advanceBalance and advancePayments fields');
    console.log('   - All existing payments are categorized as "Invoice Payment"');
    console.log('   - System is ready for advance payment functionality');

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run migration
migrateAdvanceSupport()
  .then(() => {
    console.log('\n🎉 Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  });
