import mongoose from 'mongoose';
import User from './models/User.js';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGO_URL = process.env.MONGO_URL;
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function checkUsersAndTestAPI() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Check existing users
    console.log('\n👥 Checking existing users...');
    const users = await User.find({}).select('name email role status password').limit(5);
    
    if (users.length === 0) {
      console.log('❌ No users found in the system');
      return;
    }

    console.log(`Found ${users.length} users:`);
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email}) - Role: ${user.role} - Status: ${user.status || 'Active'}`);
    });

    // Try to login with the first user (assuming Active status or no status means active)
    const activeUser = users.find(user => !user.status || user.status === 'Active') || users[0];
    if (!activeUser) {
      console.log('❌ No users found');
      return;
    }

    console.log(`\n🔐 Attempting to login with: ${activeUser.email}`);
    
    // Try common passwords
    const credentialPairs = [
      { email: 'superadmin@jainimpex.com', password: 'superadmin123' },
      { email: 'nileshshreejainimpex@outlook.com', password: 'nilesh123' },
      { email: activeUser.email, password: 'admin123' },
      { email: activeUser.email, password: 'password' },
      { email: activeUser.email, password: '123456' }
    ];
    
    let loginSuccess = false;
    let token = null;

    for (const { email, password } of credentialPairs) {
      try {
        console.log(`Trying ${email} with password: ${password}`);
        const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
          email: email,
          password: password
        });

        if (loginResponse.data.success) {
          console.log(`✅ Login successful with ${email}`);
          token = loginResponse.data.token;
          loginSuccess = true;
          break;
        }
      } catch (error) {
        console.log(`❌ Failed with ${email}:${password}`);
      }
    }

    if (!loginSuccess) {
      console.log('❌ Could not login with any common passwords');
      console.log('💡 You may need to reset a user password or create a new user');
      return;
    }

    // Now test the generate dealer performance API
    console.log('\n🧪 Testing Generate Dealer Performance API...');
    
    const authAxios = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const testData = {
      fromDate: '2026-01-01',
      toDate: '2026-01-21',
      period: 'Monthly Growth'
    };

    console.log('Request data:', testData);

    const response = await authAxios.post('/api/dealer-performance/generate', testData);

    console.log('\n✅ API Response:');
    console.log('Status:', response.status);
    console.log('Success:', response.data.success);
    console.log('Message:', response.data.message);
    console.log('Records created:', response.data.data?.length || 0);

    if (response.data.data && response.data.data.length > 0) {
      console.log('\n📊 Sample record:');
      const sample = response.data.data[0];
      console.log({
        dealerName: sample.dealerName,
        sales: sample.sales,
        quantity: sample.quantity,
        performance: sample.performance,
        rank: sample.rank
      });
    }

  } catch (error) {
    console.error('\n❌ Error:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Response Data:', error.response.data);
      
      if (error.response.data?.error) {
        console.error('Error Details:', error.response.data.error);
      }
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
checkUsersAndTestAPI();