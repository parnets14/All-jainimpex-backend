/**
 * Create Test Data Directly in Database
 * 
 * This script creates test reschedule and failed delivery data
 * directly in MongoDB without needing authentication.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

// Import models
import DeliveryAssignment from './DeliveryExecutiveAppBackend/models/DeliveryAssignment.js';
import User from './models/User.js';
import Dealer from './models/Dealer.js';
import SalesOrder from './models/SalesOrder.js';

async function createTestData() {
  try {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║  Create Test Data (Direct DB)            ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    const mongoUrl = process.env.MONGO_URL || process.env.MONGO_URI;
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected!\n');

    // Find an assigned delivery to convert to pending_reschedule
    const assignedDelivery = await DeliveryAssignment.findOne({
      status: 'assigned'
    }).populate('deliveryExecutive dealer salesOrder');

    if (!assignedDelivery) {
      console.log('❌ No assigned deliveries found to create test data');
      console.log('💡 All deliveries are already processed');
      return;
    }

    console.log('📦 Found assigned delivery:');
    console.log('   Order:', assignedDelivery.salesOrder?.orderNumber);
    console.log('   Dealer:', assignedDelivery.dealer?.name);
    console.log('   Executive:', assignedDelivery.deliveryExecutive?.name);
    console.log('   Assignment ID:', assignedDelivery._id);
    console.log('');

    // Calculate tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    // Create reschedule request
    console.log('🔄 Creating reschedule request...');
    assignedDelivery.status = 'pending_reschedule';
    assignedDelivery.rescheduleRequest = {
      requestedDate: tomorrow,
      reason: 'Customer requested - Test data',
      requestedBy: assignedDelivery.deliveryExecutive,
      requestedAt: new Date(),
      status: 'pending'
    };

    await assignedDelivery.save();
    console.log('✅ Reschedule request created!');
    console.log('   Requested Date:', tomorrow.toISOString().split('T')[0]);
    console.log('   Status: pending_reschedule');
    console.log('');

    // Find an in_transit delivery to mark as failed
    const inTransitDelivery = await DeliveryAssignment.findOne({
      status: 'in_transit'
    }).populate('deliveryExecutive dealer salesOrder');

    if (inTransitDelivery) {
      console.log('📦 Found in_transit delivery:');
      console.log('   Order:', inTransitDelivery.salesOrder?.orderNumber);
      console.log('   Dealer:', inTransitDelivery.dealer?.name);
      console.log('   Executive:', inTransitDelivery.deliveryExecutive?.name);
      console.log('');

      console.log('❌ Marking as failed...');
      inTransitDelivery.status = 'failed';
      inTransitDelivery.failureReason = 'Address not found - Test data';
      inTransitDelivery.failedAt = new Date();

      await inTransitDelivery.save();
      console.log('✅ Delivery marked as failed!');
      console.log('   Failed At:', new Date().toISOString());
      console.log('');
    } else {
      console.log('⚠️  No in_transit deliveries found to mark as failed');
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TEST DATA CREATED SUCCESSFULLY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📋 Next Steps:');
    console.log('1. Go to web app: http://localhost:5173/de-app/monitoring');
    console.log('2. Refresh the page');
    console.log('3. You should see:');
    console.log('   - 1 pending reschedule request');
    if (inTransitDelivery) {
      console.log('   - 1 failed delivery');
    }
    console.log('');
    console.log('🎯 Test the features:');
    console.log('   - Approve/Reject reschedule request');
    console.log('   - Edit reschedule date');
    if (inTransitDelivery) {
      console.log('   - Reassign failed delivery');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB\n');
  }
}

createTestData();
