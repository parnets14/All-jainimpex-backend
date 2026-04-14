// scripts/checkDatabaseStatus.js
// SAFE SCRIPT - Only reads database, makes NO changes
// Run this FIRST to see what exists before running any migration

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jainimpex_crm';

async function checkDatabaseStatus() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     DATABASE STATUS CHECK - READ ONLY (NO CHANGES)        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: Checking Users Collection');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const usersCollection = db.collection('users');
    const totalUsers = await usersCollection.countDocuments();
    
    console.log(`📊 Total Users: ${totalUsers}\n`);

    if (totalUsers > 0) {
      // Check if company field exists
      const usersWithCompany = await usersCollection.countDocuments({ 
        company: { $exists: true } 
      });
      const usersWithoutCompany = totalUsers - usersWithCompany;

      console.log(`✅ Users with company field: ${usersWithCompany}`);
      console.log(`⚠️  Users without company field: ${usersWithoutCompany}\n`);

      // Show sample users
      console.log('📋 Sample Users (first 10):\n');
      const sampleUsers = await usersCollection
        .find({})
        .limit(10)
        .project({ email: 1, name: 1, role: 1, company: 1, _id: 0 })
        .toArray();

      console.log('┌────────────────────────────┬──────────────────┬──────────────────┐');
      console.log('│ Email                      │ Role             │ Company          │');
      console.log('├────────────────────────────┼──────────────────┼──────────────────┤');
      sampleUsers.forEach(user => {
        const email = (user.email || 'N/A').padEnd(26);
        const role = (user.role || 'N/A').padEnd(16);
        const company = (user.company || 'NOT SET').padEnd(16);
        console.log(`│ ${email} │ ${role} │ ${company} │`);
      });
      console.log('└────────────────────────────┴──────────────────┴──────────────────┘\n');

      // Check for specific admin emails
      console.log('🔍 Checking for existing admin users:\n');
      
      const jainAdmin = await usersCollection.findOne({ 
        email: { $regex: /admin.*jainimpex/i } 
      });
      const ridhiAdmin = await usersCollection.findOne({ 
        email: { $regex: /admin.*ridhi/i } 
      });
      const shreeAdmin = await usersCollection.findOne({ 
        email: { $regex: /admin.*shreejain/i } 
      });

      console.log(`   Jain Impex Admin: ${jainAdmin ? '✅ EXISTS (' + jainAdmin.email + ')' : '❌ NOT FOUND'}`);
      console.log(`   Ridhi Admin: ${ridhiAdmin ? '✅ EXISTS (' + ridhiAdmin.email + ')' : '❌ NOT FOUND'}`);
      console.log(`   Shree Jain Admin: ${shreeAdmin ? '✅ EXISTS (' + shreeAdmin.email + ')' : '❌ NOT FOUND'}\n`);

    } else {
      console.log('⚠️  No users found in database!\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2: Checking Other Collections');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const collections = [
      'dealers',
      'products',
      'dealerinvoices',
      'salesorders',
      'employees',
      'suppliers',
      'categories',
      'brands'
    ];

    console.log('📊 Collection Statistics:\n');
    console.log('┌────────────────────────┬───────────┬──────────────┬─────────────────┐');
    console.log('│ Collection             │ Total     │ With Company │ Without Company │');
    console.log('├────────────────────────┼───────────┼──────────────┼─────────────────┤');

    for (const collectionName of collections) {
      try {
        const collectionExists = await db.listCollections({ name: collectionName }).toArray();
        
        if (collectionExists.length === 0) {
          console.log(`│ ${collectionName.padEnd(22)} │ N/A       │ N/A          │ N/A             │`);
          continue;
        }

        const collection = db.collection(collectionName);
        const total = await collection.countDocuments();
        const withCompany = await collection.countDocuments({ company: { $exists: true } });
        const withoutCompany = total - withCompany;

        console.log(`│ ${collectionName.padEnd(22)} │ ${String(total).padEnd(9)} │ ${String(withCompany).padEnd(12)} │ ${String(withoutCompany).padEnd(15)} │`);
      } catch (error) {
        console.log(`│ ${collectionName.padEnd(22)} │ ERROR     │ ERROR        │ ERROR           │`);
      }
    }
    console.log('└────────────────────────┴───────────┴──────────────┴─────────────────┘\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: Analysis & Recommendations');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const usersWithoutCompany = totalUsers - (await usersCollection.countDocuments({ company: { $exists: true } }));

    if (usersWithoutCompany > 0) {
      console.log('⚠️  MIGRATION NEEDED:\n');
      console.log(`   • ${usersWithoutCompany} users need company field`);
      console.log('   • All existing data will be assigned to "jain-impex"');
      console.log('   • No data will be deleted or modified');
      console.log('   • Existing passwords will remain unchanged\n');
      
      console.log('📝 Recommended Actions:\n');
      console.log('   1. Run: node scripts/setupMultiCompany.js');
      console.log('   2. This will:');
      console.log('      - Add company field to all existing data');
      console.log('      - Assign everything to "jain-impex"');
      console.log('      - Create new admin users for Ridhi and Shree Jain Impex');
      console.log('      - Keep all existing users and data intact\n');
    } else {
      console.log('✅ MIGRATION ALREADY DONE:\n');
      console.log('   • All users have company field');
      console.log('   • Multi-company setup appears complete');
      console.log('   • You can start using the system\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 4: Existing Credentials');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (totalUsers > 0) {
      console.log('🔑 Your Existing Users:\n');
      
      const allUsers = await usersCollection
        .find({})
        .project({ email: 1, role: 1, company: 1, _id: 0 })
        .toArray();

      const jainUsers = allUsers.filter(u => u.company === 'jain-impex' || !u.company);
      const ridhiUsers = allUsers.filter(u => u.company === 'ridhi');
      const shreeUsers = allUsers.filter(u => u.company === 'shree-jain-impex');

      if (jainUsers.length > 0 || allUsers.some(u => !u.company)) {
        console.log('   Jain Impex Users:');
        const displayUsers = jainUsers.length > 0 ? jainUsers : allUsers.filter(u => !u.company);
        displayUsers.slice(0, 5).forEach(user => {
          console.log(`   • ${user.email} (${user.role})`);
        });
        if (displayUsers.length > 5) {
          console.log(`   • ... and ${displayUsers.length - 5} more`);
        }
        console.log('   ℹ️  Use your existing passwords for these accounts\n');
      }

      if (ridhiUsers.length > 0) {
        console.log('   Ridhi Users:');
        ridhiUsers.forEach(user => {
          console.log(`   • ${user.email} (${user.role})`);
        });
        console.log();
      }

      if (shreeUsers.length > 0) {
        console.log('   Shree Jain Impex Users:');
        shreeUsers.forEach(user => {
          console.log(`   • ${user.email} (${user.role})`);
        });
        console.log();
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`📊 Database: ${db.databaseName}`);
    console.log(`👥 Total Users: ${totalUsers}`);
    console.log(`📦 Collections Checked: ${collections.length}`);
    console.log(`🔒 Status: ${usersWithoutCompany > 0 ? 'NEEDS MIGRATION' : 'READY TO USE'}\n`);

    console.log('✅ This script made NO changes to your database.');
    console.log('   All data is safe and unchanged.\n');

  } catch (error) {
    console.error('\n❌ Error checking database:', error);
    console.error('\nPlease check:');
    console.error('   1. MongoDB is running');
    console.error('   2. Connection string is correct in .env');
    console.error('   3. You have read permissions to the database\n');
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed\n');
  }
}

// Run check
checkDatabaseStatus();
