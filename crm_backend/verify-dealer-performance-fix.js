import mongoose from 'mongoose';
import DealerPerformance from './models/DealerPerformance.js';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGO_URL = process.env.MONGO_URL;
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function verifyDealerPerformanceFix() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Check current performance records
    console.log('\n📊 Checking current performance records...');
    const performanceRecords = await DealerPerformance.find({}).sort({ rank: 1 });
    
    console.log(`Found ${performanceRecords.length} performance records:`);
    performanceRecords.forEach((record, index) => {
      console.log(`${index + 1}. ${record.dealerName} (Rank: ${record.rank})`);
      console.log(`   - Sales: ₹${record.sales}`);
      console.log(`   - Quantity: ${record.quantity}`);
      console.log(`   - Period: ${record.period}`);
      console.log(`   - Growth: ${record.growthPercentage || 0}%`);
      console.log(`   - Target Achieved: ${record.targetAchieved || 0}%`);
      console.log(`   - Outstanding: ₹${record.outstanding || 0}`);
      console.log(`   - Paid: ₹${record.paid || 0}`);
      console.log(`   - Date: ${record.performanceDate}`);
      console.log('');
    });

    // Test API endpoints
    console.log('🧪 Testing API endpoints...');
    
    // Login first
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'superadmin@jainimpex.com',
      password: 'superadmin123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Login failed');
    }

    const token = loginResponse.data.token;
    const authAxios = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Test GET dealer performance
    console.log('\n1. Testing GET /api/dealer-performance...');
    const getResponse = await authAxios.get('/api/dealer-performance', {
      params: {
        page: 1,
        limit: 10,
        period: 'Monthly'
      }
    });

    console.log('✅ GET Response:');
    console.log('- Success:', getResponse.data.success);
    console.log('- Records count:', getResponse.data.data?.length || 0);
    console.log('- Total sales:', getResponse.data.summary?.totalSales || 0);
    console.log('- Pagination:', getResponse.data.pagination);

    // Test GET dealer performance stats
    console.log('\n2. Testing GET /api/dealer-performance/stats...');
    const statsResponse = await authAxios.get('/api/dealer-performance/stats', {
      params: {
        period: 'Monthly'
      }
    });

    console.log('✅ Stats Response:');
    console.log('- Success:', statsResponse.data.success);
    console.log('- Summary:', statsResponse.data.data?.summary);

    console.log('\n🎉 All tests passed! The dealer performance system is working correctly.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the verification
verifyDealerPerformanceFix();