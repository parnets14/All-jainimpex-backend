/**
 * Check Reschedule Request Details
 * 
 * This script checks the exact structure of the reschedule request
 * to debug why it's not showing in the web app.
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

async function checkDetails() {
  try {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║  Check Reschedule Request Details        ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    // Connect to MongoDB
    const mongoUrl = process.env.MONGO_URL || process.env.MONGO_URI;
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected to MongoDB\n');

    // Find pending_reschedule deliveries
    const pendingReschedules = await DeliveryAssignment.find({
      status: 'pending_reschedule'
    });

    console.log(`📊 Found ${pendingReschedules.length} delivery(ies) with status 'pending_reschedule'\n`);

    if (pendingReschedules.length === 0) {
      console.log('❌ No pending_reschedule deliveries found!');
      console.log('💡 Run: node create-test-data-direct.js');
      return;
    }

    pendingReschedules.forEach((assignment, index) => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Delivery ${index + 1}:`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log('Assignment ID:', assignment._id);
      console.log('Status:', assignment.status);
      console.log('\nReschedule Request Object:');
      console.log(JSON.stringify(assignment.rescheduleRequest, null, 2));
      console.log('');

      // Check what the controller is looking for
      const hasStatus = assignment.status === 'pending_reschedule';
      const hasRequestStatus = assignment.rescheduleRequest?.status === 'pending';

      console.log('✅ Checks:');
      console.log(`   status === 'pending_reschedule': ${hasStatus ? '✅' : '❌'}`);
      console.log(`   rescheduleRequest.status === 'pending': ${hasRequestStatus ? '✅' : '❌'}`);
      
      if (!hasRequestStatus) {
        console.log('\n⚠️  ISSUE FOUND!');
        console.log(`   rescheduleRequest.status is: "${assignment.rescheduleRequest?.status}"`);
        console.log('   Expected: "pending"');
      }
      console.log('');
    });

    // Now test the exact query the controller uses
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Testing Controller Query:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const controllerQuery = await DeliveryAssignment.find({
      status: 'pending_reschedule',
      'rescheduleRequest.status': 'pending'
    });

    console.log(`\n📊 Controller query returned: ${controllerQuery.length} result(s)`);
    
    if (controllerQuery.length === 0) {
      console.log('\n❌ PROBLEM: Controller query returns 0 results!');
      console.log('💡 This is why the web app shows no data.');
      console.log('\n🔧 Fix: Update the rescheduleRequest.status field');
    } else {
      console.log('\n✅ Controller query works correctly!');
      console.log('💡 Data should appear in web app.');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB\n');
  }
}

checkDetails();
