import mongoose from 'mongoose';
import dotenv from 'dotenv';
import express from 'express';
import { getPurchaseDiscounts } from './controllers/purchaseDiscountController.js';

// Load environment variables
dotenv.config();

const testPurchaseDiscountAPI = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Testing Purchase Discount API Endpoint...\n');

    // Simulate API request
    const mockReq = {
      query: {
        status: 'Approved',
        isActive: 'true',
        limit: 1000
      }
    };

    const mockRes = {
      json: (data) => {
        console.log('📋 API Response:');
        console.log(JSON.stringify(data, null, 2));
        
        if (data.success && data.data) {
          console.log(`\n✅ Found ${data.data.length} purchase discounts`);
          
          data.data.forEach((discount, index) => {
            console.log(`\n   ${index + 1}. ${discount.discountName}`);
            console.log(`      ID: ${discount._id}`);
            console.log(`      Direct Discount: ${discount.directDiscountPercentage}%`);
            console.log(`      Floating: ${discount.floatingDiscountEnabled ? `${discount.floatingDiscountMin}%-${discount.floatingDiscountMax}%` : 'Disabled'}`);
            console.log(`      Brand: ${discount.brand?.name || 'All Brands'}`);
            console.log(`      Category: ${discount.category?.name || 'All Categories'}`);
            console.log(`      Subcategory: ${discount.subcategory?.name || 'All Subcategories'}`);
            console.log(`      Status: ${discount.status}`);
            console.log(`      Active: ${discount.isActive}`);
            console.log(`      Valid From: ${new Date(discount.validFrom).toDateString()}`);
            console.log(`      Valid To: ${discount.validTo ? new Date(discount.validTo).toDateString() : 'No expiry'}`);
          });
        } else {
          console.log('❌ API returned no data or error');
        }
      },
      status: (code) => ({
        json: (data) => {
          console.log(`❌ API Error (${code}):`, data);
        }
      })
    };

    // Call the API function
    console.log('📝 Calling getPurchaseDiscounts API...');
    await getPurchaseDiscounts(mockReq, mockRes);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the test
testPurchaseDiscountAPI();