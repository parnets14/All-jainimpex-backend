import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';

dotenv.config();

/**
 * Verify dealer location data
 */
const verifyDealerLocations = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const totalDealers = await Dealer.countDocuments();
    
    // Dealers with complete location data
    const dealersWithLocation = await Dealer.find({
      'location.coordinates.lat': { $exists: true, $ne: null },
      'location.coordinates.lng': { $exists: true, $ne: null },
    }).select('code name address location');

    // Dealers without location data
    const dealersWithoutLocation = await Dealer.find({
      $or: [
        { 'location.coordinates.lat': { $exists: false } },
        { 'location.coordinates.lng': { $exists: false } },
        { 'location.coordinates.lat': null },
        { 'location.coordinates.lng': null },
      ],
    }).select('code name address location');

    console.log('='.repeat(70));
    console.log('📊 DEALER LOCATION DATA VERIFICATION');
    console.log('='.repeat(70));
    console.log(`Total Dealers: ${totalDealers}`);
    console.log(`✅ With Location Data: ${dealersWithLocation.length} (${((dealersWithLocation.length / totalDealers) * 100).toFixed(1)}%)`);
    console.log(`❌ Without Location Data: ${dealersWithoutLocation.length} (${((dealersWithoutLocation.length / totalDealers) * 100).toFixed(1)}%)`);
    console.log('='.repeat(70));

    // Show sample dealers with location
    if (dealersWithLocation.length > 0) {
      console.log('\n✅ DEALERS WITH LOCATION DATA (Sample - First 5):');
      console.log('-'.repeat(70));
      
      dealersWithLocation.slice(0, 5).forEach((dealer, index) => {
        console.log(`\n${index + 1}. ${dealer.name} (${dealer.code})`);
        console.log(`   Address: ${dealer.address}`);
        console.log(`   Formatted: ${dealer.location.formattedAddress || 'N/A'}`);
        console.log(`   Coordinates: ${dealer.location.coordinates.lat}, ${dealer.location.coordinates.lng}`);
        console.log(`   Place ID: ${dealer.location.placeId || 'N/A'}`);
        
        if (dealer.location.addressComponents) {
          const ac = dealer.location.addressComponents;
          console.log(`   Components:`);
          if (ac.street) console.log(`     - Street: ${ac.street}`);
          if (ac.city) console.log(`     - City: ${ac.city}`);
          if (ac.state) console.log(`     - State: ${ac.state}`);
          if (ac.country) console.log(`     - Country: ${ac.country}`);
          if (ac.postalCode) console.log(`     - Postal Code: ${ac.postalCode}`);
        }
        
        // Google Maps link
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${dealer.location.coordinates.lat},${dealer.location.coordinates.lng}`;
        console.log(`   🗺️  View on Map: ${mapsUrl}`);
      });
    }

    // Show dealers without location
    if (dealersWithoutLocation.length > 0) {
      console.log('\n\n❌ DEALERS WITHOUT LOCATION DATA:');
      console.log('-'.repeat(70));
      
      dealersWithoutLocation.forEach((dealer, index) => {
        console.log(`${index + 1}. ${dealer.name} (${dealer.code})`);
        console.log(`   Address: ${dealer.address || 'No address'}`);
      });

      console.log('\n💡 TIP: Run "node geocode-dealers.js" to automatically geocode these dealers');
    }

    // Validate coordinate ranges
    console.log('\n\n🔍 VALIDATING COORDINATE RANGES:');
    console.log('-'.repeat(70));
    
    const invalidCoordinates = dealersWithLocation.filter(dealer => {
      const lat = dealer.location.coordinates.lat;
      const lng = dealer.location.coordinates.lng;
      return lat < -90 || lat > 90 || lng < -180 || lng > 180;
    });

    if (invalidCoordinates.length > 0) {
      console.log(`⚠️  Found ${invalidCoordinates.length} dealers with invalid coordinates:`);
      invalidCoordinates.forEach(dealer => {
        console.log(`   - ${dealer.name} (${dealer.code}): ${dealer.location.coordinates.lat}, ${dealer.location.coordinates.lng}`);
      });
    } else {
      console.log('✅ All coordinates are within valid ranges');
      console.log('   Latitude: -90 to 90');
      console.log('   Longitude: -180 to 180');
    }

    // Check for duplicate coordinates (might indicate data issues)
    console.log('\n\n🔍 CHECKING FOR DUPLICATE COORDINATES:');
    console.log('-'.repeat(70));
    
    const coordinateMap = new Map();
    dealersWithLocation.forEach(dealer => {
      const key = `${dealer.location.coordinates.lat},${dealer.location.coordinates.lng}`;
      if (!coordinateMap.has(key)) {
        coordinateMap.set(key, []);
      }
      coordinateMap.get(key).push(dealer);
    });

    const duplicates = Array.from(coordinateMap.entries()).filter(([_, dealers]) => dealers.length > 1);
    
    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} coordinate(s) shared by multiple dealers:`);
      duplicates.forEach(([coords, dealers]) => {
        console.log(`\n   Coordinates: ${coords}`);
        dealers.forEach(dealer => {
          console.log(`     - ${dealer.name} (${dealer.code})`);
        });
      });
    } else {
      console.log('✅ No duplicate coordinates found - all dealers have unique locations');
    }

    // Geographic distribution
    console.log('\n\n🌍 GEOGRAPHIC DISTRIBUTION:');
    console.log('-'.repeat(70));
    
    if (dealersWithLocation.length > 0) {
      const lats = dealersWithLocation.map(d => d.location.coordinates.lat);
      const lngs = dealersWithLocation.map(d => d.location.coordinates.lng);
      
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      
      console.log(`Latitude Range: ${minLat.toFixed(4)} to ${maxLat.toFixed(4)}`);
      console.log(`Longitude Range: ${minLng.toFixed(4)} to ${maxLng.toFixed(4)}`);
      
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      
      console.log(`\nCenter Point: ${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}`);
      console.log(`🗺️  View All: https://www.google.com/maps/@${centerLat},${centerLng},10z`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Verification Complete!');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run the script
verifyDealerLocations();
