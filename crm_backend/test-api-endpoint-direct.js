import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Import the sales analytics routes
import salesAnalyticsRoutes from './routes/salesAnalyticsRoutes.js';

dotenv.config();

const testAPI = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Create a mock Express app
    const app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    const mockAuth = (req, res, next) => {
      req.user = { _id: 'test-user-id' };
      next();
    };
    
    // Use the sales analytics routes with mock auth
    app.use('/api/sales-analytics', mockAuth, salesAnalyticsRoutes);
    
    const server = app.listen(3001, () => {
      console.log('🚀 Test server running on port 3001');
    });
    
    // Test the API endpoints
    console.log('\n🧪 Testing API Endpoints...');
    
    // Test 1: Product details endpoint
    const productId = '6979b839be2f2eaac8767ccd';
    console.log(`\n1. Testing /api/sales-analytics/product-details?productId=${productId}&period=30days`);
    
    try {
      const response = await fetch(`http://localhost:3001/api/sales-analytics/product-details?productId=${productId}&period=30days`);
      const data = await response.json();
      console.log('   Response Status:', response.status);
      console.log('   Response Data:', JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('   Error:', error.message);
    }
    
    // Test 2: Multiple products endpoint
    console.log(`\n2. Testing /api/sales-analytics/products?productIds=${productId}&period=30days`);
    
    try {
      const response = await fetch(`http://localhost:3001/api/sales-analytics/products?productIds=${productId}&period=30days`);
      const data = await response.json();
      console.log('   Response Status:', response.status);
      console.log('   Response Data:', JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('   Error:', error.message);
    }
    
    // Close server and database
    setTimeout(async () => {
      server.close();
      await mongoose.disconnect();
      console.log('\n✅ Test Complete!');
      process.exit(0);
    }, 2000);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

testAPI();