import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
import { getCompanyConnection, COMPANY_DB_MAP } from '../config/multiDatabase.js';

dotenv.config();

async function checkReferences() {
  for (const [companyId, dbName] of Object.entries(COMPANY_DB_MAP)) {
    console.log(`\nChecking activity logs for: ${companyId}`);
    const conn = getCompanyConnection(companyId);
    await conn.asPromise();
    
    // Check if ActivityLog collection exists
    if (conn.models.ActivityLog || conn.collections['activitylogs']) {
      const logs = await conn.collection('activitylogs').find({}).sort({ createdAt: -1 }).limit(5).toArray();
      console.log(`Last 5 activity logs in ${companyId}:`);
      logs.forEach(l => console.log(`  [${l.action}] by ${l.userEmail || l.userName || l.user} at ${l.createdAt}`));
    }
  }
  process.exit(0);
}

checkReferences();
