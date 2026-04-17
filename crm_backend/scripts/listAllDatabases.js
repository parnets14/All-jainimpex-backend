import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGO_BASE_URI || 'mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net';

async function listDatabases() {
  try {
    console.log('🔍 Connecting to MongoDB cluster...\n');
    
    const connection = await mongoose.connect(`${MONGODB_URI}/admin`);
    
    const admin = connection.connection.db.admin();
    const { databases } = await admin.listDatabases();
    
    console.log('📊 Available databases in cluster:\n');
    databases.forEach((db, index) => {
      console.log(`   ${index + 1}. ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    
    console.log('\n✅ Done!');
    
    await connection.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

listDatabases();
