import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const testClaimTypesAPI = async () => {
  try {
    const BASE_URL = 'http://localhost:5000/api/se';
    
    console.log('🔐 Testing Claim Types API...\n');
    
    // Note: You'll need to replace these with actual credentials
    console.log('1. Logging in as sales executive...');
    console.log('   (Update phone and password in the script if needed)\n');
    
    try {
      const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
        phone: '9876543210', // Replace with actual sales executive phone
        password: 'password123' // Replace with actual password
      });
      
      const token = loginResponse.data.token;
      console.log('✅ Login successful\n');
      
      // Test claim types endpoint
      console.log('2. Fetching claim types...');
      const typesResponse = await axios.get(`${BASE_URL}/expenses/types`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      console.log('✅ Claim types fetched successfully!\n');
      console.log('Response structure:', Object.keys(typesResponse.data));
      console.log('\nFull Response:', JSON.stringify(typesResponse.data, null, 2));
      
      if (typesResponse.data.claimTypes) {
        console.log(`\n📋 Found ${typesResponse.data.claimTypes.length} claim types:`);
        typesResponse.data.claimTypes.forEach((type, index) => {
          const maxAmount = type.maxAmount ? ` (Max: ₹${type.maxAmount})` : ' (No limit)';
          console.log(`${index + 1}. ${type.name}${maxAmount}`);
          if (type.description) {
            console.log(`   Description: ${type.description}`);
          }
        });
      } else {
        console.log('⚠️  Warning: Response does not contain "claimTypes" field');
        console.log('   Mobile app expects: response.claimTypes');
      }
      
    } catch (loginError) {
      if (loginError.response?.status === 401) {
        console.log('❌ Login failed: Invalid credentials');
        console.log('   Please update phone and password in the script');
      } else {
        throw loginError;
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Tip: Make sure the backend server is running:');
      console.log('   cd JainInpexCRMBackend/crm_backend');
      console.log('   npm start');
    }
  }
};

testClaimTypesAPI();
