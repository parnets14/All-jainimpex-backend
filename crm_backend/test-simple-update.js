// test-simple-update.js
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

async function testSimpleUpdate() {
  try {
    console.log('🧪 Testing Simple User Update...');
    
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

    // Step 2: Find the nilesh user
    console.log('\n2. Finding nilesh user...');
    const usersResponse = await fetch(`${API_BASE_URL}/users?search=nileshshreejainimpex@outlook.com`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    const usersResult = await usersResponse.json();
    
    if (!usersResponse.ok || !usersResult.success || usersResult.users.length === 0) {
      console.log('❌ Failed to find nilesh user:', usersResult);
      return;
    }

    const nileshUser = usersResult.users.find(u => u.email === 'nileshshreejainimpex@outlook.com');
    if (!nileshUser) {
      console.log('❌ Nilesh user not found in results');
      return;
    }

    console.log('✅ Found nilesh user:', {
      id: nileshUser.id || nileshUser._id,
      name: nileshUser.name,
      email: nileshUser.email,
      role: nileshUser.role
    });

    // Step 3: Update just the name (no password)
    console.log('\n3. Updating user name only...');
    const updateData = {
      name: nileshUser.name + ' (Updated)',
      username: nileshUser.username,
      email: nileshUser.email,
      phone: nileshUser.phone,
      role: nileshUser.role,
      status: nileshUser.status,
      permissions: nileshUser.permissions,
      assignedRegions: nileshUser.assignedRegions || [],
      location: nileshUser.location
      // No password field
    };

    console.log('Sending update request...');

    const updateResponse = await fetch(`${API_BASE_URL}/users/${nileshUser.id || nileshUser._id}`, {
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
      console.log('✅ Name update successful!');
      console.log('Updated user name:', updateResult.user.name);
    } else {
      console.log('❌ Name update failed:', updateResult);
    }

    // Step 4: Update with password
    console.log('\n4. Updating with password...');
    const updateDataWithPassword = {
      ...updateData,
      name: nileshUser.name, // Restore original name
      password: 'testpassword123'
    };

    console.log('Sending password update request...');

    const passwordUpdateResponse = await fetch(`${API_BASE_URL}/users/${nileshUser.id || nileshUser._id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(updateDataWithPassword)
    });

    const passwordUpdateResult = await passwordUpdateResponse.json();

    if (passwordUpdateResponse.ok && passwordUpdateResult.success) {
      console.log('✅ Password update successful!');
      console.log('Updated user name:', passwordUpdateResult.user.name);
    } else {
      console.log('❌ Password update failed:', passwordUpdateResult);
    }

  } catch (error) {
    console.error('❌ Test Error:', error.message);
  }
}

// Run the test
testSimpleUpdate();