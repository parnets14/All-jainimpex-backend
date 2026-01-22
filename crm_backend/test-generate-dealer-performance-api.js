import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function testGenerateDealerPerformanceAPI() {
  try {
    console.log('🧪 Testing Generate Dealer Performance API...');
    console.log(`Base URL: ${BASE_URL}`);

    // First, login to get authentication token
    console.log('\n1. Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@jaininpex.com',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Login failed: ' + loginResponse.data.message);
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful');

    // Set up axios with auth header
    const authAxios = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Test the generate dealer performance endpoint
    console.log('\n2. Testing Generate Dealer Performance API...');
    
    const testData = {
      fromDate: '2025-01-01',
      toDate: '2025-01-21',
      period: 'Monthly'
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
    console.error('\n❌ Error testing API:');
    
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
  }
}

// Run the test
testGenerateDealerPerformanceAPI();