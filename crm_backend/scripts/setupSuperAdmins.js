import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { getCompanyConnection, COMPANY_DB_MAP } from '../config/multiDatabase.js';
import { userSchema } from '../models/User.js';

dotenv.config();

const SUPER_ADMINS = {
  'jain-impex': {
    email: 'superadmin@jainimpex.com',
    password: 'superadmin123',
    username: 'superadmin',
    name: 'Super Admin',
    phone: '9999999999',
    role: 'super_admin',
    status: 'Active',
    permissions: ['*'],
    location: 'Head Office'
  },
  'ridhi': {
    email: 'superadmin@ridhi.com',
    password: 'superadmin123',
    username: 'superadmin',
    name: 'Ridhi Super Admin',
    phone: '9999999998',
    role: 'super_admin',
    status: 'Active',
    permissions: ['*'],
    location: 'Head Office'
  },
  'shree-jain-impex': {
    email: 'superadmin@shreejainimpex.com',
    password: 'superadmin123',
    username: 'superadmin',
    name: 'Shree Jain Super Admin',
    phone: '9999999997',
    role: 'super_admin',
    status: 'Active',
    permissions: ['*'],
    location: 'Head Office'
  }
};

async function setupSuperAdmins() {
  console.log('🚀 Setting up superadmin accounts for all 3 companies...');

  for (const [companyId, dbName] of Object.entries(COMPANY_DB_MAP)) {
    console.log(`\n================== ${companyId} (${dbName}) ==================`);
    const conn = getCompanyConnection(companyId);
    await conn.asPromise();
    const User = conn.models.User || conn.model('User', userSchema);

    const target = SUPER_ADMINS[companyId];

    // Check if user with target.email exists
    let existingUserByEmail = await User.findOne({ email: target.email }).select('+password');
    let existingUserByUsername = await User.findOne({ username: target.username }).select('+password');

    if (existingUserByEmail) {
      console.log(`Found existing user by email: ${target.email}. Updating password, role, status...`);
      existingUserByEmail.name = target.name;
      existingUserByEmail.password = target.password; // pre-save will bcrypt hash
      existingUserByEmail.role = 'super_admin';
      existingUserByEmail.status = 'Active';
      existingUserByEmail.permissions = ['*'];
      await existingUserByEmail.save();
      console.log(`✅ Updated existing user ${target.email}`);
    } else if (existingUserByUsername) {
      console.log(`Found existing user by username "${target.username}" with email "${existingUserByUsername.email}".`);
      // Update this user to have target.email
      existingUserByUsername.email = target.email;
      existingUserByUsername.password = target.password;
      existingUserByUsername.role = 'super_admin';
      existingUserByUsername.status = 'Active';
      existingUserByUsername.permissions = ['*'];
      await existingUserByUsername.save();
      console.log(`✅ Updated user with username "${target.username}" to email "${target.email}"`);
    } else {
      console.log(`No user with email ${target.email} or username ${target.username}. Creating fresh user...`);
      const newUser = new User(target);
      await newUser.save();
      console.log(`✅ Created fresh super_admin user: ${target.email}`);
    }

    // Now, let's also ensure admin123@gmail.com can still work if it exists or if desired
    const admin123User = await User.findOne({ email: 'admin123@gmail.com' }).select('+password');
    if (admin123User) {
      console.log(`Found admin123@gmail.com in ${companyId}. Updating password to "superadmin123" for safety...`);
      admin123User.password = 'superadmin123';
      admin123User.status = 'Active';
      admin123User.role = 'super_admin';
      await admin123User.save();
      console.log(`✅ Updated admin123@gmail.com password to "superadmin123"`);
    }

    // Verify authentication directly
    const verifyUser = await User.findOne({ email: target.email }).select('+password');
    if (verifyUser) {
      const isMatch = await verifyUser.comparePassword(target.password);
      console.log(`🔍 Verification for ${target.email}:`);
      console.log(`   ID: ${verifyUser._id}`);
      console.log(`   Email: ${verifyUser.email}`);
      console.log(`   Username: ${verifyUser.username}`);
      console.log(`   Role: ${verifyUser.role}`);
      console.log(`   Status: ${verifyUser.status}`);
      console.log(`   Password Match: ${isMatch ? '✅ SUCCESS' : '❌ FAILED'}`);
    } else {
      console.error(`❌ Verification failed: User ${target.email} not found!`);
    }
  }

  console.log('\n🎉 All companies processed successfully!');
  process.exit(0);
}

setupSuperAdmins().catch((err) => {
  console.error('❌ Error setting up superadmins:', err);
  process.exit(1);
});
