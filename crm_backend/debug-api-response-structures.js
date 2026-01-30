import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

// You'll need to get a valid token from the frontend localStorage
// For now, let's test the response structures
const TEST_TOKEN = 'your_token_here'; // Replace with actual token

async function debugApiResponseStructures() {
  try {
    console.log('🔍 Debugging API Response Structures...\n');

    const headers = {
      'Authorization': `Bearer ${TEST_TOKEN}`,
      'Content-Type': 'application/json'
    };

    // Test Brands endpoint
    console.log('=== BRANDS API RESPONSE STRUCTURE ===');
    try {
      const brandsResponse = await axios.get(`${API_BASE_URL}/brands`, { headers });
      console.log('Status:', brandsResponse.status);
      console.log('Full Response:', JSON.stringify(brandsResponse.data, null, 2));
      console.log('Available keys:', Object.keys(brandsResponse.data));
      if (brandsResponse.data.brands) {
        console.log('Brands array length:', brandsResponse.data.brands.length);
        if (brandsResponse.data.brands.length > 0) {
          console.log('Sample brand:', brandsResponse.data.brands[0]);
        }
      }
      if (brandsResponse.data.data) {
        console.log('Data array length:', brandsResponse.data.data.length);
        if (brandsResponse.data.data.length > 0) {
          console.log('Sample data item:', brandsResponse.data.data[0]);
        }
      }
      console.log('\n');
    } catch (error) {
      console.error('Brands API Error:', error.response?.data || error.message);
    }

    // Test Categories endpoint
    console.log('=== CATEGORIES API RESPONSE STRUCTURE ===');
    try {
      const categoriesResponse = await axios.get(`${API_BASE_URL}/categories`, { headers });
      console.log('Status:', categoriesResponse.status);
      console.log('Full Response:', JSON.stringify(categoriesResponse.data, null, 2));
      console.log('Available keys:', Object.keys(categoriesResponse.data));
      if (categoriesResponse.data.categories) {
        console.log('Categories array length:', categoriesResponse.data.categories.length);
        if (categoriesResponse.data.categories.length > 0) {
          console.log('Sample category:', categoriesResponse.data.categories[0]);
        }
      }
      if (categoriesResponse.data.data) {
        console.log('Data array length:', categoriesResponse.data.data.length);
        if (categoriesResponse.data.data.length > 0) {
          console.log('Sample data item:', categoriesResponse.data.data[0]);
        }
      }
      console.log('\n');
    } catch (error) {
      console.error('Categories API Error:', error.response?.data || error.message);
    }

    // Test Subcategories endpoint
    console.log('=== SUBCATEGORIES API RESPONSE STRUCTURE ===');
    try {
      const subcategoriesResponse = await axios.get(`${API_BASE_URL}/subcategories`, { headers });
      console.log('Status:', subcategoriesResponse.status);
      console.log('Full Response:', JSON.stringify(subcategoriesResponse.data, null, 2));
      console.log('Available keys:', Object.keys(subcategoriesResponse.data));
      if (subcategoriesResponse.data.subcategories) {
        console.log('Subcategories array length:', subcategoriesResponse.data.subcategories.length);
        if (subcategoriesResponse.data.subcategories.length > 0) {
          console.log('Sample subcategory:', subcategoriesResponse.data.subcategories[0]);
        }
      }
      if (subcategoriesResponse.data.data) {
        console.log('Data array length:', subcategoriesResponse.data.data.length);
        if (subcategoriesResponse.data.data.length > 0) {
          console.log('Sample data item:', subcategoriesResponse.data.data[0]);
        }
      }
      console.log('\n');
    } catch (error) {
      console.error('Subcategories API Error:', error.response?.data || error.message);
    }

    // Test Extended Subcategories endpoint
    console.log('=== EXTENDED SUBCATEGORIES API RESPONSE STRUCTURE ===');
    try {
      const extendedResponse = await axios.get(`${API_BASE_URL}/extended-subcategories`, { headers });
      console.log('Status:', extendedResponse.status);
      console.log('Full Response:', JSON.stringify(extendedResponse.data, null, 2));
      console.log('Available keys:', Object.keys(extendedResponse.data));
      if (extendedResponse.data.items) {
        console.log('Items array length:', extendedResponse.data.items.length);
        if (extendedResponse.data.items.length > 0) {
          console.log('Sample item:', extendedResponse.data.items[0]);
        }
      }
      if (extendedResponse.data.data) {
        console.log('Data array length:', extendedResponse.data.data.length);
        if (extendedResponse.data.data.length > 0) {
          console.log('Sample data item:', extendedResponse.data.data[0]);
        }
      }
      console.log('\n');
    } catch (error) {
      console.error('Extended Subcategories API Error:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('❌ General error:', error.message);
  }
}

console.log('To run this script with authentication:');
console.log('1. Open browser dev tools on the Stock Management page');
console.log('2. Run: localStorage.getItem("token")');
console.log('3. Copy the token and replace TEST_TOKEN above');
console.log('4. Run this script again');

debugApiResponseStructures();