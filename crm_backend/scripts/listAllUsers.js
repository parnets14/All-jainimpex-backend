import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
import { getCompanyConnection, COMPANY_DB_MAP } from '../config/multiDatabase.js';
import { userSchema } from '../models/User.js';

dotenv.config();

async function showAllUsers() {
  for (const [companyId, dbName] of Object.entries(COMPANY_DB_MAP)) {
    console.log(`\n================== ${companyId} (${dbName}) ==================`);
    const conn = getCompanyConnection(companyId);
    await conn.asPromise();
    const User = conn.models.User || conn.model('User', userSchema);
    const users = await User.find({}, 'name username email role status permissions');
    console.log(`Total: ${users.length} users`);
    users.forEach(u => console.log(`  - [${u.role}] ${u.name} | user: "${u.username}" | email: "${u.email}" | status: ${u.status}`));
  }
  process.exit(0);
}

showAllUsers();
