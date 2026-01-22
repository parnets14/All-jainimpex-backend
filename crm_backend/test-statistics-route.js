import axios from 'axios';

const testStatisticsRoute = async () => {
  try {
    console.log('🧪 Testing statistics route...');
    
    // Test the statistics endpoint
    const response = await axios.get('http://localhost:5000/api/activity-logs/statistics');
    
    console.log('✅ Statistics route response:', response.status);
    console.log('📊 Statistics data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('✅ Statistics route is working correctly!');
    } else {
      console.log('❌ Statistics route returned success: false');
    }
    
  } catch (error) {
    console.error('❌ Statistics route test failed:');
    console.error('Status:', error.response?.status);
    console.error('Message:', error.response?.data?.message || error.message);
    console.error('Full error:', error.response?.data);
  }
};

// Run the test
testStatisticsRoute();