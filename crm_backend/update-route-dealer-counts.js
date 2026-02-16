import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Route from './models/Route.js';
import Dealer from './models/Dealer.js';

dotenv.config();

const updateRouteDealerCounts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get all routes
    const routes = await Route.find();
    console.log(`\n📊 Found ${routes.length} routes`);

    for (const route of routes) {
      // Count dealers assigned to this route
      const dealerCount = await Dealer.countDocuments({ routeId: route._id });
      
      // Update route with dealer count
      await Route.findByIdAndUpdate(route._id, { totalDealers: dealerCount });
      
      console.log(`✅ Route: ${route.name} (${route.code}) - Updated dealer count: ${dealerCount}`);
    }

    console.log('\n✅ All route dealer counts updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

updateRouteDealerCounts();
