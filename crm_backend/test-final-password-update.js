// test-final-password-update.js
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

async function testFinalPasswordUpdate() {
  try {
    console.log('🧪 Final Password Update Test...');
    console.log('API Base URL:', API_BASE_URL);
    
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

    // Step 3: Update password
    console.log('\n3. Updating password to "testpassword123"...');
    const newPassword = 'testpassword123';
    const updateData = {
      name: nileshUser.name,
      username: nileshUser.username,
      email: nileshUser.email,
      phone: nileshUser.phone,
      role: nileshUser.role,
      status: nileshUser.status,
      permissions: nileshUser.permissions,
      assignedRegions: nileshUser.assignedRegions || [],
      location: nileshUser.location,
      password: newPassword
    };

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
      console.log('✅ Password update successful!');

      // Step 4: Test login with new password
      console.log('\n4. Testing login with new password...');
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
        console.log('Logged in user:', newLoginResult.user.name);

        // Step 5: Test login with old password (should fail)
        console.log('\n5. Testing login with old password (should fail)...');
        const oldLoginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            email: 'nileshshreejainimpex@outlook.com',
            password: 'nilesh123'
          })
        });

        const oldLoginResult = await oldLoginResponse.json();

        if (!oldLoginResponse.ok || !oldLoginResult.success) {
          console.log('✅ Old password correctly rejected:', oldLoginResult.message);
        } else {
          console.log('⚠️  Old password still works - this is unexpected!');
        }

        // Step 6: Restore original password
        console.log('\n6. Restoring original password...');
        const restoreData = {
          ...updateData,
          password: 'nilesh123'
        };

        const restoreResponse = await fetch(`${API_BASE_URL}/users/${nileshUser.id || nileshUser._id}`, {
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
          console.log('\n🎉 Password update functionality is working correctly!');
        } else {
          console.log('⚠️  Failed to restore original password:', restoreResult);
        }
      } else {
        console.log('❌ Login with new password failed:', newLoginResult);
        console.log('This indicates the password was not updated correctly.');
      }
    } else {
      console.log('❌ Password update failed:', updateResult);
    }

  } catch (error) {
    console.error('❌ Test Error:', error.message);
  }
}

// Run the test
testFinalPasswordUpdate();