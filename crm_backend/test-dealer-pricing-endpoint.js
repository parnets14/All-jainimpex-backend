import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const testDealerPricingEndpoint = async () => {
  try {
    console.log('🔍 Testing Dealer Pricing API Endpoint...');

    // Test the basic endpoint
    console.log('\n🚀 Calling /api/dealer-pricing...');
    
    const response = await axios.get('http://localhost:5000/api/dealer-pricing?limit=10', {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('\n📊 API Response:');
    console.log('Status:', response.status);
    console.log('Success:', response.data.success);
    console.log('Data count:', response.data.data?.length || 0);
    console.log('Pagination:', response.data.pagination);

    if (response.data.success) {
      console.log('\n✅ Dealer Pricing API Success!');
      console.log(`📊 Found ${response.data.data.length} pricing records`);
    } else {
      console.log('❌ API Error:', response.data.message);
    }

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error Response:', error.response.status);
      console.error('Error details:', error.response.data);
    } else if (error.request) {
      console.error('❌ No response received:', error.message);
      console.log('💡 Make sure the backend server is running on http://localhost:5000');
    } else {
      console.error('❌ Request setup error:', error.message);
    }
  }
};

testDealerPricingEndpoint();