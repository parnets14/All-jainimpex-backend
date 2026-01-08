import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const checkUserRole = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all users and show their roles
    const users = await User.find({}).select('name email role');
    
    console.log('\n📋 All Users and Their Roles:');
    console.log('================================');
    users.forEach(user => {
      console.log(`Name: ${user.name}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: "${user.role}"`);
      console.log(`Role (lowercase): "${user.role?.toLowerCase()}"`);
      console.log(`Role (normalized): "${user.role?.toLowerCase().replace(/\s+/g, '_')}"`);
      console.log('---');
    });

    // Check specifically for super admin
    const superAdmins = users.filter(u => {
      const normalized = u.role?.toLowerCase().replace(/\s+/g, '_');
      return normalized === 'super_admin';
    });

    console.log(`\n🔑 Found ${superAdmins.length} Super Admin(s):`);
    superAdmins.forEach(admin => {
      console.log(`  - ${admin.name} (${admin.email})`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkUserRole();
