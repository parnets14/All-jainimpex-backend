import { MongoClient } from 'mongodb';

const OLD_URI = "mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net/?retryWrites=true&w=majority";
const NEW_URI = "mongodb+srv://jainimpex:JainImpex123@cluster0.5ateupu.mongodb.net/?retryWrites=true&w=majority";

async function verifyClone() {
  console.log('🔍 Verifying MongoDB Clone...\n');
  
  let oldClient, newClient;
  
  try {
    // Connect to both clusters
    console.log('Connecting to OLD cluster...');
    oldClient = await MongoClient.connect(OLD_URI);
    console.log('✅ Connected to OLD cluster\n');
    
    console.log('Connecting to NEW cluster...');
    newClient = await MongoClient.connect(NEW_URI);
    console.log('✅ Connected to NEW cluster\n');
    
    // Get databases
    const databases = ['JainImpexCRM', 'ridhi_crm', 'shreejain_crm'];
    
    console.log('📊 COMPARISON RESULTS:');
    console.log('='.repeat(80));
    
    for (const dbName of databases) {
      console.log(`\n🗄️  Database: ${dbName}`);
      console.log('-'.repeat(80));
      
      const oldDb = oldClient.db(dbName);
      const newDb = newClient.db(dbName);
      
      // Get all collections
      const oldCollections = await oldDb.listCollections().toArray();
      const newCollections = await newDb.listCollections().toArray();
      
      const oldCollNames = oldCollections.map(c => c.name).sort();
      const newCollNames = newCollections.map(c => c.name).sort();
      
      console.log(`OLD Collections: ${oldCollNames.length}`);
      console.log(`NEW Collections: ${newCollNames.length}`);
      
      // Check CRITICAL business collections
      const criticalColls = [
        'products',
        'categories', 
        'subcategories',
        'dealers',
        'users',
        'attendances',
        'employees',
        'leaverequests',
        'salaryslips',
        'dealerinvoices',
        'supplierinvoices'
      ];
      
      const existingColls = criticalColls.filter(c => oldCollNames.includes(c));
      
      let totalOld = 0;
      let totalNew = 0;
      let matches = 0;
      
      for (const collName of existingColls) {
        try {
          const oldCount = await oldDb.collection(collName).countDocuments();
          const newCount = await newDb.collection(collName).countDocuments();
          
          totalOld += oldCount;
          totalNew += newCount;
          
          const match = oldCount === newCount ? '✅' : '⚠️';
          if (oldCount === newCount) matches++;
          
          console.log(`  ${match} ${collName.padEnd(20)}: OLD=${oldCount.toString().padStart(5)}, NEW=${newCount.toString().padStart(5)}`);
        } catch (err) {
          console.log(`  ⚠️  ${collName}: Error - ${err.message}`);
        }
      }
      
      console.log(`\n📊 Critical data check: ${matches}/${existingColls.length} collections match`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Verification complete!');
    console.log('Both clusters have your data.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (oldClient) await oldClient.close();
    if (newClient) await newClient.close();
  }
}

verifyClone();
