import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { getCompanyConnection, COMPANY_DB_MAP } from '../config/multiDatabase.js';
import { userSchema } from '../models/User.js';

dotenv.config();

async function checkAdmins() {
  console.log('=== Checking Super Admins in all company databases ===');
  for (const [companyId, dbName] of Object.entries(COMPANY_DB_MAP)) {
    console.log(`\n-----------------------------------------`);
    console.log(`Checking company: ${companyId} (DB: ${dbName})`);
    try {
      const conn = getCompanyConnection(companyId);
      await conn.asPromise();
      const User = conn.models.User || conn.model('User', userSchema);
      
      const allSuperAdmins = await User.find({
        $or: [
          { role: 'super_admin' },
          { email: /superadmin/i },
          { username: /superadmin/i }
        ]
      }).select('+password');

      console.log(`Found ${allSuperAdmins.length} matching super_admin / superadmin users:`);
      for (const u of allSuperAdmins) {
        const testPass = await u.comparePassword('superadmin123');
        console.log({
          _id: u._id,
          name: u.name,
          username: u.username,
          email: u.email,
          role: u.role,
          status: u.status,
          passwordMatches: testPass,
          passwordHash: u.password ? u.password.substring(0, 15) + '...' : 'none'
        });
      }

      // Also count total users in this DB
      const totalUsers = await User.countDocuments();
      console.log(`Total users in ${companyId}: ${totalUsers}`);
      if (totalUsers <= 5) {
        const allUsers = await User.find().select('name username email role status');
        console.log('All users:', allUsers);
      }
    } catch (err) {
      console.error(`Error querying ${companyId}:`, err);
    }
  }
  process.exit(0);
}

checkAdmins();
