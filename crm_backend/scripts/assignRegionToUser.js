import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

import User from '../models/User.js';
import Region from '../models/Region.js';

async function assignRegionToUser() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/jain_inpex_crm';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all users first
    const allUsers = await User.find({}).select('name phone role region');
    console.log('\n👥 All Users in Database:');
    allUsers.forEach((u, i) => {
      console.log(`${i + 1}. ${u.name} (${u.phone}) - Role: ${u.role} - Region: ${u.region || 'None'}`);
    });

    // Find the user
    const user = await User.findOne({ role: 'sales_executive' });
    if (!user) {
      console.log('\n❌ No sales_executive user found');
      return;
    }

    console.log('\n📋 Current User Info:');
    console.log('Name:', user.name);
    console.log('Phone:', user.phone);
    console.log('Role:', user.role);
    console.log('Current Region:', user.region);

    // Get all regions
    const regions = await Region.find({});
    console.log('\n📍 Available Regions:');
    regions.forEach((region, index) => {
      console.log(`${index + 1}. ${region.name} (${region._id})`);
    });

    if (regions.length === 0) {
      console.log('\n❌ No regions found in database');
      return;
    }

    // Assign all regions to the user (or you can select specific ones)
    const regionIds = regions.map(r => r._id);
    
    user.region = regionIds;
    await user.save();

    console.log('\n✅ Updated user with regions:');
    console.log('Assigned Regions:', regionIds);
    console.log('Region Count:', regionIds.length);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

assignRegionToUser();
