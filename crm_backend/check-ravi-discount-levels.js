// Check Ravi's discount levels in database
import mongoose from 'mongoose';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const checkRaviDiscountLevels = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    // Find Ravi's user account
    const ravi = await User.findOne({ email: 'admin@gmail.com' });
    
    if (!ravi) {
      console.log('❌ User not found with email: admin@gmail.com');
      return;
    }

    console.log('\n📋 Ravi\'s User Details:');
    console.log('Name:', ravi.name);
    console.log('Email:', ravi.email);
    console.log('Role:', ravi.role);
    console.log('Status:', ravi.status);
    console.log('\n🎯 Allowed Discount Levels:');
    
    if (!ravi.allowedDiscountLevels || ravi.allowedDiscountLevels.length === 0) {
      console.log('❌ NO DISCOUNT LEVELS ASSIGNED');
      console.log('Field value:', ravi.allowedDiscountLevels);
    } else {
      console.log('✅ Discount Levels Found:');
      ravi.allowedDiscountLevels.forEach((level, index) => {
        console.log(`  ${index + 1}. ${level}`);
      });
    }

    console.log('\n📄 Full User Object (relevant fields):');
    console.log(JSON.stringify({
      _id: ravi._id,
      name: ravi.name,
      email: ravi.email,
      role: ravi.role,
      allowedDiscountLevels: ravi.allowedDiscountLevels,
      permissions: ravi.permissions
    }, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
};

checkRaviDiscountLevels();
