import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import { generateToken } from './utils/jwtUtils.js';

dotenv.config();

async function testAPIWithSuperAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 TESTING HIERARCHY API ENDPOINTS WITH SUPER ADMIN');
    console.log('='.repeat(60));

    // 1. Find a super admin user
    console.log('\n📊 FINDING SUPER ADMIN USER:');
    const superAdmin = await User.findOne({ role: 'super_admin' });
    
    if (!superAdmin) {
      console.log('❌ No super admin found!');
      process.exit(1);
    }
    
    console.log(`Found super admin: ${superAdmin.name} (${superAdmin.email})`);
    console.log(`Role: ${superAdmin.role}`);
    console.log(`Permissions: ${superAdmin.permissions?.length || 0} permissions`);
    if (superAdmin.permissions?.length > 0) {
      console.log(`  - ${superAdmin.permissions.slice(0, 5).join(', ')}${superAdmin.permissions.length > 5 ? '...' : ''}`);
    }

    // 2. Generate token for super admin
    const token = generateToken(superAdmin._id);
    console.log(`Generated token length: ${token.length}`);

    // 3. Test data availability
    console.log('\n📊 DATA AVAILABILITY:');
    const brandCount = await Brand.countDocuments({ status: 'active' });
    const categoryCount = await Category.countDocuments({ status: 'active' });
    const subcategoryCount = await Subcategory.countDocuments({ status: 'active' });
    
    console.log(`Active Brands: ${brandCount}`);
    console.log(`Active Categories: ${categoryCount}`);
    console.log(`Active Subcategories: ${subcategoryCount}`);

    if (brandCount === 0 || categoryCount === 0) {
      console.log('❌ No active data found!');
      process.exit(1);
    }

    // 4. Test API endpoints using fetch (simulating frontend calls)
    const baseURL = 'http://localhost:5000/api';
    
    console.log('\n🔍 TESTING API ENDPOINTS:');
    
    // Test brands endpoint
    console.log('\n1. Testing /api/brands endpoint:');
    try {
      const response = await fetch(`${baseURL}/brands`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Brands API success - ${data.data?.length || 0} brands returned`);
        if (data.data?.length > 0) {
          console.log(`   Sample: ${data.data[0].name}`);
        }
      } else {
        const errorData = await response.text();
        console.log(`❌ Brands API failed: ${errorData}`);
      }
    } catch (error) {
      console.log(`❌ Brands API error: ${error.message}`);
    }

    // Test categories endpoint
    console.log('\n2. Testing /api/categories endpoint:');
    try {
      const response = await fetch(`${baseURL}/categories`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Categories API success - ${data.data?.length || 0} categories returned`);
        if (data.data?.length > 0) {
          console.log(`   Sample: ${data.data[0].name}`);
        }
      } else {
        const errorData = await response.text();
        console.log(`❌ Categories API failed: ${errorData}`);
      }
    } catch (error) {
      console.log(`❌ Categories API error: ${error.message}`);
    }

    // Test subcategories endpoint
    console.log('\n3. Testing /api/subcategories endpoint:');
    try {
      const response = await fetch(`${baseURL}/subcategories`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Subcategories API success - ${data.data?.length || 0} subcategories returned`);
        if (data.data?.length > 0) {
          console.log(`   Sample: ${data.data[0].name}`);
        }
      } else {
        const errorData = await response.text();
        console.log(`❌ Subcategories API failed: ${errorData}`);
      }
    } catch (error) {
      console.log(`❌ Subcategories API error: ${error.message}`);
    }

    // 5. Check if backend server is running
    console.log('\n🔍 CHECKING BACKEND SERVER:');
    try {
      const response = await fetch(`${baseURL}/health`, {
        method: 'GET'
      });
      
      if (response.ok) {
        console.log('✅ Backend server is running');
      } else {
        console.log('❌ Backend server health check failed');
      }
    } catch (error) {
      console.log('❌ Backend server is not running or not accessible');
      console.log('   Make sure to start the backend server with: npm start');
    }

    console.log('\n🔍 RECOMMENDATIONS:');
    console.log('1. Ensure backend server is running on port 5000');
    console.log('2. Check if API routes are properly configured');
    console.log('3. Verify permission middleware is working correctly');
    console.log('4. Test frontend API calls with proper authentication');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testAPIWithSuperAdmin();