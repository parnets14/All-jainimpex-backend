import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const testDirectDiscountAPI = async () => {
  try {
    console.log('🔍 Testing Direct Discount Update API...');

    // Test the update discount info API endpoint
    console.log('\n🚀 Calling /api/dealer-pricing/update-discount-info...');
    
    const response = await axios.post('http://localhost:5000/api/dealer-pricing/update-discount-info', {}, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('\n📊 API Response:');
    console.log('Status:', response.status);
    console.log('Success:', response.data.success);
    console.log('Message:', response.data.message);
    console.log('Updated Count:', response.data.updatedCount);

    if (response.data.success) {
      console.log('\n✅ Direct Discount Update API Success!');
      console.log(`📊 Updated ${response.data.updatedCount} products`);
      console.log('\n🎯 This should now include:');
      console.log('   - Existing DealerPricing records (updated)');
      console.log('   - New DealerPricing records (created from Rate Slabs)');
      console.log('   - Direct discount information for ALL products');
    } else {
      console.log('❌ API Error:', response.data.message);
    }

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error Response:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('❌ No response received:', error.message);
      console.log('💡 Make sure the backend server is running on http://localhost:5000');
    } else {
      console.error('❌ Request setup error:', error.message);
    }
  }
};

testDirectDiscountAPI();