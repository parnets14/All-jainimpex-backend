import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

async function testProductsAPI() {
  console.log('🧪 Testing Products API...\n');

  // Test login first
  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'superadmin@jainimpex.com',
      password: 'superadmin123'
    })
  });

  const loginData = await loginResponse.json();
  if (!loginData.success) {
    console.log('❌ Login failed:', loginData.message);
    return;
  }

  const token = loginData.token;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  console.log('✅ Login successful\n');

  // Test the exact same request that's failing in frontend
  console.log('Testing GET /api/products?page=1&limit=10&search=&category=');
  try {
    const response = await fetch(`${BASE_URL}/products?page=1&limit=10&search=&category=`, { headers });
    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      console.log('❌ Products API failed with status:', response.status);
      console.log('Error details:', data);
    } else {
      console.log('✅ Products API successful');
      console.log(`Found ${data.products?.length || 0} products`);
    }
  } catch (error) {
    console.log('❌ Error calling products API:', error.message);
  }
}

testProductsAPI().catch(console.error);