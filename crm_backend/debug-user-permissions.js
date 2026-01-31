import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

async function debugUserPermissions() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 CHECKING USER PERMISSIONS');
    console.log('='.repeat(60));

    // Check all users and their permissions
    const users = await User.find({}).select('name email role permissions status');
    
    console.log(`\nTotal users: ${users.length}`);
    
    users.forEach(user => {
      console.log(`\n👤 User: ${user.name} (${user.email})`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Status: ${user.status}`);
      console.log(`   Permissions: ${user.permissions?.length || 0} permissions`);
      
      if (user.permissions && user.permissions.length > 0) {
        const categoryPermissions = user.permissions.filter(p => p.includes('categories'));
        if (categoryPermissions.length > 0) {
          console.log(`   📋 Category Permissions: ${categoryPermissions.join(', ')}`);
        } else {
          console.log(`   ❌ No category permissions found`);
        }
        
        // Show first few permissions
        const firstFew = user.permissions.slice(0, 5);
        console.log(`   📝 Sample permissions: ${firstFew.join(', ')}${user.permissions.length > 5 ? '...' : ''}`);
      } else {
        console.log(`   ❌ No permissions assigned`);
      }
    });

    // Check specifically for super admin users
    console.log('\n🔍 SUPER ADMIN ANALYSIS:');
    const superAdmins = users.filter(u => u.role === 'super_admin');
    console.log(`Super admin users: ${superAdmins.length}`);
    
    superAdmins.forEach(admin => {
      console.log(`\n👑 Super Admin: ${admin.name}`);
      console.log(`   Has categories.view: ${admin.permissions?.includes('categories.view') ? '✅' : '❌'}`);
      console.log(`   Has wildcard (*): ${admin.permissions?.includes('*') ? '✅' : '❌'}`);
    });

    // Check who has categories.view permission
    console.log('\n🔍 USERS WITH CATEGORIES.VIEW PERMISSION:');
    const usersWithCategoryView = users.filter(u => 
      u.permissions?.includes('categories.view') || u.permissions?.includes('*')
    );
    
    console.log(`Users with categories.view: ${usersWithCategoryView.length}`);
    usersWithCategoryView.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) - Role: ${user.role}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugUserPermissions();