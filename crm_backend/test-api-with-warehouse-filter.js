import axios from 'axios';

async function testAPIWithWarehouseFilter() {
  try {
    console.log('🔍 Testing Detailed Analytics API with warehouse filter');
    
    const response = await axios.get('http://localhost:5000/api/sales-analytics/product-details', {
      params: {
        productId: '6979b839be2f2eaac8767ccd',
        warehouseId: '68e8f0283f5fd5a817866df6',
        period: '30days'
      },
      headers: {
        'Cookie': 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGRiNzIwOWJmN2I1YmFlY2U0YTIwYWEiLCJpYXQiOjE3Mzg0NzE4NzQsImV4cCI6MTczOTA3NjY3NH0.example'
      }
    });
    
    console.log('✅ API Response:', response.data);
    console.log('30-day sales:', response.data.data.oneMonthSales);
    
  } catch (error) {
    console.error('❌ API Error:', error.response?.data || error.message);
  }
}

testAPIWithWarehouseFilter();