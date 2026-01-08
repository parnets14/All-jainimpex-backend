// test-api-login.js
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

async function testAPILogin() {
  try {
    console.log('🧪 Testing API Login...');
    console.log('API Base URL:', API_BASE_URL);
    
    // Test server health first
    console.log('\n1. Testing server health...');
    try {
      const healthResponse = await fetch(`${API_BASE_URL}/`);
      const healthData = await healthResponse.json();
      console.log('✅ Server is running:', healthData.message);
    } catch (healthError) {
      console.log('❌ Server health check failed:', healthError.message);
      return;
    }

    // Test login with super admin
    console.log('\n2. Testing super admin login...');
    await testLogin('superadmin@jainimpex.com', 'superadmin123', 'Super Admin');

    // Test login with nilesh user
    console.log('\n3. Testing nilesh user login...');
    await testLogin('nileshshreejainimpex@outlook.com', 'nilesh123', 'Nilesh User');

  } catch (error) {
    console.error('❌ API Test Error:', error.message);
  }
}

async function testLogin(email, password, userType) {
  try {
    const loginData = { email, password };
    console.log(`Login payload for ${userType}:`, loginData);

    const loginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(loginData)
    });

    const loginResult = await loginResponse.json();

    if (loginResponse.ok && loginResult.success) {
      console.log(`✅ ${userType} Login successful!`);
      console.log('Response status:', loginResponse.status);
      console.log('User data:', {
        name: loginResult.user.name,
        email: loginResult.user.email,
        role: loginResult.user.role,
        status: loginResult.user.status,
        permissions: loginResult.user.permissions
      });
      
      const token = loginResult.token;
      console.log('Token received:', !!token);
      console.log('Token length:', token ? token.length : 0);

      // Test authenticated request
      if (token) {
        console.log(`Testing authenticated request for ${userType}...`);
        
        const userResponse = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        const userData = await userResponse.json();

        if (userResponse.ok) {
          console.log(`✅ ${userType} authenticated request successful!`);
          console.log('Authenticated user:', userData.user.name);
        } else {
          console.log(`❌ ${userType} authenticated request failed:`, userData);
        }
      }
    } else {
      console.log(`❌ ${userType} Login failed:`, loginResult);
    }
  } catch (error) {
    console.error(`❌ ${userType} Login error:`, error.message);
  }
}

// Run the test
testAPILogin();