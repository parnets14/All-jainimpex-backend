import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
import { getCompanyConnection, COMPANY_DB_MAP } from '../config/multiDatabase.js';
import { userSchema } from '../models/User.js';

dotenv.config();

const passwordsToTest = ['superadmin123', 'admin123', 'admin@123', '123456', 'superadmin', 'password'];

async function test() {
  for (const [companyId, dbName] of Object.entries(COMPANY_DB_MAP)) {
    console.log(`\n=== Company: ${companyId} (${dbName}) ===`);
    const conn = getCompanyConnection(companyId);
    await conn.asPromise();
    const User = conn.models.User || conn.model('User', userSchema);

    const users = await User.find({}).select('+password');
    for (const u of users) {
      if (u.role === 'super_admin' || u.role === 'admin' || u.email.includes('admin') || u.username.includes('admin')) {
        let matchedPwd = null;
        for (const p of passwordsToTest) {
          if (await u.comparePassword(p)) {
            matchedPwd = p;
            break;
          }
        }
        console.log({
          _id: u._id,
          name: u.name,
          username: u.username,
          email: u.email,
          role: u.role,
          status: u.status,
          matchedPassword: matchedPwd || 'UNKNOWN'
        });
      }
    }
  }
  process.exit(0);
}

test();
