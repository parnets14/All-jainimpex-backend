import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Warehouse from '../models/Warehouse.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const checkWarehouses = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get all warehouses
    const allWarehouses = await Warehouse.find({})
      .select('code name isActive status region')
      .lean();

    console.log('\n📦 ALL WAREHOUSES:');
    console.log('==================');
    allWarehouses.forEach((wh, index) => {
      console.log(`${index + 1}. ${wh.name} (${wh.code})`);
      console.log(`   - Active: ${wh.isActive}`);
      console.log(`   - Status: ${wh.status}`);
      console.log(`   - Region ID: ${wh.region || 'No Region'}`);
      console.log('');
    });

    // Get active warehouses only
    const activeWarehouses = await Warehouse.find({
      isActive: true,
      status: 'active'
    })
      .select('code name region')
      .lean();

    console.log('\n✅ ACTIVE WAREHOUSES:');
    console.log('=====================');
    activeWarehouses.forEach((wh, index) => {
      console.log(`${index + 1}. ${wh.name} (${wh.code}) - Region ID: ${wh.region || 'No Region'}`);
    });

    // Check a sample sales executive user
    const sampleUser = await User.findOne({ role: 'sales_executive' })
      .select('name phone assignedRegions')
      .lean();

    if (sampleUser) {
      console.log('\n👤 SAMPLE SALES EXECUTIVE:');
      console.log('==========================');
      console.log(`Name: ${sampleUser.name}`);
      console.log(`Phone: ${sampleUser.phone}`);
      console.log(`Assigned Regions: ${sampleUser.assignedRegions?.length || 0}`);
      
      if (sampleUser.assignedRegions && sampleUser.assignedRegions.length > 0) {
        console.log(`Assigned Region IDs: ${sampleUser.assignedRegions.join(', ')}`);
        
        const warehousesForUser = await Warehouse.find({
          isActive: true,
          status: 'active',
          region: { $in: sampleUser.assignedRegions }
        })
          .select('code name region')
          .lean();

        console.log(`\n🏭 Warehouses available to this user: ${warehousesForUser.length}`);
        warehousesForUser.forEach((wh, index) => {
          console.log(`${index + 1}. ${wh.name} (${wh.code}) - Region ID: ${wh.region}`);
        });
      }
    }

    console.log('\n✅ Check complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkWarehouses();
