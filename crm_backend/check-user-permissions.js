import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

async function checkUserPermissions() {
  try {
    const mongoUri = process.env.MONGO_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.log('❌ MongoDB URI not found in environment variables');
      return;
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find the test user
    const user = await User.findOne({ email: 'admin@gmail.com' }).select('-password');
    
    if (!user) {
      console.log('❌ User not found: admin@gmail.com');
      return;
    }

    console.log('\n📋 User Details:');
    console.log('Name:', user.name);
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    console.log('Status:', user.status);
    
    console.log('\n🔑 Assigned Permissions:');
    if (user.permissions && user.permissions.length > 0) {
      user.permissions.forEach((perm, index) => {
        console.log(`  ${index + 1}. ${perm}`);
      });
      console.log(`\nTotal: ${user.permissions.length} permissions`);
    } else {
      console.log('  ⚠️  No permissions assigned!');
    }

    console.log('\n📍 Assigned Regions:');
    if (user.assignedRegions && user.assignedRegions.length > 0) {
      console.log(`  ${user.assignedRegions.length} regions assigned`);
    } else {
      console.log('  No regions assigned');
    }

    // Check specific permissions
    console.log('\n🔍 Checking Specific Permissions:');
    const permissionsToCheck = [
      'dashboard.view',
      'system.management',
      'users.manage',
      'user.management',
      'master.management',
      'product.master'
    ];

    permissionsToCheck.forEach(perm => {
      const has = user.permissions?.includes(perm);
      console.log(`  ${has ? '✅' : '❌'} ${perm}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkUserPermissions();
