import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Route from './models/Route.js';
import User from './models/User.js';
import Region from './models/Region.js';

dotenv.config();

const debugDealerMasterDropdowns = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Check Routes
    console.log('=== ROUTES CHECK ===');
    const routes = await Route.find().populate('salesExecutive', 'name email');
    console.log(`Total Routes: ${routes.length}`);
    if (routes.length > 0) {
      routes.forEach(route => {
        console.log(`  - ${route.name} (${route.code}) - Active: ${route.isActive}`);
      });
    } else {
      console.log('  ⚠️  No routes found!');
    }

    // Check Sales Executives
    console.log('\n=== SALES EXECUTIVES CHECK ===');
    const salesExecutives = await User.find({ role: 'sales_executive' });
    console.log(`Total Sales Executives: ${salesExecutives.length}`);
    if (salesExecutives.length > 0) {
      salesExecutives.forEach(se => {
        console.log(`  - ${se.name} (${se.username}) - Status: ${se.status}`);
      });
    } else {
      console.log('  ⚠️  No sales executives found!');
    }

    // Check Regions
    console.log('\n=== REGIONS CHECK ===');
    const regions = await Region.find();
    console.log(`Total Regions: ${regions.length}`);
    if (regions.length > 0) {
      regions.forEach(region => {
        console.log(`  - ${region.name} (${region.code})`);
      });
    } else {
      console.log('  ⚠️  No regions found!');
    }

    // Check User roles
    console.log('\n=== ALL USER ROLES ===');
    const allUsers = await User.find().select('name username role status');
    const roleCount = {};
    allUsers.forEach(user => {
      roleCount[user.role] = (roleCount[user.role] || 0) + 1;
    });
    console.log('Role Distribution:');
    Object.entries(roleCount).forEach(([role, count]) => {
      console.log(`  - ${role}: ${count}`);
    });

    // Test API response format
    console.log('\n=== API RESPONSE FORMAT TEST ===');
    console.log('\nRoutes API format:');
    console.log(JSON.stringify({
      success: true,
      routes: routes.map(r => ({
        _id: r._id,
        name: r.name,
        code: r.code,
        description: r.description,
        isActive: r.isActive
      }))
    }, null, 2));

    console.log('\nSales Executives API format:');
    console.log(JSON.stringify({
      success: true,
      users: salesExecutives.map(u => ({
        _id: u._id,
        name: u.name,
        username: u.username,
        empId: u.empId,
        status: u.status
      }))
    }, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

debugDealerMasterDropdowns();
