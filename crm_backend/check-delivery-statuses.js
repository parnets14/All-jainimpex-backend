/**
 * Check Delivery Assignment Statuses
 * 
 * This script checks what delivery statuses exist in the database
 * to help debug why the monitoring page shows no data.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

// Import the models
import DeliveryAssignment from './DeliveryExecutiveAppBackend/models/DeliveryAssignment.js';
import User from './models/User.js';
import Dealer from './models/Dealer.js';
import SalesOrder from './models/SalesOrder.js';

async function checkStatuses() {
  try {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║  Delivery Assignment Status Check        ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    const mongoUrl = process.env.MONGO_URL || process.env.MONGO_URI;
    if (!mongoUrl) {
      throw new Error('MONGO_URL or MONGO_URI not found in environment variables');
    }
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected!\n');

    // Get all unique statuses
    console.log('📊 Checking all statuses in database...\n');
    const statuses = await DeliveryAssignment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Status Distribution:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    statuses.forEach(s => {
      const icon = s._id === 'pending_reschedule' ? '🔄' : 
                   s._id === 'failed' ? '❌' : 
                   s._id === 'delivered' ? '✅' : 
                   s._id === 'in_transit' ? '🚚' : 
                   s._id === 'assigned' ? '📋' : '📦';
      console.log(`${icon} ${s._id}: ${s.count}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Check for pending reschedules
    const pendingReschedules = await DeliveryAssignment.find({
      status: 'pending_reschedule',
      'rescheduleRequest.status': 'pending'
    })
      .populate('deliveryExecutive', 'name')
      .populate('dealer', 'name')
      .populate('salesOrder', 'orderNumber')
      .limit(5);

    console.log('🔄 Pending Reschedule Requests:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (pendingReschedules.length === 0) {
      console.log('❌ No pending reschedule requests found');
      console.log('💡 Create one using the mobile app or create-test-reschedule.js');
    } else {
      pendingReschedules.forEach((a, i) => {
        console.log(`\n${i + 1}. Order: ${a.salesOrder?.orderNumber}`);
        console.log(`   Dealer: ${a.dealer?.name}`);
        console.log(`   Executive: ${a.deliveryExecutive?.name}`);
        console.log(`   Requested Date: ${a.rescheduleRequest?.requestedDate}`);
        console.log(`   Reason: ${a.rescheduleRequest?.reason}`);
      });
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Check for failed deliveries
    const failedDeliveries = await DeliveryAssignment.find({
      status: 'failed'
    })
      .populate('deliveryExecutive', 'name')
      .populate('dealer', 'name')
      .populate('salesOrder', 'orderNumber')
      .limit(5);

    console.log('❌ Failed Deliveries:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (failedDeliveries.length === 0) {
      console.log('❌ No failed deliveries found');
      console.log('💡 Create one using the mobile app or create-test-failed.js');
    } else {
      failedDeliveries.forEach((a, i) => {
        console.log(`\n${i + 1}. Order: ${a.salesOrder?.orderNumber}`);
        console.log(`   Dealer: ${a.dealer?.name}`);
        console.log(`   Executive: ${a.deliveryExecutive?.name}`);
        console.log(`   Failed At: ${a.failedAt}`);
        console.log(`   Reason: ${a.failureReason}`);
      });
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Check for assigned deliveries (can be used for testing)
    const assignedCount = await DeliveryAssignment.countDocuments({
      status: 'assigned'
    });

    console.log('📋 Available for Testing:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ ${assignedCount} deliveries with status "assigned"`);
    console.log('💡 You can use these to create test reschedule/failed requests');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Show sample assigned deliveries
    if (assignedCount > 0) {
      const sampleAssigned = await DeliveryAssignment.find({
        status: 'assigned'
      })
        .populate('deliveryExecutive', 'name')
        .populate('dealer', 'name')
        .populate('salesOrder', 'orderNumber')
        .limit(3);

      console.log('📦 Sample Assigned Deliveries (use these for testing):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      sampleAssigned.forEach((a, i) => {
        console.log(`\n${i + 1}. Assignment ID: ${a._id}`);
        console.log(`   Order: ${a.salesOrder?.orderNumber}`);
        console.log(`   Dealer: ${a.dealer?.name}`);
        console.log(`   Executive: ${a.deliveryExecutive?.name}`);
      });
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    console.log('💡 Next Steps:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1. Use mobile app to create reschedule/failed requests');
    console.log('2. OR use create-test-reschedule.js with an assignment ID above');
    console.log('3. OR use create-test-failed.js with an assignment ID above');
    console.log('4. Refresh web app to see the data');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB\n');
  }
}

checkStatuses();
