import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

import User from '../models/User.js';

async function checkUserRegion() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/jain_inpex_crm';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all users
    const allUsers = await User.find({}).select('name phone role region');
    
    console.log('\n📋 All Users:');
    allUsers.forEach(user => {
      console.log(`\nUser: ${user.name} (${user.phone})`);
      console.log(`Role: ${user.role}`);
      console.log(`Region Type: ${typeof user.region}`);
      console.log(`Region Value:`, user.region);
      console.log(`Region Length:`, Array.isArray(user.region) ? user.region.length : 'N/A');
    });

    // Find sales executives specifically
    const salesExecs = await User.find({ role: 'Sales Executive' });
    console.log(`\n\n📊 Found ${salesExecs.length} Sales Executives with role "Sales Executive"`);
    
    salesExecs.forEach(user => {
      console.log(`\n✓ ${user.name} (${user.phone})`);
      console.log(`  Region:`, user.region);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkUserRegion();
