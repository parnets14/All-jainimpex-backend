// test-controller-debug.js
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

async function testControllerDebug() {
  try {
    console.log('🧪 Testing Controller Debug Output...');
    
    // Step 1: Login as super admin
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

    // Step 2: Make a simple update request with password
    console.log('\n2. Making update request with password...');
    
    const updateData = {
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      phone: '1234567890',
      role: 'sales_executive',
      status: 'Active',
      permissions: [],
      assignedRegions: [],
      location: 'Test Location',
      password: 'testpassword123'
    };

    // Use a fake user ID to see if we get the debug output
    const updateResponse = await fetch(`${API_BASE_URL}/users/507f1f77bcf86cd799439011`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(updateData)
    });

    const updateResult = await updateResponse.json();
    console.log('Update response:', updateResult);

  } catch (error) {
    console.error('❌ Test Error:', error.message);
  }
}

// Run the test
testControllerDebug();