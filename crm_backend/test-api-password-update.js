// test-api-password-update.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

async function testAPIPasswordUpdate() {
  try {
    console.log('🧪 Testing API Password Update with Database Verification...');
    
    // Connect to MongoDB to check database directly
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Step 1: Login as super admin
    console.log('\n1. Logging in as super admin...');
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

    // Step 2: Check current password hash in database
    console.log('\n2. Checking current password hash in database...');
    const userBefore = await User.findOne({ email: 'nileshshreejainimpex@outlook.com' }).select('+password');
    console.log('Current password hash:', userBefore.password);
    
    // Test current password
    const isCurrentValid = await userBefore.comparePassword('nilesh123');
    console.log('Current password "nilesh123" valid:', isCurrentValid);

    // Step 3: Update password via API
    console.log('\n3. Updating password via API...');
    const newPassword = 'newpassword123';
    const updateData = {
      name: userBefore.name,
      username: userBefore.username,
      email: userBefore.email,
      phone: userBefore.phone,
      role: userBefore.role,
      status: userBefore.status,
      permissions: userBefore.permissions,
      assignedRegions: userBefore.assignedRegions || [],
      location: userBefore.location,
      password: newPassword
    };

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

    if (updateResponse.ok && updateResult.success) {
      console.log('✅ API Password update successful!');
      
      // Step 4: Check password hash in database after update
      console.log('\n4. Checking password hash in database after update...');
      const userAfter = await User.findOne({ email: 'nileshshreejainimpex@outlook.com' }).select('+password');
      console.log('New password hash:', userAfter.password);
      console.log('Password hash changed:', userBefore.password !== userAfter.password);
      
      // Test new password directly in database
      const isNewValidDB = await userAfter.comparePassword(newPassword);
      console.log('New password "newpassword123" valid in DB:', isNewValidDB);
      
      // Test old password directly in database
      const isOldValidDB = await userAfter.comparePassword('nilesh123');
      console.log('Old password "nilesh123" valid in DB:', isOldValidDB);

      // Step 5: Test login with new password via API
      console.log('\n5. Testing login with new password via API...');
      const newLoginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          email: 'nileshshreejainimpex@outlook.com',
          password: newPassword
        })
      });

      const newLoginResult = await newLoginResponse.json();

      if (newLoginResponse.ok && newLoginResult.success) {
        console.log('✅ Login with new password successful!');
      } else {
        console.log('❌ Login with new password failed:', newLoginResult);
        
        // Additional debugging - check what the login API is comparing
        console.log('\n🔍 Additional debugging...');
        const loginUser = await User.findOne({ email: 'nileshshreejainimpex@outlook.com' }).select('+password');
        console.log('User found for login:', !!loginUser);
        console.log('User status:', loginUser?.status);
        console.log('Password comparison result:', await loginUser?.comparePassword(newPassword));
      }

      // Step 6: Restore original password
      console.log('\n6. Restoring original password...');
      const restoreData = {
        ...updateData,
        password: 'nilesh123'
      };

      const restoreResponse = await fetch(`${API_BASE_URL}/users/${userBefore._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(restoreData)
      });

      const restoreResult = await restoreResponse.json();

      if (restoreResponse.ok && restoreResult.success) {
        console.log('✅ Original password restored successfully!');
      } else {
        console.log('⚠️  Failed to restore original password:', restoreResult);
      }
    } else {
      console.log('❌ API Password update failed:', updateResult);
    }

  } catch (error) {
    console.error('❌ Test Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testAPIPasswordUpdate();