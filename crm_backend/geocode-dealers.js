import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';
import fetch from 'node-fetch';

dotenv.config();

const GOOGLE_MAPS_API_KEY = 'AIzaSyAHFoepvVjrlMUctcC4wn_VRpOznZBzmhA';

/**
 * Geocode address using Google Geocoding API
 */
const geocodeAddress = async (address) => {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0];
      const location = result.geometry.location;
      
      // Parse address components
      const addressComponents = {};
      result.address_components.forEach(component => {
        if (component.types.includes('street_number') || component.types.includes('route')) {
          addressComponents.street = (addressComponents.street || '') + ' ' + component.long_name;
        }
        if (component.types.includes('locality')) {
          addressComponents.city = component.long_name;
        }
        if (component.types.includes('administrative_area_level_1')) {
          addressComponents.state = component.long_name;
        }
        if (component.types.includes('country')) {
          addressComponents.country = component.long_name;
        }
        if (component.types.includes('postal_code')) {
          addressComponents.postalCode = component.long_name;
        }
      });

      return {
        formattedAddress: result.formatted_address,
        coordinates: {
          lat: location.lat,
          lng: location.lng,
        },
        placeId: result.place_id,
        addressComponents: {
          street: addressComponents.street?.trim() || '',
          city: addressComponents.city || '',
          state: addressComponents.state || '',
          country: addressComponents.country || '',
          postalCode: addressComponents.postalCode || '',
        },
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return null;
  }
};

/**
 * Main function to geocode dealers
 */
const geocodeDealers = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Find dealers without location coordinates
    const dealersWithoutLocation = await Dealer.find({
      $or: [
        { 'location.coordinates.lat': { $exists: false } },
        { 'location.coordinates.lng': { $exists: false } },
        { 'location.coordinates.lat': null },
        { 'location.coordinates.lng': null },
      ],
    }).select('_id code name address location');

    console.log(`📍 Found ${dealersWithoutLocation.length} dealers without location coordinates\n`);

    if (dealersWithoutLocation.length === 0) {
      console.log('✅ All dealers already have location data!');
      process.exit(0);
    }

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < dealersWithoutLocation.length; i++) {
      const dealer = dealersWithoutLocation[i];
      
      console.log(`\n[${i + 1}/${dealersWithoutLocation.length}] Processing: ${dealer.name} (${dealer.code})`);
      
      if (!dealer.address || dealer.address.trim() === '') {
        console.log('⚠️  Skipped - No address available');
        skippedCount++;
        continue;
      }

      console.log(`📍 Address: ${dealer.address}`);
      console.log('🔍 Geocoding...');

      const locationData = await geocodeAddress(dealer.address);

      if (locationData) {
        dealer.location = locationData;
        await dealer.save();
        
        console.log('✅ Success!');
        console.log(`   Coordinates: ${locationData.coordinates.lat}, ${locationData.coordinates.lng}`);
        console.log(`   Formatted: ${locationData.formattedAddress}`);
        console.log(`   Place ID: ${locationData.placeId}`);
        successCount++;
      } else {
        console.log('❌ Failed - Could not geocode address');
        failCount++;
      }

      // Rate limiting - Google has 50 requests per second limit
      // Being conservative with 200ms delay (5 requests per second)
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 GEOCODING SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Dealers Processed: ${dealersWithoutLocation.length}`);
    console.log(`✅ Successfully Geocoded: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`⚠️  Skipped (No Address): ${skippedCount}`);
    console.log('='.repeat(60));

    // Show dealers with location data
    const dealersWithLocation = await Dealer.countDocuments({
      'location.coordinates.lat': { $exists: true, $ne: null },
      'location.coordinates.lng': { $exists: true, $ne: null },
    });

    const totalDealers = await Dealer.countDocuments();
    const percentage = ((dealersWithLocation / totalDealers) * 100).toFixed(1);

    console.log(`\n📈 Overall Statistics:`);
    console.log(`   Dealers with Location: ${dealersWithLocation}/${totalDealers} (${percentage}%)`);
    console.log(`   Dealers without Location: ${totalDealers - dealersWithLocation}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run the script
geocodeDealers();
