import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const testExpenseAPI = async () => {
  try {
    const BASE_URL = 'http://localhost:5000/api/se';
    
    console.log('🔐 Testing Expense Types API...\n');
    
    // First, login to get a token
    console.log('1. Logging in as sales executive...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      phone: '9876543210', // Replace with actual sales executive phone
      password: 'password123' // Replace with actual password
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful\n');
    
    // Test expense types endpoint
    console.log('2. Fetching expense types...');
    const typesResponse = await axios.get(`${BASE_URL}/expenses/types`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    console.log('✅ Expense types fetched successfully!\n');
    console.log('Response:', JSON.stringify(typesResponse.data, null, 2));
    
    if (typesResponse.data.expenseTypes) {
      console.log(`\n📋 Found ${typesResponse.data.expenseTypes.length} expense types:`);
      typesResponse.data.expenseTypes.forEach((type, index) => {
        console.log(`${index + 1}. ${type.name} (${type._id})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
};

testExpenseAPI();
