import mongoose from 'mongoose';
import dotenv from 'dotenv';
import express from 'express';

// Load environment variables
dotenv.config();

// Import the discount mapping controller
import { getDiscountMappings } from './controllers/discountMappingController.js';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

const testDiscountMappingsAPIEndpoint = async () => {
  try {
    console.log('🔍 Testing /discount-mappings API Endpoint');
    console.log('=' .repeat(60));

    // Create mock request and response objects
    const mockReq = {
      query: {
        status: 'Approved',
        isActive: true,
        limit: 1000
      }
    };

    const mockRes = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        this.responseData = data;
        return this;
      },
      statusCode: 200,
      responseData: null
    };

    console.log('📡 Calling getDiscountMappings controller...');
    console.log('Request query:', mockReq.query);

    // Call the controller function
    await getDiscountMappings(mockReq, mockRes);

    console.log('\n📊 API Response:');
    console.log('Status Code:', mockRes.statusCode);
    console.log('Response Data:', JSON.stringify(mockRes.responseData, null, 2));

    if (mockRes.statusCode === 200 && mockRes.responseData?.success) {
      const data = mockRes.responseData.data || [];
      console.log(`\n✅ SUCCESS: API returned ${data.length} discount mappings`);
      
      if (data.length > 0) {
        console.log('\n📋 Sample Discount Mapping:');
        const sample = data[0];
        console.log(`- ID: ${sample._id}`);
        console.log(`- Name: ${sample.discountName}`);
        console.log(`- Type: ${sample.discountType}`);
        console.log(`- Mapping Type: ${sample.mappingType}`);
        console.log(`- Target Type: ${sample.targetType}`);
        console.log(`- Direct Discount: ${sample.directDiscountPercentage}%`);
        console.log(`- Max Discount: ${sample.maxDiscountPercentage}%`);
        console.log(`- Status: ${sample.status}`);
        console.log(`- Active: ${sample.isActive}`);
        
        if (sample.brand) {
          console.log(`- Brand: ${sample.brand.name} (${sample.brand._id})`);
        }
        if (sample.category) {
          console.log(`- Category: ${sample.category.name} (${sample.category._id})`);
        }
        if (sample.subcategory) {
          console.log(`- Subcategory: ${sample.subcategory.name} (${sample.subcategory._id})`);
        }
      }
      
      // Filter for sales discounts only
      const salesDiscounts = data.filter(d => d.mappingType === 'sales');
      console.log(`\n🎯 Sales Discounts: ${salesDiscounts.length} out of ${data.length} total`);
      
      if (salesDiscounts.length > 0) {
        console.log('\n💡 Frontend should receive these sales discounts:');
        salesDiscounts.forEach((discount, index) => {
          console.log(`  ${index + 1}. ${discount.discountName} - Max: ${discount.maxDiscountPercentage}%`);
        });
      } else {
        console.log('\n❌ No sales discounts found! This explains the issue.');
      }
      
    } else {
      console.log(`\n❌ API ERROR: Status ${mockRes.statusCode}`);
      console.log('Response:', mockRes.responseData);
    }

  } catch (error) {
    console.error('❌ Error testing API endpoint:', error);
  }
};

const main = async () => {
  await connectDB();
  await testDiscountMappingsAPIEndpoint();
  await mongoose.disconnect();
  console.log('\n🔚 Test completed');
};

main().catch(console.error);