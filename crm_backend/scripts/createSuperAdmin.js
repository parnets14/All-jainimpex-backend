import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import User from '../models/User.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const createSuperAdmin = async () => {
  try {
    console.log('Connecting to MongoDB...');
    console.log('MongoDB URL:', process.env.MONGO_URL ? '***' : 'NOT FOUND');
    
    if (!process.env.MONGO_URL) {
      throw new Error('MONGO_URL is not defined in environment variables');
    }

    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    
    if (existingSuperAdmin) {
      console.log('ℹ️  Super admin already exists:', existingSuperAdmin.email);
      process.exit(0);
    }

    // Create super admin
    const superAdmin = await User.create({
      name: 'Super Admin',
      username: 'superadmin',
      email: 'superadmin@jainimpex.com',
      password: 'superadmin123',
      phone: '+91 9876543210',
      role: 'super_admin',
      status: 'Active',
      permissions: ['*'],
      location: 'Head Office'
    });

    console.log('✅ Super admin created successfully:');
    console.log('   Email:', superAdmin.email);
    console.log('   Password: superadmin123');
    console.log('   Role: Super Admin');
    console.log('\n⚠️  Please change the password after first login!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating super admin:', error.message);
    process.exit(1);
  }
};

createSuperAdmin();