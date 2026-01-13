import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

// Login and get token
async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'superadmin@jainimpex.com',
      password: 'superadmin123'
    });
    
    if (response.data.success && response.data.token) {
      console.log('✅ Login successful');
      return response.data.token;
    } else {
      throw new Error('Login failed: ' + (response.data.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('❌ Login error:', error.response?.data?.message || error.message);
    throw error;
  }
}

// Test the complete flow that the frontend would follow
async function testFrontendLevel2Flow() {
  try {
    console.log('🧪 Testing Frontend Level 2 Flow...\n');

    // Login first
    const token = await login();
    const headers = { Authorization: `Bearer ${token}` };

    // Step 1: Simulate component mount - fetch all extended subcategories
    console.log('📋 Step 1: Simulating component mount - fetching all levels...');
    
    const [level1Response, level2Response] = await Promise.all([
      axios.get(`${BASE_URL}/extended-subcategories?level=1&limit=1000`, { headers }),
      axios.get(`${BASE_URL}/extended-subcategories?level=2&limit=1000`, { headers })
    ]);
    
    const level1Items = level1Response.data.items || [];
    const level2Items = level2Response.data.items || [];
    
    console.log(`✅ Level 1 items loaded: ${level1Items.length}`);
    console.log(`✅ Level 2 items loaded: ${level2Items.length}`);
    
    if (level1Items.length === 0 || level2Items.length === 0) {
      console.log('❌ Insufficient test data. Need both Level 1 and Level 2 items.');
      return;
    }

    // Step 2: Simulate user selecting a Level 1 item
    console.log('\n📋 Step 2: Simulating user selecting Level 1 item...');
    
    const selectedLevel1 = level1Items[0];
    console.log(`📌 User selects Level 1: "${selectedLevel1.name}" (ID: ${selectedLevel1._id})`);
    
    // Step 3: Simulate the filtering that would happen in the frontend
    console.log('\n🔍 Step 3: Simulating frontend filtering logic...');
    
    // This is the exact logic from the useMemo in the frontend
    const formDataSubcategory1 = selectedLevel1._id; // This would be set by handleSubcategory1Change
    
    console.log(`   formData.subcategory1: ${formDataSubcategory1}`);
    console.log(`   extendedSubcategories2.length: ${level2Items.length}`);
    
    // Apply the filtering logic
    let filteredLevel2 = [];
    
    if (!level2Items || level2Items.length === 0) {
      console.log('   ❌ No Level 2 data loaded yet');
    } else if (!formDataSubcategory1) {
      console.log('   ❌ No subcategory1 selected');
    } else {
      filteredLevel2 = level2Items.filter(item => {
        const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
        return parentId === formDataSubcategory1;
      });
      
      console.log(`   ✅ Filtered Level 2 items: ${filteredLevel2.length}`);
      if (filteredLevel2.length > 0) {
        console.log('   Items:', filteredLevel2.map(item => item.name));
      }
    }

    // Step 4: Verify the dropdown would show the correct count
    console.log('\n📊 Step 4: Verifying dropdown display...');
    console.log(`   Dropdown label would show: "Subcategory Level 2 (Optional) - Items: ${filteredLevel2.length}"`);
    
    if (filteredLevel2.length > 0) {
      console.log('   ✅ SUCCESS: Level 2 dropdown would show items!');
      console.log('   Available options:');
      filteredLevel2.forEach((item, index) => {
        console.log(`     ${index + 1}. ${item.name}`);
      });
    } else {
      console.log('   ❌ ISSUE: Level 2 dropdown would show "Items: 0"');
      
      // Debug: Check what parent IDs exist
      console.log('\n🔍 Debug: Checking parent relationships...');
      console.log(`   Selected Level 1 ID: ${selectedLevel1._id}`);
      console.log('   Level 2 parent IDs:');
      level2Items.forEach(item => {
        const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
        console.log(`     ${item.name} -> Parent: ${parentId}`);
      });
    }

    // Step 5: Test with other Level 1 items
    console.log('\n🔄 Step 5: Testing with other Level 1 items...');
    for (let i = 1; i < Math.min(3, level1Items.length); i++) {
      const testLevel1 = level1Items[i];
      const testFiltered = level2Items.filter(item => {
        const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
        return parentId === testLevel1._id;
      });
      
      console.log(`   "${testLevel1.name}": ${testFiltered.length} children`);
    }

    console.log('\n✅ Frontend Level 2 flow test completed!');

  } catch (error) {
    console.error('❌ Error testing frontend Level 2 flow:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testFrontendLevel2Flow();