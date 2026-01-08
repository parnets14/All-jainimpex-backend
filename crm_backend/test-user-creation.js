// test-user-creation.js
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

async function testUserCreation() {
  try {
    console.log('🧪 Testing User Creation Flow...');
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

    // Step 2: Create a new test user
    console.log('\n2. Creating a new test user...');
    const newUser = {
      name: 'Test User',
      username: 'testuser123',
      email: 'testuser@jainimpex.com',
      password: 'testpass123',
      phone: '+91-9999999999',
      role: 'admin',
      status: 'Active',
      permissions: [
        'dashboard.view',
        'users.manage',
        'product.master',
        'dealer.master'
      ],
      assignedRegions: [],
      location: 'Test Location'
    };

    console.log('Creating user with data:', {
      ...newUser,
      password: '[HIDDEN]'
    });

    const createResponse = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(newUser)
    });

    const createResult = await createResponse.json();

    if (createResponse.ok && createResult.success) {
      console.log('✅ User created successfully!');
      console.log('Created user:', {
        id: createResult.user.id || createResult.user._id,
        name: createResult.user.name,
        email: createResult.user.email,
        role: createResult.user.role,
        status: createResult.user.status
      });

      // Step 3: Test login with the new user
      console.log('\n3. Testing login with new user...');
      const newUserLoginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password
        })
      });

      const newUserLoginResult = await newUserLoginResponse.json();

      if (newUserLoginResponse.ok && newUserLoginResult.success) {
        console.log('✅ New user login successful!');
        console.log('New user data:', {
          name: newUserLoginResult.user.name,
          email: newUserLoginResult.user.email,
          role: newUserLoginResult.user.role,
          permissions: newUserLoginResult.user.permissions
        });

        // Step 4: Clean up - delete the test user
        console.log('\n4. Cleaning up - deleting test user...');
        const deleteResponse = await fetch(`${API_BASE_URL}/users/${createResult.user.id || createResult.user._id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        const deleteResult = await deleteResponse.json();

        if (deleteResponse.ok && deleteResult.success) {
          console.log('✅ Test user deleted successfully');
        } else {
          console.log('⚠️  Failed to delete test user:', deleteResult);
        }
      } else {
        console.log('❌ New user login failed:', newUserLoginResult);
      }
    } else {
      console.log('❌ User creation failed:', createResult);
      
      // Check if it's a duplicate user error
      if (createResult.message && createResult.message.includes('already exists')) {
        console.log('\n🔄 User already exists, trying to delete and recreate...');
        
        // Try to find and delete existing user
        const usersResponse = await fetch(`${API_BASE_URL}/users?search=${newUser.email}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        const usersResult = await usersResponse.json();
        
        if (usersResult.success && usersResult.users.length > 0) {
          const existingUser = usersResult.users.find(u => u.email === newUser.email);
          if (existingUser) {
            console.log('Found existing user, deleting...');
            const deleteResponse = await fetch(`${API_BASE_URL}/users/${existingUser.id || existingUser._id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              credentials: 'include'
            });

            if (deleteResponse.ok) {
              console.log('✅ Existing user deleted, you can try creating again');
            }
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ User Creation Test Error:', error.message);
  }
}

// Run the test
testUserCreation();