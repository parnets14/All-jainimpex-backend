import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import Region from '../models/Region.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the crm_backend directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const migrateUserRegions = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get all regions
    const regions = await Region.find({});
    const regionMap = {};
    regions.forEach(r => {
      regionMap[r.name] = r._id;
    });

    console.log('📍 Region Map:', regionMap);

    // Get all users with assignedRegions (including those with string values)
    const users = await User.find({ 
      assignedRegions: { $exists: true, $ne: [] } 
    }).lean();
    console.log(`\n👥 Found ${users.length} users with assigned regions`);

    for (const user of users) {
      console.log(`\n🔄 Processing user: ${user.name} (${user.email})`);
      console.log('   Current assignedRegions:', user.assignedRegions);

      // Skip if assignedRegions is not an array
      if (!Array.isArray(user.assignedRegions)) {
        console.log('   ⚠️  Skipping - assignedRegions is not an array');
        continue;
      }

      // Convert region names to IDs
      const newRegions = [];
      for (const region of user.assignedRegions) {
        if (mongoose.Types.ObjectId.isValid(region)) {
          // Already an ObjectId
          newRegions.push(region);
          console.log(`   ✅ Already ObjectId: ${region}`);
        } else if (regionMap[region]) {
          // Region name, convert to ID
          newRegions.push(regionMap[region]);
          console.log(`   ✅ Converted "${region}" to ${regionMap[region]}`);
        } else {
          console.log(`   ⚠️  Unknown region: ${region}`);
        }
      }

      if (newRegions.length > 0) {
        // Update using findByIdAndUpdate to bypass validation
        await User.findByIdAndUpdate(
          user._id,
          { assignedRegions: newRegions },
          { runValidators: false }
        );
        console.log(`   ✅ Updated assignedRegions:`, newRegions);
      }
    }

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

migrateUserRegions();
