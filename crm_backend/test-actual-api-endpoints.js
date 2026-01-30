import mongoose from 'mongoose';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { getBrands } from './controllers/brandController.js';
import { getCategories } from './controllers/categoryController.js';
import { getSubcategories } from './controllers/subcategoryController.js';

dotenv.config();

const testActualApiEndpoints = async () => {
  try {
    console.log('🧪 Testing Actual API Endpoints...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Simulate getBrands API call
    console.log('📋 TEST 1: BRANDS API ENDPOINT');
    console.log('==============================');
    
    const mockBrandsReq = {
      query: { status: 'active' }
    };
    
    const mockBrandsRes = {
      json: (data) => {
        console.log('Brands API Response:', JSON.stringify(data, null, 2));
        return data;
      },
      status: (code) => ({
        json: (data) => {
          console.log(`Brands API Status: ${code}`);
          console.log('Brands API Error:', JSON.stringify(data, null, 2));
          return data;
        }
      })
    };
    
    try {
      await getBrands(mockBrandsReq, mockBrandsRes);
    } catch (error) {
      console.error('❌ Brands API Error:', error);
    }

    // Test 2: Simulate getCategories API call
    console.log('\n📋 TEST 2: CATEGORIES API ENDPOINT');
    console.log('==================================');
    
    const mockCategoriesReq = {
      query: { status: 'active' }
    };
    
    const mockCategoriesRes = {
      json: (data) => {
        console.log('Categories API Response:', JSON.stringify(data, null, 2));
        return data;
      },
      status: (code) => ({
        json: (data) => {
          console.log(`Categories API Status: ${code}`);
          console.log('Categories API Error:', JSON.stringify(data, null, 2));
          return data;
        }
      })
    };
    
    try {
      await getCategories(mockCategoriesReq, mockCategoriesRes);
    } catch (error) {
      console.error('❌ Categories API Error:', error);
    }

    // Test 3: Simulate getSubcategories API call
    console.log('\n📋 TEST 3: SUBCATEGORIES API ENDPOINT');
    console.log('=====================================');
    
    const mockSubcategoriesReq = {
      query: { status: 'active' }
    };
    
    const mockSubcategoriesRes = {
      json: (data) => {
        console.log('Subcategories API Response:', JSON.stringify(data, null, 2));
        return data;
      },
      status: (code) => ({
        json: (data) => {
          console.log(`Subcategories API Status: ${code}`);
          console.log('Subcategories API Error:', JSON.stringify(data, null, 2));
          return data;
        }
      })
    };
    
    try {
      await getSubcategories(mockSubcategoriesReq, mockSubcategoriesRes);
    } catch (error) {
      console.error('❌ Subcategories API Error:', error);
    }

    // Test 4: Test without status parameter
    console.log('\n📋 TEST 4: WITHOUT STATUS PARAMETER');
    console.log('===================================');
    
    const mockAllBrandsReq = {
      query: {}
    };
    
    const mockAllBrandsRes = {
      json: (data) => {
        console.log('All Brands API Response:', JSON.stringify(data, null, 2));
        return data;
      },
      status: (code) => ({
        json: (data) => {
          console.log(`All Brands API Status: ${code}`);
          console.log('All Brands API Error:', JSON.stringify(data, null, 2));
          return data;
        }
      })
    };
    
    try {
      await getBrands(mockAllBrandsReq, mockAllBrandsRes);
    } catch (error) {
      console.error('❌ All Brands API Error:', error);
    }

  } catch (error) {
    console.error('❌ Error testing actual API endpoints:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testActualApiEndpoints();