import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

async function testCategorySubcategoryBrandAPIs() {
  try {
    console.log('🧪 Testing Category, Subcategory, and Brand APIs\n');
    
    // Test Categories API
    console.log('1️⃣ Testing GET /api/categories');
    const categoriesRes = await axios.get(`${API_BASE_URL}/categories`, {
      params: { limit: 10 }
    });
    console.log('✅ Categories Response:');
    console.log('  - Success:', categoriesRes.data.success);
    console.log('  - Count:', categoriesRes.data.categories?.length || 0);
    if (categoriesRes.data.categories && categoriesRes.data.categories.length > 0) {
      console.log('  - First category:', categoriesRes.data.categories[0]);
      console.log('    - _id:', categoriesRes.data.categories[0]._id);
      console.log('    - name:', categoriesRes.data.categories[0].name);
    }
    console.log('');
    
    // Test Subcategories API
    console.log('2️⃣ Testing GET /api/subcategories');
    const subcategoriesRes = await axios.get(`${API_BASE_URL}/subcategories`, {
      params: { limit: 10 }
    });
    console.log('✅ Subcategories Response:');
    console.log('  - Success:', subcategoriesRes.data.success);
    console.log('  - Count:', subcategoriesRes.data.subcategories?.length || 0);
    if (subcategoriesRes.data.subcategories && subcategoriesRes.data.subcategories.length > 0) {
      console.log('  - First subcategory:', subcategoriesRes.data.subcategories[0]);
      console.log('    - _id:', subcategoriesRes.data.subcategories[0]._id);
      console.log('    - name:', subcategoriesRes.data.subcategories[0].name);
    }
    console.log('');
    
    // Test Brands API
    console.log('3️⃣ Testing GET /api/brands');
    const brandsRes = await axios.get(`${API_BASE_URL}/brands`, {
      params: { limit: 10 }
    });
    console.log('✅ Brands Response:');
    console.log('  - Success:', brandsRes.data.success);
    console.log('  - Count:', brandsRes.data.brands?.length || 0);
    if (brandsRes.data.brands && brandsRes.data.brands.length > 0) {
      console.log('  - First brand:', brandsRes.data.brands[0]);
      console.log('    - _id:', brandsRes.data.brands[0]._id);
      console.log('    - name:', brandsRes.data.brands[0].name);
    }
    console.log('');
    
    // Test Products API to see category/subcategory/brand structure
    console.log('4️⃣ Testing GET /api/products (to see product structure)');
    const productsRes = await axios.get(`${API_BASE_URL}/products`, {
      params: { limit: 5 }
    });
    console.log('✅ Products Response:');
    console.log('  - Success:', productsRes.data.success);
    console.log('  - Count:', productsRes.data.products?.length || 0);
    if (productsRes.data.products && productsRes.data.products.length > 0) {
      const product = productsRes.data.products[0];
      console.log('  - First product:', product.itemName);
      console.log('    - _id:', product._id);
      console.log('    - category:', product.category);
      console.log('    - category type:', typeof product.category);
      console.log('    - subcategory:', product.subcategory);
      console.log('    - subcategory type:', typeof product.subcategory);
      console.log('    - brand:', product.brand);
      console.log('    - brand type:', typeof product.brand);
    }
    console.log('');
    
    console.log('✅ All API tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing APIs:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testCategorySubcategoryBrandAPIs();
