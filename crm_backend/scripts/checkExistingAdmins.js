// scripts/checkExistingAdmins.js
import { getCompanyConnection } from '../config/multiDatabase.js';
import userSchema from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Check existing admin users in all company databases
 */
async function checkExistingAdmins() {
  console.log('\n🔍 Checking existing admin users in all databases...\n');

  const companies = [
    { id: 'jain-impex', name: 'Jain Impex', dbName: 'JainImpexCRM' },
    { id: 'ridhi', name: 'Ridhi Build Mart', dbName: 'ridhi_crm' },
    { id: 'shree-jain-impex', name: 'Shree Jain Impex', dbName: 'shreejain_crm' }
  ];

  for (const company of companies) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📦 ${company.name} (${company.id})`);
      console.log(`   Database: ${company.dbName}`);
      console.log(`${'='.repeat(60)}`);
      
      // Get company-specific database connection
      const dbConnection = getCompanyConnection(company.id);
      
      // Get User model from company database - need to pass the schema
      let User;
      try {
        // Try to get existing model
        User = dbConnection.model('User');
      } catch (error) {
        // Model doesn't exist, create it with schema
        User = dbConnection.model('User', userSchema.schema);
      }
      
      // Find all users
      const allUsers = await User.find().select('-password').lean();
      
      if (allUsers.length === 0) {
        console.log('⚠️  No users found in this database');
        continue;
      }
      
      console.log(`\n✅ Found ${allUsers.length} user(s):\n`);
      
      // Display all users
      allUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name || 'N/A'}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Username: ${user.username || 'N/A'}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Status: ${user.status}`);
        console.log(`   Phone: ${user.phone || 'N/A'}`);
        console.log(`   Permissions: ${user.permissions?.length || 0} permission(s)`);
        if (user.permissions?.includes('*')) {
          console.log(`   🌟 Has ALL permissions (*)`);
        }
        console.log('');
      });
      
      // Find super admins specifically
      const superAdmins = allUsers.filter(u => u.role === 'super_admin');
      if (superAdmins.length > 0) {
        console.log(`🔑 Super Admin(s): ${superAdmins.length}`);
        superAdmins.forEach(admin => {
          console.log(`   - ${admin.email} (${admin.name})`);
        });
      }
      
      // Find admins
      const admins = allUsers.filter(u => u.role === 'admin');
      if (admins.length > 0) {
        console.log(`👤 Admin(s): ${admins.length}`);
        admins.forEach(admin => {
          console.log(`   - ${admin.email} (${admin.name})`);
        });
      }
      
    } catch (error) {
      console.error(`❌ Error checking ${company.name}:`, error.message);
      if (error.message.includes('Cannot read')) {
        console.log(`   ℹ️  Database might be empty or not initialized`);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Check completed!');
  console.log(`${'='.repeat(60)}\n`);

  process.exit(0);
}

// Run the script
checkExistingAdmins().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
