import mongoose from 'mongoose';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import User from './models/User.js';
import Region from './models/Region.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkExistingData() {
  try {
    console.log('🔍 Checking existing data in database...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Check warehouses
    const warehouseCount = await Warehouse.countDocuments();
    console.log(`📦 Warehouses: ${warehouseCount}`);
    
    if (warehouseCount > 0) {
      const sampleWarehouse = await Warehouse.findOne().populate('region').populate('createdBy');
      console.log('📦 Sample Warehouse:', {
        id: sampleWarehouse._id,
        name: sampleWarehouse.name,
        code: sampleWarehouse.code,
        status: sampleWarehouse.status,
        region: sampleWarehouse.region?.name || 'No region',
        createdBy: sampleWarehouse.createdBy?.name || 'No creator'
      });
    }
    
    // Check products
    const productCount = await Product.countDocuments();
    console.log(`📦 Products: ${productCount}`);
    
    if (productCount > 0) {
      const sampleProduct = await Product.findOne();
      console.log('📦 Sample Product:', {
        id: sampleProduct._id,
        name: sampleProduct.itemName,
        code: sampleProduct.productCode,
        price: sampleProduct.unitPrice
      });
    }
    
    // Check users
    const userCount = await User.countDocuments();
    console.log(`👤 Users: ${userCount}`);
    
    if (userCount > 0) {
      const sampleUser = await User.findOne();
      console.log('👤 Sample User:', {
        id: sampleUser._id,
        name: sampleUser.name,
        email: sampleUser.email,
        role: sampleUser.role
      });
    }
    
    // Check regions
    const regionCount = await Region.countDocuments();
    console.log(`🌍 Regions: ${regionCount}`);
    
    if (regionCount > 0) {
      const sampleRegion = await Region.findOne();
      console.log('🌍 Sample Region:', {
        id: sampleRegion._id,
        name: sampleRegion.name,
        code: sampleRegion.code
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking data:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

checkExistingData();