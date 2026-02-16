import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Route from './models/Route.js';
import User from './models/User.js';

dotenv.config();

const testRoutesForDealerMaster = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Fetch all routes
    const routes = await Route.find()
      .populate('salesExecutive', 'name email')
      .sort({ createdAt: -1 });

    console.log('\n📊 Routes in Database:');
    console.log(`Total Routes: ${routes.length}`);
    
    if (routes.length === 0) {
      console.log('\n⚠️  No routes found in database!');
      console.log('Please create routes in Route Master first.');
    } else {
      console.log('\n✅ Routes available for Dealer Master:');
      routes.forEach((route, index) => {
        console.log(`\n${index + 1}. ${route.name} (${route.code})`);
        console.log(`   ID: ${route._id}`);
        console.log(`   Sales Executive: ${route.salesExecutive?.name || 'Unassigned'}`);
        console.log(`   Active: ${route.isActive}`);
        console.log(`   Dealers: ${route.totalDealers || 0}`);
        console.log(`   Areas: ${route.areas?.length || 0}`);
        console.log(`   Pin Codes: ${route.pinCodes?.length || 0}`);
      });

      // Check format for SearchableDropdown
      console.log('\n📋 Format for SearchableDropdown:');
      const formattedRoutes = routes.map(r => ({
        _id: r._id,
        name: r.name,
        code: r.code,
        description: r.description
      }));
      console.log(JSON.stringify(formattedRoutes, null, 2));
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testRoutesForDealerMaster();
