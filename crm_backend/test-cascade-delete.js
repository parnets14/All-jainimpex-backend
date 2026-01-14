import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

// Test credentials
const TEST_EMAIL = 'superadmin@jainimpex.com';
const TEST_PASSWORD = 'superadmin123';

let authToken = '';

// Helper function to make authenticated requests
const apiCall = async (method, endpoint, data = null) => {
  try {
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(error.response.data.message || error.message);
    }
    throw error;
  }
};

// Login
async function login() {
  console.log('🔐 Logging in...');
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    
    if (response.data.success && response.data.token) {
      authToken = response.data.token;
      console.log('✅ Login successful');
      return true;
    } else {
      console.error('❌ Login failed:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return false;
  }
}

// Test 1: Create test category with children
async function createTestHierarchy() {
  console.log('\n📦 Test 1: Creating test hierarchy...');
  
  try {
    // Create category
    const categoryResponse = await apiCall('POST', '/categories', {
      name: 'Test Category for Cascade Delete',
      description: 'This category will be deleted with cascade'
    });
    
    const categoryId = categoryResponse.category._id;
    console.log('✅ Created category:', categoryResponse.category.name);
    
    // Create subcategories
    const subcategory1 = await apiCall('POST', `/categories/${categoryId}/subcategories`, {
      name: 'Test Subcategory 1',
      description: 'First subcategory'
    });
    console.log('✅ Created subcategory 1:', subcategory1.subcategory.name);
    
    const subcategory2 = await apiCall('POST', `/categories/${categoryId}/subcategories`, {
      name: 'Test Subcategory 2',
      description: 'Second subcategory'
    });
    console.log('✅ Created subcategory 2:', subcategory2.subcategory.name);
    
    // Create brands
    const brand1 = await apiCall('POST', '/brands', {
      name: 'Test Brand 1',
      description: 'First brand',
      category: categoryId,
      subcategory: subcategory1.subcategory._id
    });
    console.log('✅ Created brand 1:', brand1.brand.name);
    
    const brand2 = await apiCall('POST', '/brands', {
      name: 'Test Brand 2',
      description: 'Second brand',
      category: categoryId,
      subcategory: subcategory2.subcategory._id
    });
    console.log('✅ Created brand 2:', brand2.brand.name);
    
    console.log('✅ Test hierarchy created successfully');
    return categoryId;
  } catch (error) {
    console.error('❌ Failed to create test hierarchy:', error.message);
    return null;
  }
}

// Test 2: Get child counts
async function testGetChildCounts(categoryId) {
  console.log('\n📊 Test 2: Getting child counts...');
  
  try {
    const response = await apiCall('GET', `/categories/${categoryId}/child-counts`);
    
    console.log('✅ Child counts retrieved:');
    console.log('   Subcategories:', response.counts.subcategories);
    console.log('   Extended Subcategories:', response.counts.extendedSubcategories);
    console.log('   Brands:', response.counts.brands);
    console.log('   Total:', response.counts.total);
    
    return response.counts;
  } catch (error) {
    console.error('❌ Failed to get child counts:', error.message);
    return null;
  }
}

// Test 3: Try non-cascade delete (should fail)
async function testNonCascadeDelete(categoryId) {
  console.log('\n🚫 Test 3: Testing non-cascade delete (should fail)...');
  
  try {
    await apiCall('DELETE', `/categories/${categoryId}/cascade?cascade=false`);
    console.log('❌ Non-cascade delete should have failed but succeeded');
    return false;
  } catch (error) {
    console.log('✅ Non-cascade delete correctly failed:', error.message);
    return true;
  }
}

// Test 4: Cascade delete
async function testCascadeDelete(categoryId) {
  console.log('\n🗑️ Test 4: Testing cascade delete...');
  
  try {
    const response = await apiCall('DELETE', `/categories/${categoryId}/cascade?cascade=true`);
    
    console.log('✅ Cascade delete successful:');
    console.log('   Categories deleted:', response.deleted.category);
    console.log('   Subcategories deleted:', response.deleted.subcategories);
    console.log('   Extended Subcategories deleted:', response.deleted.extendedSubcategories);
    console.log('   Brands deleted:', response.deleted.brands);
    console.log('   Total items deleted:', response.deleted.total);
    
    return true;
  } catch (error) {
    console.error('❌ Cascade delete failed:', error.message);
    return false;
  }
}

// Test 5: Verify deletion
async function verifyDeletion(categoryId) {
  console.log('\n✔️ Test 5: Verifying deletion...');
  
  try {
    await apiCall('GET', `/categories/${categoryId}`);
    console.log('❌ Category still exists after deletion');
    return false;
  } catch (error) {
    console.log('✅ Category successfully deleted (not found)');
    return true;
  }
}

// Test 6: Test delete without children
async function testDeleteWithoutChildren() {
  console.log('\n📦 Test 6: Testing delete without children...');
  
  try {
    // Create a category without children
    const categoryResponse = await apiCall('POST', '/categories', {
      name: 'Test Category Without Children',
      description: 'This category has no children'
    });
    
    const categoryId = categoryResponse.category._id;
    console.log('✅ Created category:', categoryResponse.category.name);
    
    // Get child counts (should be 0)
    const counts = await apiCall('GET', `/categories/${categoryId}/child-counts`);
    console.log('✅ Child counts:', counts.counts);
    
    if (counts.counts.total === 0) {
      console.log('✅ Category has no children');
      
      // Delete without cascade
      await apiCall('DELETE', `/categories/${categoryId}/cascade?cascade=false`);
      console.log('✅ Category deleted successfully without cascade');
      
      return true;
    } else {
      console.log('❌ Category unexpectedly has children');
      return false;
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('🧪 Starting Cascade Delete Tests\n');
  console.log('='.repeat(50));
  
  // Login
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.error('\n❌ Cannot proceed without authentication');
    return;
  }
  
  // Test 1: Create test hierarchy
  const categoryId = await createTestHierarchy();
  if (!categoryId) {
    console.error('\n❌ Cannot proceed without test data');
    return;
  }
  
  // Test 2: Get child counts
  const counts = await testGetChildCounts(categoryId);
  if (!counts) {
    console.error('\n❌ Cannot proceed without child counts');
    return;
  }
  
  // Test 3: Try non-cascade delete (should fail)
  await testNonCascadeDelete(categoryId);
  
  // Test 4: Cascade delete
  const cascadeSuccess = await testCascadeDelete(categoryId);
  if (!cascadeSuccess) {
    console.error('\n❌ Cascade delete failed');
    return;
  }
  
  // Test 5: Verify deletion
  await verifyDeletion(categoryId);
  
  // Test 6: Test delete without children
  await testDeleteWithoutChildren();
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ All tests completed!');
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test runner error:', error);
  process.exit(1);
});
