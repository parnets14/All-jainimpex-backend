// test-nilesh-permissions.js
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

async function testNileshPermissions() {
  try {
    console.log('🧪 Testing Nilesh Permissions...');
    
    // Step 1: Login as nilesh
    console.log('\n1. Logging in as nilesh...');
    const loginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
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

    const loginResult = await loginResponse.json();
    
    if (!loginResponse.ok || !loginResult.success) {
      console.log('❌ Nilesh login failed:', loginResult);
      return;
    }

    console.log('✅ Nilesh login successful');
    console.log('User permissions count:', loginResult.user.permissions.length);
    const token = loginResult.token;

    // Step 2: Test dealer stats API (was failing before)
    console.log('\n2. Testing dealer stats API...');
    try {
      const dealerStatsResponse = await fetch(`${API_BASE_URL}/dealers/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (dealerStatsResponse.ok) {
        const dealerStats = await dealerStatsResponse.json();
        console.log('✅ Dealer stats API successful');
        console.log('Stats received:', !!dealerStats.success);
      } else {
        console.log('❌ Dealer stats API failed:', dealerStatsResponse.status);
        const errorData = await dealerStatsResponse.json();
        console.log('Error:', errorData.message);
      }
    } catch (error) {
      console.log('❌ Dealer stats API error:', error.message);
    }

    // Step 3: Test categories API
    console.log('\n3. Testing categories API...');
    try {
      const categoriesResponse = await fetch(`${API_BASE_URL}/categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (categoriesResponse.ok) {
        console.log('✅ Categories API successful');
      } else {
        console.log('❌ Categories API failed:', categoriesResponse.status);
        const errorData = await categoriesResponse.json();
        console.log('Error:', errorData.message);
      }
    } catch (error) {
      console.log('❌ Categories API error:', error.message);
    }

    // Step 4: Test employees API
    console.log('\n4. Testing employees API...');
    try {
      const employeesResponse = await fetch(`${API_BASE_URL}/employees`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (employeesResponse.ok) {
        console.log('✅ Employees API successful');
      } else {
        console.log('❌ Employees API failed:', employeesResponse.status);
        const errorData = await employeesResponse.json();
        console.log('Error:', errorData.message);
      }
    } catch (error) {
      console.log('❌ Employees API error:', error.message);
    }

    // Step 5: Test user management (should still work)
    console.log('\n5. Testing user management API...');
    try {
      const usersResponse = await fetch(`${API_BASE_URL}/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (usersResponse.ok) {
        console.log('✅ Users API successful');
      } else {
        console.log('❌ Users API failed:', usersResponse.status);
        const errorData = await usersResponse.json();
        console.log('Error:', errorData.message);
      }
    } catch (error) {
      console.log('❌ Users API error:', error.message);
    }

    console.log('\n🎉 Permission testing completed!');

  } catch (error) {
    console.error('❌ Test Error:', error.message);
  }
}

// Run the test
testNileshPermissions();