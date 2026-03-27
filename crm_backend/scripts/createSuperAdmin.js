import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';

dotenv.config();

async function createSuperAdmin() {
  await connectDB();

  const existing = await User.findOne({ email: 'superadmin@jainimpex.com' });
  if (existing) {
    console.log('⚠️  Super admin already exists.');
    process.exit(0);
  }

  const superAdmin = new User({
    name: 'Super Admin',
    username: 'superadmin',
    email: 'superadmin@jainimpex.com',
    password: 'superadmin123',
    phone: '0000000000',
    role: 'super_admin',
    status: 'Active',
  });

  await superAdmin.save();
  console.log('✅ Super admin created successfully.');
  console.log('   Email   : superadmin@jainimpex.com');
  console.log('   Password: superadmin123');
  process.exit(0);
}

createSuperAdmin().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
