import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const simulateFrontendAPICall = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Start the actual backend server
    console.log('🚀 Starting backend server...');
    
    // Import and start the server
    const { default: app } = await import('./server.js');
    
    // Wait a bit for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('📡 Server should be running on port 5000');
    
    // Test the API calls that frontend makes
    console.log('\n🧪 Testing Frontend API Calls...');
    
    // Simulate login first to get token
    console.log('1. Simulating login...');
    
    try {
      const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'admin@jaininpex.com', // Use a known admin email
          password: 'admin123' // Use a known password
        })
      });
      
      const loginData = await loginResponse.json();
      console.log('   Login Status:', loginResponse.status);
      
      if (loginData.success && loginData.token) {
        const token = loginData.token;
        console.log('   ✅ Login successful, got token');
        
        // Test sales analytics API
        console.log('\n2. Testing sales analytics API...');
        
        const productId = '6979b839be2f2eaac8767ccd';
        const apiUrl = `http://localhost:5000/api/sales-analytics/product-details?productId=${productId}&period=30days`;
        
        const analyticsResponse = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        const analyticsData = await analyticsResponse.json();
        console.log('   Analytics Status:', analyticsResponse.status);
        console.log('   Analytics Data:', JSON.stringify(analyticsData, null, 2));
        
        if (analyticsData.success) {
          console.log(`   ✅ 30-Day Sales: ${analyticsData.data.oneMonthSales || 0}`);
        } else {
          console.log('   ❌ Analytics API failed:', analyticsData.message);
        }
        
      } else {
        console.log('   ❌ Login failed:', loginData.message);
      }
      
    } catch (error) {
      console.error('   ❌ API call error:', error.message);
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Test Complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

simulateFrontendAPICall();