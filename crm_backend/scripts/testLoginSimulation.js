import dotenv from 'dotenv';
import { getCompanyConnection, COMPANY_DB_MAP } from '../config/multiDatabase.js';
import { userSchema } from '../models/User.js';

dotenv.config();

const testCredentials = [
  {
    company: 'jain-impex',
    email: 'superadmin@jainimpex.com',
    password: 'superadmin123'
  },
  {
    company: 'ridhi',
    email: 'superadmin@ridhi.com',
    password: 'superadmin123'
  },
  {
    company: 'shree-jain-impex',
    email: 'superadmin@shreejainimpex.com',
    password: 'superadmin123'
  }
];

async function simulateLogin(creds) {
  const { company, email, password } = creds;
  console.log(`\nTesting login for: ${email} @ ${company}`);

  const conn = getCompanyConnection(company);
  await conn.asPromise();
  const User = conn.models.User || conn.model('User', userSchema);

  const loginId = (email || '').trim();
  const escLogin = loginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idRegex = new RegExp(`^${escLogin}$`, 'i');
  const lookupField = loginId.includes('@') ? { email: idRegex } : { username: idRegex };

  const candidates = await User.find(lookupField).select('+password');

  if (!candidates || candidates.length === 0) {
    console.error(`❌ User not found: ${email}`);
    return false;
  }

  const matched = [];
  for (const c of candidates) {
    if (await c.comparePassword(password)) matched.push(c);
  }

  if (matched.length === 0) {
    console.error(`❌ Invalid password for ${email}`);
    return false;
  }

  const user = matched[0];
  if (user.status !== 'Active') {
    console.error(`❌ Account deactivated: ${email}`);
    return false;
  }

  console.log(`✅ Login successful for ${email}!`);
  console.log(`   User ID: ${user._id}`);
  console.log(`   Name: ${user.name}`);
  console.log(`   Username: ${user.username}`);
  console.log(`   Role: ${user.role}`);
  console.log(`   Status: ${user.status}`);
  return true;
}

async function runAll() {
  let allPass = true;
  for (const c of testCredentials) {
    const ok = await simulateLogin(c);
    if (!ok) allPass = false;
  }

  if (allPass) {
    console.log('\n🎉 ALL 3 SUPERADMIN LOGINS PASSED SIMULATION!');
  } else {
    console.error('\n❌ SOME LOGINS FAILED');
  }
  process.exit(allPass ? 0 : 1);
}

runAll();
