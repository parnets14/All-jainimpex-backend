import axios from 'axios';

async function testHierarchyAPIEndpoints() {
  try {
    console.log('🔍 TESTING HIERARCHY API ENDPOINTS');
    console.log('='.repeat(50));

    const baseURL = 'http://localhost:5000/api';
    
    // Test token (you may need to update this)
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGRiNzIwOWJmN2I1YmFlY2U0YTIwYWEiLCJpYXQiOjE3Mzg0NzE4NzQsImV4cCI6MTczOTA3NjY3NH0.example';

    const headers = {
      'Cookie': `token=${token}`,
      'Content-Type': 'application/json'
    };

    console.log('\n📋 Testing Brands API...');
    try {
      const brandsResponse = await axios.get(`${baseURL}/brands`, { 
        headers,
        params: { limit: 10000 }
      });
      console.log('✅ Brands API Response:', {
        success: brandsResponse.data.success,
        count: brandsResponse.data.brands?.length || 0,
        sample: brandsResponse.data.brands?.[0]?.name || 'No brands'
      });
    } catch (error) {
      console.log('❌ Brands API Error:', error.response?.status, error.response?.data?.message || error.message);
    }

    console.log('\n📋 Testing Categories API...');
    try {
      const categoriesResponse = await axios.get(`${baseURL}/categories`, { 
        headers,
        params: { limit: 10000 }
      });
      console.log('✅ Categories API Response:', {
        success: categoriesResponse.data.success,
        count: categoriesResponse.data.categories?.length || 0,
        sample: categoriesResponse.data.categories?.[0]?.name || 'No categories'
      });
    } catch (error) {
      console.log('❌ Categories API Error:', error.response?.status, error.response?.data?.message || error.message);
    }

    console.log('\n📋 Testing Subcategories API...');
    try {
      const subcategoriesResponse = await axios.get(`${baseURL}/subcategories`, { 
        headers,
        params: { limit: 10000 }
      });
      console.log('✅ Subcategories API Response:', {
        success: subcategoriesResponse.data.success,
        count: subcategoriesResponse.data.subcategories?.length || 0,
        sample: subcategoriesResponse.data.subcategories?.[0]?.name || 'No subcategories'
      });
    } catch (error) {
      console.log('❌ Subcategories API Error:', error.response?.status, error.response?.data?.message || error.message);
    }

    // Test brand-specific categories
    console.log('\n📋 Testing Brand Categories API...');
    try {
      const brandId = '6979b7a6be2f2eaac8767b8f'; // First brand from our data
      const brandCategoriesResponse = await axios.get(`${baseURL}/brands/${brandId}/categories`, { 
        headers,
        params: { limit: 10000 }
      });
      console.log('✅ Brand Categories API Response:', {
        success: brandCategoriesResponse.data.success,
        count: brandCategoriesResponse.data.categories?.length || 0,
        sample: brandCategoriesResponse.data.categories?.[0]?.name || 'No categories'
      });
    } catch (error) {
      console.log('❌ Brand Categories API Error:', error.response?.status, error.response?.data?.message || error.message);
    }

  } catch (error) {
    console.error('❌ General Error:', error.message);
  }
}

testHierarchyAPIEndpoints();