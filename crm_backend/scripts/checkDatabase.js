import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_backend');
    console.log('MongoDB connected successfully');
    console.log('Database name:', mongoose.connection.db.databaseName);
    console.log('Connection state:', mongoose.connection.readyState);
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkDatabase = async () => {
  try {
    console.log('🔍 Checking database...');
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📋 Collections in database:');
    collections.forEach((collection, index) => {
      console.log(`${index + 1}. ${collection.name}`);
    });
    
    // Check if collections exist
    const collectionNames = collections.map(c => c.name);
    console.log('\n🔍 Checking specific collections:');
    
    const collectionsToCheck = ['salesorders', 'products', 'dealers', 'warehouses', 'stockmovements'];
    for (const collectionName of collectionsToCheck) {
      const exists = collectionNames.includes(collectionName);
      console.log(`${collectionName}: ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
      
      if (exists) {
        const count = await mongoose.connection.db.collection(collectionName).countDocuments();
        console.log(`   Documents: ${count}`);
      }
    }
    
    // Check for alternative collection names
    console.log('\n🔍 Checking for alternative collection names:');
    const alternativeNames = ['salesOrders', 'Products', 'Dealers', 'Warehouses', 'StockMovements'];
    for (const collectionName of alternativeNames) {
      const exists = collectionNames.includes(collectionName);
      if (exists) {
        const count = await mongoose.connection.db.collection(collectionName).countDocuments();
        console.log(`${collectionName}: ✅ EXISTS (${count} documents)`);
      }
    }
    
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

connectDB().then(() => {
  checkDatabase();
});
