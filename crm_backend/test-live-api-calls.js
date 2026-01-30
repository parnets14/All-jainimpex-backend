import fetch from 'node-fetch';

const testLiveApiCalls = async () => {
  try {
    console.log('🌐 Testing Live API Calls...\n');

    const baseUrl = 'http://localhost:5000/api';
    
    // You'll need to get a valid token from the frontend or create one
    // For now, let's test without authentication to see the response structure
    
    // Test 1: Brands API
    console.log('📋 TEST 1: BRANDS API');
    console.log('====================');
    
    try {
      const brandsResponse = await fetch(`${baseUrl}/brands?status=active`);
      const brandsData = await brandsResponse.json();
      
      console.log('Status:', brandsResponse.status);
      console.log('Response:', JSON.stringify(brandsData, null, 2));
      console.log('Success field:', brandsData.success);
      console.log('Data length:', brandsData.data?.length || 'N/A');
    } catch (error) {
      console.error('❌ Brands API Error:', error.message);
    }

    // Test 2: Categories API
    console.log('\n📋 TEST 2: CATEGORIES API');
    console.log('=========================');
    
    try {
      const categoriesResponse = await fetch(`${baseUrl}/categories?status=active`);
      const categoriesData = await categoriesResponse.json();
      
      console.log('Status:', categoriesResponse.status);
      console.log('Response:', JSON.stringify(categoriesData, null, 2));
      console.log('Success field:', categoriesData.success);
      console.log('Data length:', categoriesData.data?.length || 'N/A');
    } catch (error) {
      console.error('❌ Categories API Error:', error.message);
    }

    // Test 3: Subcategories API
    console.log('\n📋 TEST 3: SUBCATEGORIES API');
    console.log('============================');
    
    try {
      const subcategoriesResponse = await fetch(`${baseUrl}/subcategories?status=active`);
      const subcategoriesData = await subcategoriesResponse.json();
      
      console.log('Status:', subcategoriesResponse.status);
      console.log('Response:', JSON.stringify(subcategoriesData, null, 2));
      console.log('Success field:', subcategoriesData.success);
      console.log('Data length:', subcategoriesData.data?.length || 'N/A');
    } catch (error) {
      console.error('❌ Subcategories API Error:', error.message);
    }

    // Test 4: Without status parameter
    console.log('\n📋 TEST 4: BRANDS WITHOUT STATUS');
    console.log('=================================');
    
    try {
      const allBrandsResponse = await fetch(`${baseUrl}/brands`);
      const allBrandsData = await allBrandsResponse.json();
      
      console.log('Status:', allBrandsResponse.status);
      console.log('Response:', JSON.stringify(allBrandsData, null, 2));
      console.log('Success field:', allBrandsData.success);
      console.log('Data length:', allBrandsData.data?.length || 'N/A');
    } catch (error) {
      console.error('❌ All Brands API Error:', error.message);
    }

  } catch (error) {
    console.error('❌ Error testing live API calls:', error);
  }
};

testLiveApiCalls();