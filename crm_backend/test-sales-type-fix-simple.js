#!/usr/bin/env node

/**
 * Simple test to verify Sales Type and Product Type update functionality
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_BASE_URL = 'http://localhost:5000/api';

// Test user credentials
const TEST_USER = {
  email: 'superadmin@jainimpex.com',
  password: 'superadmin123'
};

let authToken = '';

async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await axios.post(`${API_BASE_URL}/auth/login`, TEST_USER);
    
    if (response.data.success && response.data.token) {
      authToken = response.data.token;
      console.log('✅ Login successful');
      return true;
    } else {
      console.error('❌ Login failed:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Login error:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testSalesTypeUpdate() {
  console.log('\n🔍 Testing Sales Type and Product Type Update via API...');
  
  try {
    // Get list of products
    const productsResponse = await axios.get(`${API_BASE_URL}/products?limit=1`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (!productsResponse.data.success || productsResponse.data.products.length === 0) {
      console.log('⚠️ No products found to test with');
      return;
    }
    
    const product = productsResponse.data.products[0];
    console.log(`📋 Testing with product: ${product.itemName}`);
    console.log(`   Current Sales Type: ${product.salesType || 'Not set'}`);
    console.log(`   Current Product Type: ${product.productType || 'Not set'}`);
    
    // Prepare update data with all required fields
    const updateData = {
      productCode: product.productCode,
      HSNCode: product.HSNCode,
      itemName: product.itemName,
      description: product.description || '',
      unit: product.unit,
      alternateUnit: product.alternateUnit || '',
      unitPrice: product.unitPrice,
      gst: product.gst,
      brand: product.brand?._id || product.brand,
      category: product.category?._id || product.category,
      subcategory: product.subcategory?._id || product.subcategory,
      subcategory1: product.subcategory1?._id || product.subcategory1 || undefined,
      subcategory2: product.subcategory2?._id || product.subcategory2 || undefined,
      subcategory3: product.subcategory3?._id || product.subcategory3 || undefined,
      subcategory4: product.subcategory4?._id || product.subcategory4 || undefined,
      subcategory5: product.subcategory5?._id || product.subcategory5 || undefined,
      minStockLevel: product.minStockLevel || 0,
      status: product.status || 'active',
      salesType: 'CD Sales',        // Change to CD Sales
      productType: 'AO Product'     // Change to AO Product
    };
    
    console.log('🔄 Updating product with new sales type and product type...');
    console.log(`   Setting Sales Type: ${updateData.salesType}`);
    console.log(`   Setting Product Type: ${updateData.productType}`);
    
    const response = await axios.put(
      `${API_BASE_URL}/products/${product._id}`,
      updateData,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    if (response.data.success) {
      const updatedProduct = response.data.product;
      console.log('✅ Product updated successfully');
      console.log(`   New Sales Type: ${updatedProduct.salesType}`);
      console.log(`   New Product Type: ${updatedProduct.productType}`);
      
      // Verify the changes were saved correctly
      if (updatedProduct.salesType === 'CD Sales' && updatedProduct.productType === 'AO Product') {
        console.log('🎉 SUCCESS: Sales Type and Product Type update working correctly!');
        
        // Test changing back to Regular
        console.log('\n🔄 Testing revert to Regular Sale and Regular Product...');
        const revertData = {
          ...updateData,
          salesType: 'Regular Sale',
          productType: 'Regular Product'
        };
        
        const revertResponse = await axios.put(
          `${API_BASE_URL}/products/${product._id}`,
          revertData,
          {
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        
        if (revertResponse.data.success) {
          console.log('✅ Revert successful');
          console.log(`   Reverted Sales Type: ${revertResponse.data.product.salesType}`);
          console.log(`   Reverted Product Type: ${revertResponse.data.product.productType}`);
          console.log('🎉 SUCCESS: Both directions working correctly!');
        } else {
          console.error('❌ Revert failed:', revertResponse.data.message);
        }
        
      } else {
        console.error('❌ FAILED: Sales Type and Product Type not updated correctly');
        console.log('Expected: CD Sales, AO Product');
        console.log(`Got: ${updatedProduct.salesType}, ${updatedProduct.productType}`);
      }
    } else {
      console.error('❌ Product update failed:', response.data.message);
    }
    
  } catch (error) {
    console.error('❌ Error testing sales type update:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.log('Full error response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

async function runSimpleTest() {
  console.log('🚀 Starting Simple Sales Type and Product Type Test\n');
  
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('❌ Cannot proceed without authentication');
    process.exit(1);
  }
  
  await testSalesTypeUpdate();
  
  console.log('\n✅ Test completed!');
  console.log('\n📋 Summary:');
  console.log('This test verifies that the backend fixes for salesType and productType are working.');
  console.log('If successful, the frontend should now be able to update these fields correctly.');
}

// Run the simple test
runSimpleTest().catch(console.error);