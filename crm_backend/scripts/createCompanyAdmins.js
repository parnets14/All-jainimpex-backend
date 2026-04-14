// scripts/createCompanyAdmins.js
import { getCompanyConnection } from '../config/multiDatabase.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create admin users for all three companies
 * (All databases are empty, so create fresh admins)
 */
async function createCompanyAdmins() {
  console.log('\n🚀 Creating admin users for all companies...\n');

  const companies = [
    {
      id: 'jain-impex',
      name: 'Jain Impex',
      checkOnly: true, // Only verify, don't create (already has super admin)
      admin: {
        email: 'superadmin@jainimpex.com',
      }
    },
    {
      id: 'ridhi',
      name: 'Ridhi Build Mart',
      checkOnly: false, // Create new admin
      admin: {
        name: 'Ridhi Super Admin',
        username: 'ridhi_admin',
        email: 'superadmin@ridhi.com',
        password: 'superadmin123',
        phone: '1234567891',
        role: 'super_admin',
        status: 'Active',
        permissions: ['*'], // All permissions
        location: 'Head Office'
      }
    },
    {
      id: 'shree-jain-impex',
      name: 'Shree Jain Impex',
      checkOnly: false, // Create new admin
      admin: {
        name: 'Shree Jain Super Admin',
        username: 'shreejain_admin',
        email: 'superadmin@shreejainimpex.com',
        password: 'superadmin123',
        phone: '1234567892',
        role: 'super_admin',
        status: 'Active',
        permissions: ['*'], // All permissions
        location: 'Head Office'
      }
    }
  ];

  for (const company of companies) {
    try {
      console.log(`\n📦 Processing ${company.name} (${company.id})...`);
      
      // Get company-specific database connection
      const dbConnection = getCompanyConnection(company.id);
      
      // Get User model from company database
      let User;
      try {
        User = dbConnection.model('User');
      } catch (error) {
        // Import User schema
        const userSchemaModule = await import('../models/User.js');
        User = dbConnection.model('User', userSchemaModule.default.schema);
      }
      
      // Check if admin already exists
      const existingAdmin = await User.findOne({ email: company.admin.email });
      
      if (existingAdmin) {
        console.log(`✅ Admin already exists: ${company.admin.email}`);
        console.log(`   Name: ${existingAdmin.name}`);
        console.log(`   Role: ${existingAdmin.role}`);
        console.log(`   Status: ${existingAdmin.status}`);
        
        if (company.checkOnly) {
          console.log(`   ℹ️  Jain Impex admin verified - no action needed`);
        }
        continue;
      }
      
      // If checkOnly mode and no admin found, show warning
      if (company.checkOnly) {
        console.log(`⚠️  WARNING: No admin found for ${company.name}`);
        console.log(`   Expected email: ${company.admin.email}`);
        console.log(`   Please check your Jain Impex database`);
        continue;
      }
      
      // Create new admin user (only for Ridhi and Shree Jain)
      const newAdmin = new User(company.admin);
      await newAdmin.save();
      
      console.log(`✅ Admin created successfully!`);
      console.log(`   Email: ${company.admin.email}`);
      console.log(`   Password: ${company.admin.password}`);
      console.log(`   Role: ${company.admin.role}`);
      
    } catch (error) {
      console.error(`❌ Error processing ${company.name}:`, error.message);
    }
  }

  console.log('\n✅ Admin user creation completed!\n');
  console.log('📝 Login Credentials:\n');
  
  console.log('Jain Impex:');
  console.log('  URL: http://localhost:5173/login?company=jain-impex');
  console.log('  Email: superadmin@jainimpex.com');
  console.log('  Password: superadmin123');
  console.log('  ℹ️  (Existing admin - already in database)\n');
  
  // Only show credentials for newly created admins
  companies.filter(c => !c.checkOnly).forEach(company => {
    console.log(`${company.name}:`);
    console.log(`  URL: http://localhost:5173/login?company=${company.id}`);
    console.log(`  Email: ${company.admin.email}`);
    console.log(`  Password: ${company.admin.password}`);
    console.log(`  ℹ️  (Newly created)\n`);
  });

  process.exit(0);
}

// Run the script
createCompanyAdmins().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
