// Test script to verify discount management permissions
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_inpex_crm';

async function testDiscountPermissions() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all users first
    const allUsers = await User.find({}).select('email name role');
    console.log('Available users:');
    allUsers.forEach(u => console.log(`- ${u.email} (${u.name}) - Role: ${u.role}`));
    console.log('');

    // Test with Nilesh (sub_admin)
    console.log('='.repeat(60));
    console.log('TEST 1: NILESH (sub_admin)');
    console.log('='.repeat(60));
    const nilesh = await User.findOne({ email: 'nilesh123@gmail.com' });
    if (nilesh) {
      await testPermissions(nilesh);
    }

    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: RAVI (admin)');
    console.log('='.repeat(60));
    const ravi = await User.findOne({ email: 'admin@gmail.com' });
    if (ravi) {
      await testPermissions(ravi);
    }

    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: SUPER ADMIN');
    console.log('='.repeat(60));
    const superAdmin = await User.findOne({ role: 'super_admin' });
    if (superAdmin) {
      await testPermissions(superAdmin);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

async function testPermissions(testUser) {

    console.log('📋 USER PERMISSIONS TEST');
    console.log('================================\n');
    
    console.log('User Details:');
    console.log(`- Email: ${testUser.email}`);
    console.log(`- Name: ${testUser.name}`);
    console.log(`- Role: ${testUser.role}`);
    console.log(`- Permissions: ${testUser.permissions?.length || 0} permissions\n`);

    // Check discount-related permissions
    const hasBaseAccess = testUser.permissions?.includes('dealer.specific.discounts');
    const canEdit = testUser.permissions?.includes('discounts.update');
    const canDelete = testUser.permissions?.includes('discounts.delete');
    const isSuperAdmin = testUser.role === 'super_admin' || testUser.role === 'Super Admin';

    console.log('Discount Management Permissions:');
    console.log(`- Base Access (dealer.specific.discounts): ${hasBaseAccess ? '✅ YES' : '❌ NO'}`);
    console.log(`- Edit Permission (discounts.update): ${canEdit ? '✅ YES' : '❌ NO'}`);
    console.log(`- Delete Permission (discounts.delete): ${canDelete ? '✅ YES' : '❌ NO'}`);
    console.log(`- Super Admin: ${isSuperAdmin ? '✅ YES' : '❌ NO'}\n`);

    console.log('Expected UI Behavior:');
    console.log('-------------------');
    
    if (isSuperAdmin) {
      console.log('✅ Can VIEW discount mappings');
      console.log('✅ Can CREATE discount mappings');
      console.log('✅ Can EDIT discount mappings (all statuses)');
      console.log('✅ Can DELETE discount mappings (all statuses)');
      console.log('✅ Can APPROVE/REJECT discount mappings');
    } else {
      if (hasBaseAccess) {
        console.log('✅ Can VIEW discount mappings');
        console.log('✅ Can CREATE discount mappings');
      } else {
        console.log('❌ Cannot VIEW discount mappings');
        console.log('❌ Cannot CREATE discount mappings');
      }

      if (canEdit && hasBaseAccess) {
        console.log('✅ Can EDIT discount mappings (non-approved only)');
      } else {
        console.log('❌ Cannot EDIT discount mappings (Edit button hidden)');
      }

      if (canDelete && hasBaseAccess) {
        console.log('✅ Can DELETE discount mappings (draft only)');
      } else {
        console.log('❌ Cannot DELETE discount mappings (Delete button hidden)');
      }
    }

    console.log('\n📝 All Permissions:');
    console.log('------------------');
    if (testUser.permissions && testUser.permissions.length > 0) {
      testUser.permissions.forEach((perm, index) => {
        console.log(`${index + 1}. ${perm}`);
      });
    } else {
      console.log('No permissions assigned');
    }
}

testDiscountPermissions();
