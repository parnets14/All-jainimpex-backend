import { MongoClient } from 'mongodb';

const uri = 'mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net/JainImpexCRM?retryWrites=true&w=majority';

async function run() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('JainImpexCRM');
  
  const result = await db.collection('purchaseorders').updateMany(
    { notes: { $regex: 'Auto-created' }, status: 'Draft', expirationDate: null },
    { $set: { expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isAutoCreated: true } }
  );
  
  console.log('Updated', result.modifiedCount, 'Draft auto-created POs with expirationDate');
  await client.close();
}

run().catch(e => console.error(e));
