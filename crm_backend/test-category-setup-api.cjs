const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

// Test the category setup API endpoints
async function testCategorySetupAPI() {
  try {
    console.log('🧪 Testing Category Setup API Endpoints...\n');

    // First, login to get a token
    console.log('1. Logging in...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'admin@jaininpex.com',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Login failed');
    }

    const token = loginResponse.data.token;
    const headers = { Authorization: `Bearer ${token}` };
    console.log('✅ Login successful\n');

    // Test 1: Get categories
    console.log('2. Testing GET /api/categories...');
    const categoriesResponse = await axios.get(`${API_BASE_URL}/categories`, { headers });
    console.log('✅ Categories fetched:', categoriesResponse.data.categories?.length || 0, 'items\n');

    // Test 2: Create a test category
    console.log('3. Testing POST /api/categories...');
    const categoryData = {
      name: 'Test Category ' + Date.now(),
      description: 'Test category for API testing'
    };
    const createCategoryResponse = await axios.post(`${API_BASE_URL}/categories`, categoryData, { headers });
    console.log('✅ Category created:', createCategoryResponse.data.category?.name);
    const categoryId = createCategoryResponse.data.category._id;
    console.log('   Category ID:', categoryId, '\n');

    // Test 3: Create a subcategory
    console.log('4. Testing POST /api/categories/:categoryId/subcategories...');
    const subcategoryData = {
      name: 'Test Subcategory ' + Date.now(),
      description: 'Test subcategory for API testing',
      category: categoryId
    };
    const createSubcategoryResponse = await axios.post(
      `${API_BASE_URL}/categories/${categoryId}/subcategories`, 
      subcategoryData, 
      { headers }
    );
    console.log('✅ Subcategory created:', createSubcategoryResponse.data.subcategory?.name);
    const subcategoryId = createSubcategoryResponse.data.subcategory._id;
    console.log('   Subcategory ID:', subcategoryId, '\n');

    // Test 4: Create an extended subcategory
    console.log('5. Testing POST /api/extended-subcategories...');
    const extendedData = {
      name: 'Test Extended ' + Date.now(),
      description: 'Test extended subcategory for API testing',
      category: categoryId,
      subcategory: subcategoryId
    };
    const createExtendedResponse = await axios.post(
      `${API_BASE_URL}/extended-subcategories`, 
      extendedData, 
      { headers }
    );
    console.log('✅ Extended subcategory created:', createExtendedResponse.data.item?.name);
    const extendedId = createExtendedResponse.data.item._id;
    console.log('   Extended ID:', extendedId, '\n');

    // Test 5: Create a brand
    console.log('6. Testing POST /api/subcategories/:subcategoryId/brands...');
    const brandData = {
      name: 'Test Brand ' + Date.now(),
      description: 'Test brand for API testing',
      category: categoryId,
      subcategory: subcategoryId
    };
    const createBrandResponse = await axios.post(
      `${API_BASE_URL}/subcategories/${subcategoryId}/brands`, 
      brandData, 
      { headers }
    );
    console.log('✅ Brand created:', createBrandResponse.data.brand?.name);
    console.log('   Brand ID:', createBrandResponse.data.brand._id, '\n');

    console.log('🎉 All API endpoints are working correctly!');

  } catch (error) {
    console.error('❌ API Test Failed:');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

// Run the test
testCategorySetupAPI();