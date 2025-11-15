import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Claim from '../models/Claim.js';

dotenv.config();

const fixPaths = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Find all claims with documents
    const claims = await Claim.find({ 'document.filename': { $exists: true } });
    
    console.log(`📋 Found ${claims.length} claims with documents\n`);

    for (const claim of claims) {
      const oldPath = claim.document.path;
      const filename = claim.document.filename;
      
      // Construct correct path
      const newPath = `/uploads/expenses/${filename}`;
      
      if (oldPath !== newPath) {
        console.log(`Fixing claim ${claim._id}:`);
        console.log(`  Old: ${oldPath}`);
        console.log(`  New: ${newPath}`);
        
        claim.document.path = newPath;
        await claim.save();
        console.log(`  ✅ Updated\n`);
      } else {
        console.log(`✓ Claim ${claim._id} already has correct path\n`);
      }
    }

    console.log('✅ All claim document paths fixed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

fixPaths();
