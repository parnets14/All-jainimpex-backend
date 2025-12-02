import mongoose from 'mongoose';
import DeliveryAssignment from '../DeliveryExecutiveAppBackend/models/DeliveryAssignment.js';
import DeliveryPayment from '../DeliveryExecutiveAppBackend/models/DeliveryPayment.js';

// Update this with your MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_inpex_crm';

async function updatePaymentCollectedField() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all payments
    const payments = await DeliveryPayment.find({}).select('deliveryAssignment collectedAt');
    console.log(`Found ${payments.length} payments`);

    let updated = 0;
    let alreadyMarked = 0;

    // Update each assignment that has a payment
    for (const payment of payments) {
      const assignment = await DeliveryAssignment.findById(payment.deliveryAssignment);
      
      if (assignment) {
        if (!assignment.paymentCollected) {
          assignment.paymentCollected = true;
          assignment.paymentCollectedAt = payment.collectedAt || new Date();
          await assignment.save();
          updated++;
          console.log(`✅ Updated assignment ${assignment._id}`);
        } else {
          alreadyMarked++;
        }
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   Total payments: ${payments.length}`);
    console.log(`   Assignments updated: ${updated}`);
    console.log(`   Already marked: ${alreadyMarked}`);
    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

updatePaymentCollectedField();
