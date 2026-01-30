import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

async function testApiEndpoints() {
  try {
    console.log('🧪 Testing Stock Filter API Endpoints...\n');

    // Test Brands endpoint
    console.log('=== TESTING BRANDS ENDPOINT ===');
    try {
      const brandsResponse = await axios.get(`${API_BASE_URL}/brands`);
      console.log('✅ Brands endpoint working');
      console.log(`Response status: ${brandsResponse.status}`);
      console.log(`Data structure:`, brandsResponse.data);
      console.log(`Found ${brandsResponse.data?.data?.length || 0} brands\n`);
    } catch (error) {
      console.error('❌ Brands endpoint failed:', error.response?.data || error.message);
    }

    // Test Categories endpoint
    console.log('=== TESTING CATEGORIES ENDPOINT ===');
    try {
      const categoriesResponse = await axios.get(`${API_BASE_URL}/categories`);
      console.log('✅ Categories endpoint working');
      console.log(`Response status: ${categoriesResponse.status}`);
      console.log(`Data structure:`, categoriesResponse.data);
      console.log(`Found ${categoriesResponse.data?.data?.length || 0} categories\n`);
    } catch (error) {
      console.error('❌ Categories endpoint failed:', error.response?.data || error.message);
    }

    // Test Subcategories endpoint
    console.log('=== TESTING SUBCATEGORIES ENDPOINT ===');
    try {
      const subcategoriesResponse = await axios.get(`${API_BASE_URL}/subcategories`);
      console.log('✅ Subcategories endpoint working');
      console.log(`Response status: ${subcategoriesResponse.status}`);
      console.log(`Data structure:`, subcategoriesResponse.data);
      console.log(`Found ${subcategoriesResponse.data?.data?.length || 0} subcategories\n`);
    } catch (error) {
      console.error('❌ Subcategories endpoint failed:', error.response?.data || error.message);
    }

    // Test Extended Subcategories endpoint
    console.log('=== TESTING EXTENDED SUBCATEGORIES ENDPOINT ===');
    try {
      const extendedResponse = await axios.get(`${API_BASE_URL}/extended-subcategories`);
      console.log('✅ Extended subcategories endpoint working');
      console.log(`Response status: ${extendedResponse.status}`);
      console.log(`Data structure:`, extendedResponse.data);
      console.log(`Found ${extendedResponse.data?.data?.length || 0} extended subcategories\n`);
    } catch (error) {
      console.error('❌ Extended subcategories endpoint failed:', error.response?.data || error.message);
    }

    // Test Level 2 Extended Subcategories endpoint
    console.log('=== TESTING LEVEL 2 EXTENDED SUBCATEGORIES ENDPOINT ===');
    try {
      const level2Response = await axios.get(`${API_BASE_URL}/extended-subcategories?level=2`);
      console.log('✅ Level 2 extended subcategories endpoint working');
      console.log(`Response status: ${level2Response.status}`);
      console.log(`Data structure:`, level2Response.data);
      console.log(`Found ${level2Response.data?.data?.length || 0} level 2 options\n`);
    } catch (error) {
      console.error('❌ Level 2 extended subcategories endpoint failed:', error.response?.data || error.message);
    }

    // Test Stock endpoint with filters
    console.log('=== TESTING STOCK ENDPOINT ===');
    try {
      const stockResponse = await axios.get(`${API_BASE_URL}/stock?page=1&limit=5`);
      console.log('✅ Stock endpoint working');
      console.log(`Response status: ${stockResponse.status}`);
      console.log(`Data structure:`, stockResponse.data);
      console.log(`Found ${stockResponse.data?.data?.length || 0} stock items\n`);
    } catch (error) {
      console.error('❌ Stock endpoint failed:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('❌ General error:', error.message);
  }
}

testApiEndpoints();