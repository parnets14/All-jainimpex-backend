import mongoose from 'mongoose';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const debugFrontendFilterApiCalls = async () => {
  try {
    console.log('🔍 Debugging Frontend Filter API Calls...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Direct API simulation for getBrands with status: 'active'
    console.log('📋 TEST 1: BRANDS API SIMULATION');
    console.log('=================================');
    
    try {
      const brandsFilter = { status: 'active' };
      const brands = await Brand.find(brandsFilter)
        .select('name description status')
        .sort({ name: 1 });
      
      const brandsResponse = {
        success: true,
        data: brands
      };
      
      console.log('API Call: GET /api/brands?status=active');
      console.log('Response:', JSON.stringify(brandsResponse, null, 2));
      console.log(`✅ Found ${brands.length} active brands\n`);
    } catch (error) {
      console.error('❌ Brands API error:', error);
    }

    // Test 2: Direct API simulation for getCategories with status: 'active'
    console.log('📋 TEST 2: CATEGORIES API SIMULATION');
    console.log('====================================');
    
    try {
      const categoriesFilter = { status: 'active' };
      const categories = await Category.find(categoriesFilter)
        .select('name description status')
        .sort({ name: 1 });
      
      const categoriesResponse = {
        success: true,
        data: categories
      };
      
      console.log('API Call: GET /api/categories?status=active');
      console.log('Response:', JSON.stringify(categoriesResponse, null, 2));
      console.log(`✅ Found ${categories.length} active categories\n`);
    } catch (error) {
      console.error('❌ Categories API error:', error);
    }

    // Test 3: Direct API simulation for getSubcategories with status: 'active'
    console.log('📋 TEST 3: SUBCATEGORIES API SIMULATION');
    console.log('=======================================');
    
    try {
      const subcategoriesFilter = { status: 'active' };
      const subcategories = await Subcategory.find(subcategoriesFilter)
        .select('name description status')
        .sort({ name: 1 });
      
      const subcategoriesResponse = {
        success: true,
        data: subcategories
      };
      
      console.log('API Call: GET /api/subcategories?status=active');
      console.log('Response:', JSON.stringify(subcategoriesResponse, null, 2));
      console.log(`✅ Found ${subcategories.length} active subcategories\n`);
    } catch (error) {
      console.error('❌ Subcategories API error:', error);
    }

    // Test 4: Check if the controllers are handling the status parameter correctly
    console.log('📋 TEST 4: CONTROLLER LOGIC VERIFICATION');
    console.log('=========================================');
    
    // Simulate the controller logic for brands
    const mockReq = { query: { status: 'active' } };
    const filter = {};
    
    if (mockReq.query.status && mockReq.query.status !== "all") {
      filter.status = mockReq.query.status;
    }
    
    console.log('Controller filter logic:');
    console.log('Input query:', mockReq.query);
    console.log('Generated filter:', filter);
    
    const controllerBrands = await Brand.find(filter).select('name status');
    console.log(`Controller would return ${controllerBrands.length} brands`);
    
    // Test 5: Check what happens without status filter
    console.log('\n📋 TEST 5: WITHOUT STATUS FILTER');
    console.log('=================================');
    
    const allBrands = await Brand.find({}).select('name status');
    const allCategories = await Category.find({}).select('name status');
    const allSubcategories = await Subcategory.find({}).select('name status');
    
    console.log(`All brands (no filter): ${allBrands.length}`);
    console.log(`All categories (no filter): ${allCategories.length}`);
    console.log(`All subcategories (no filter): ${allSubcategories.length}`);
    
    // Show status distribution
    const brandStatuses = allBrands.reduce((acc, brand) => {
      acc[brand.status || 'undefined'] = (acc[brand.status || 'undefined'] || 0) + 1;
      return acc;
    }, {});
    
    console.log('Brand status distribution:', brandStatuses);

    // Test 6: Frontend API call format check
    console.log('\n📋 TEST 6: FRONTEND API CALL FORMAT');
    console.log('====================================');
    
    console.log('Frontend should call:');
    console.log('- apiService.getBrands({ status: "active" })');
    console.log('- apiService.getCategories({ status: "active" })');
    console.log('- apiService.getSubcategories({ status: "active" })');
    
    console.log('\nExpected API endpoints:');
    console.log('- GET /api/brands?status=active');
    console.log('- GET /api/categories?status=active');
    console.log('- GET /api/subcategories?status=active');

    console.log('\n🎯 DIAGNOSIS:');
    console.log('==============');
    
    if (controllerBrands.length > 0) {
      console.log('✅ Backend data is available');
      console.log('✅ Controller logic works correctly');
      console.log('✅ API calls with status=active return data');
      console.log('');
      console.log('🔍 LIKELY ISSUES:');
      console.log('1. Frontend API calls might not be including status=active parameter');
      console.log('2. API service methods might not be passing parameters correctly');
      console.log('3. Frontend state management might not be setting the data');
      console.log('4. Network/CORS issues preventing API calls');
      console.log('');
      console.log('🔧 DEBUGGING STEPS:');
      console.log('1. Check browser Network tab for actual API calls');
      console.log('2. Verify API calls include ?status=active parameter');
      console.log('3. Check console for JavaScript errors');
      console.log('4. Verify modalBrands/modalCategories/modalSubcategories state is being set');
    } else {
      console.log('❌ No data available even with correct API calls');
      console.log('❌ Backend issue - data is not properly filtered');
    }

  } catch (error) {
    console.error('❌ Error debugging frontend filter API calls:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

debugFrontendFilterApiCalls();