// One-time reset of the BiometricPunch collection.
// The early .mdb test data used a different unique index (sourceId+machineNo).
// We've switched the dedup key to (cardNo+punchAt+machineNo) for the direct-device
// agent, so drop the old collection (test data only) to clear the old index.
//
// Usage:  node scripts/resetBiometricPunches.js <company>
//   e.g.  node scripts/resetBiometricPunches.js jain-impex
import { getCompanyConnection } from '../config/multiDatabase.js';

const company = process.argv[2];
if (!company) {
  console.error('Usage: node scripts/resetBiometricPunches.js <company>');
  process.exit(1);
}

const run = async () => {
  const conn = getCompanyConnection(company);
  await conn.asPromise();
  try {
    const collections = await conn.db.listCollections({ name: 'biometricpunches' }).toArray();
    if (collections.length === 0) {
      console.log('ℹ️  biometricpunches collection does not exist yet — nothing to drop.');
    } else {
      await conn.db.dropCollection('biometricpunches');
      console.log(`✅ Dropped biometricpunches in ${company}. New index will be created on next insert.`);
    }
  } catch (e) {
    console.error('❌ Reset failed:', e.message);
  } finally {
    await conn.close();
    process.exit(0);
  }
};

setTimeout(run, 1500);
