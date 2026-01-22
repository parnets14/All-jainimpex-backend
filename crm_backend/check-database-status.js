import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkDatabaseStatus() {
  try {
    console.log('🔍 Checking database status...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_backend');
    console.log('✅ Connected to MongoDB');
    
    // Get database name
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Database: ${dbName}`);
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\n📁 Found ${collections.length} collections:`);
    
    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      console.log(`  - ${collection.name}: ${count} documents`);
    }
    
    // Check specific collections we need
    const requiredCollections = ['products', 'dealerpricings', 'users', 'brands', 'categories', 'subcategories'];
    
    console.log('\n🎯 Required collections status:');
    for (const collectionName of requiredCollections) {
      try {
        const count = await mongoose.connection.db.collection(collectionName).countDocuments();
        const status = count > 0 ? '✅' : '❌';
        console.log(`  ${status} ${collectionName}: ${count} documents`);
      } catch (error) {
        console.log(`  ❌ ${collectionName}: Collection doesn't exist`);
      }
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

checkDatabaseStatus();