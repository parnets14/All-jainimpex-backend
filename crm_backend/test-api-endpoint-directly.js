import mongoose from 'mongoose';
import dotenv from 'dotenv';
import express from 'express';
import Dealer from './models/Dealer.js';
import { getDealerAccessibleProducts } from './controllers/dealerController.js';

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testAPIEndpointDirectly = async () => {
  try {
    await connectDB();
    
    console.log('\n' + '='.repeat(80));
    console.log('🧪 TESTING API ENDPOINT DIRECTLY');
    console.log('='.repeat(80));
    
    // 1. Find Suman dealer
    console.log('\n👤 Step 1: Finding Suman Dealer...');
    const sumanDealer = await Dealer.findOne({ name: /suman/i });
    
    if (!sumanDealer) {
      console.log('❌ Suman dealer not found');
      return;
    }
    
    console.log('✅ Found dealer:', sumanDealer.name, `(${sumanDealer._id})`);
    
    // 2. Create mock request and response objects
    console.log('\n🔧 Step 2: Creating Mock Request/Response...');
    
    const mockReq = {
      params: { id: sumanDealer._id.toString() },
      query: {
        page: 1,
        limit: 50,
        sortBy: 'itemName',
        sortOrder: 'asc'
      }
    };
    
    let responseData = null;
    let responseStatus = 200;
    
    const mockRes = {
      json: (data) => {
        responseData = data;
        console.log('📤 API Response received');
      },
      status: (code) => {
        responseStatus = code;
        return mockRes;
      }
    };
    
    // 3. Call the actual API controller
    console.log('\n🚀 Step 3: Calling getDealerAccessibleProducts API...');
    console.log('📋 Request params:', mockReq.params);
    console.log('📋 Request query:', mockReq.query);
    
    await getDealerAccessibleProducts(mockReq, mockRes);
    
    // 4. Analyze the response
    console.log('\n📊 Step 4: Analyzing API Response...');
    console.log('📈 Response Status:', responseStatus);
    
    if (responseData) {
      console.log('✅ API Response Structure:');
      console.log(`  - success: ${responseData.success}`);
      console.log(`  - products: ${responseData.products?.length || 0}`);
      console.log(`  - dealerInfo: ${responseData.dealerInfo ? 'Present' : 'Missing'}`);
      console.log(`  - pagination: ${responseData.pagination ? 'Present' : 'Missing'}`);
      
      if (responseData.dealerInfo) {
        console.log('\n👤 Dealer Info:');
        console.log(`  - dealerId: ${responseData.dealerInfo.dealerId}`);
        console.log(`  - dealerName: ${responseData.dealerInfo.dealerName}`);
        console.log(`  - allowedBrands: ${responseData.dealerInfo.allowedBrands}`);
        console.log(`  - allowedCategories: ${responseData.dealerInfo.allowedCategories}`);
        console.log(`  - allowedSubcategories: ${responseData.dealerInfo.allowedSubcategories}`);
        console.log(`  - allowedExtended: ${responseData.dealerInfo.allowedExtended}`);
      }
      
      if (responseData.products && responseData.products.length > 0) {
        console.log('\n📦 Products:');
        responseData.products.forEach((product, index) => {
          console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
        });
        
        console.log('\n✅ SUCCESS: API is returning products correctly!');
        console.log('🎯 This means the backend is working fine.');
        console.log('🔍 The issue must be in the frontend integration.');
      } else {
        console.log('\n❌ ISSUE: API is not returning any products');
        console.log('🔍 This indicates a backend problem');
      }
      
      if (responseData.pagination) {
        console.log('\n📄 Pagination:');
        console.log(`  - currentPage: ${responseData.pagination.currentPage}`);
        console.log(`  - totalPages: ${responseData.pagination.totalPages}`);
        console.log(`  - totalItems: ${responseData.pagination.totalItems}`);
      }
      
      if (responseData.debug) {
        console.log('\n🐛 Debug Info:');
        console.log(`  - hierarchyFilterApplied: ${responseData.debug.hierarchyFilterApplied}`);
        console.log(`  - fallbackToAllProducts: ${responseData.debug.fallbackToAllProducts}`);
      }
      
    } else {
      console.log('❌ No response data received');
    }
    
    // 5. Test with different query parameters
    console.log('\n🧪 Step 5: Testing with Search Parameter...');
    
    const searchReq = {
      params: { id: sumanDealer._id.toString() },
      query: {
        page: 1,
        limit: 50,
        search: 'wire',
        sortBy: 'itemName',
        sortOrder: 'asc'
      }
    };
    
    let searchResponseData = null;
    const searchRes = {
      json: (data) => { searchResponseData = data; },
      status: (code) => searchRes
    };
    
    await getDealerAccessibleProducts(searchReq, searchRes);
    
    if (searchResponseData && searchResponseData.products) {
      console.log(`🔍 Search for 'wire': ${searchResponseData.products.length} products found`);
      searchResponseData.products.forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
      });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🏁 API ENDPOINT TEST COMPLETE');
    console.log('='.repeat(80));
    
    if (responseData && responseData.success && responseData.products && responseData.products.length > 0) {
      console.log('\n✅ CONCLUSION: Backend API is working correctly');
      console.log('🎯 The issue is likely in the frontend:');
      console.log('   1. Check Sales Order Dashboard API call');
      console.log('   2. Check how response is handled');
      console.log('   3. Check if there are any frontend filters');
      console.log('   4. Check console errors in browser');
    } else {
      console.log('\n❌ CONCLUSION: Backend API has an issue');
      console.log('🔍 Need to debug the backend controller');
    }
    
  } catch (error) {
    console.error('❌ Error in API test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

testAPIEndpointDirectly();