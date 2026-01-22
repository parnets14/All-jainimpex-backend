import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const testPreviewAPIEndpoint = async () => {
  try {
    console.log('🔍 Testing Preview Bulk Changes API Endpoint...');

    // Test data - using the Cera cp fittings category
    const requestData = {
      filters: {
        categoryId: '6968f3665eb9746eb301e705' // Cera cp fittings category ID from our test
      },
      changeType: 'increase_percentage',
      changeValue: 10
    };

    console.log('\n📋 Request Data:');
    console.log(JSON.stringify(requestData, null, 2));

    // Make API call to the backend
    const response = await axios.post('http://localhost:5000/api/dealer-pricing/preview-bulk-changes', requestData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('\n📊 API Response:');
    console.log('Status:', response.status);
    console.log('Success:', response.data.success);
    
    if (response.data.success) {
      const data = response.data.data;
      console.log('\n✅ Preview Data:');
      console.log('Total Products:', data.totalProducts);
      console.log('Total Current Value:', data.summary.totalCurrentValue);
      console.log('Total New Value:', data.summary.totalNewValue);
      console.log('Total Change:', data.summary.totalChange);
      
      console.log('\n📋 Affected Products:');
      data.affectedProducts.forEach((product, index) => {
        console.log(`${index + 1}. ${product.productName} (${product.productCode})`);
        console.log(`   Current: ₹${product.currentPrice} → New: ₹${product.newPrice} (Change: ₹${product.change})`);
      });
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

testPreviewAPIEndpoint();