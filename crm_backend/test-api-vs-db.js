// test-api-vs-db.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

async function testAPIvsDB() {
  try {
    console.log('🧪 Testing API vs Database...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Step 1: Check current state in database
    console.log('\n1. Checking current state in database...');
    const userBefore = await User.findOne({ email: 'nileshshreejainimpex@outlook.com' }).select('+password');
    console.log('Before API call:');
    console.log('- Name:', userBefore.name);
    console.log('- Password hash:', userBefore.password);
    console.log('- Location:', userBefore.location);

    // Step 2: Login as super admin
    console.log('\n2. Logging in as super admin...');
    const loginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        email: 'superadmin@jainimpex.com',
        password: 'superadmin123'
      })
    });

    const loginResult = await loginResponse.json();
    
    if (!loginResponse.ok || !loginResult.success) {
      console.log('❌ Super admin login failed:', loginResult);
      return;
    }

    console.log('✅ Super admin login successful');
    const token = loginResult.token;

    // Step 3: Make API call to update user
    console.log('\n3. Making API call to update user...');
    const updateData = {
      name: userBefore.name,
      username: userBefore.username,
      email: userBefore.email,
      phone: userBefore.phone,
      role: userBefore.role,
      status: userBefore.status,
      permissions: userBefore.permissions,
      assignedRegions: userBefore.assignedRegions || [],
      location: 'Updated Location', // Change location to see if update works
      password: 'newpassword123' // Change password
    };

    console.log('Sending update request...');
    const updateResponse = await fetch(`${API_BASE_URL}/users/${userBefore._id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(updateData)
    });

    const updateResult = await updateResponse.json();
    console.log('API response:', updateResult.success ? 'Success' : 'Failed');
    if (!updateResult.success) {
      console.log('Error:', updateResult.message);
    }

    // Step 4: Check state in database after API call
    console.log('\n4. Checking state in database after API call...');
    const userAfter = await User.findOne({ email: 'nileshshreejainimpex@outlook.com' }).select('+password');
    console.log('After API call:');
    console.log('- Name:', userAfter.name);
    console.log('- Password hash:', userAfter.password);
    console.log('- Location:', userAfter.location);
    
    console.log('\nChanges detected:');
    console.log('- Name changed:', userBefore.name !== userAfter.name);
    console.log('- Password hash changed:', userBefore.password !== userAfter.password);
    console.log('- Location changed:', userBefore.location !== userAfter.location);

    // Step 5: Test password
    if (userBefore.password !== userAfter.password) {
      console.log('\n5. Testing new password...');
      const isNewValid = await userAfter.comparePassword('newpassword123');
      console.log('New password "newpassword123" valid:', isNewValid);
      
      // Restore original password
      console.log('\n6. Restoring original state...');
      userAfter.password = 'nilesh123';
      userAfter.location = userBefore.location;
      await userAfter.save();
      console.log('✅ Original state restored');
    } else {
      console.log('\n❌ Password was not updated by API call');
    }

  } catch (error) {
    console.error('❌ Test Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testAPIvsDB();