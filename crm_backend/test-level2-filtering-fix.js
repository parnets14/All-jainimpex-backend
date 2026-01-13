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

// Test Level 2 subcategory filtering fix
async function testLevel2FilteringFix() {
  try {
    console.log('🧪 Testing Level 2 Subcategory Filtering Fix...\n');

    // Login first
    const token = await login();
    const headers = { Authorization: `Bearer ${token}` };

    // Step 1: Get all Level 1 extended subcategories
    console.log('📋 Step 1: Fetching Level 1 extended subcategories...');
    const level1Response = await axios.get(`${BASE_URL}/extended-subcategories?level=1&limit=100`, { headers });
    const level1Items = level1Response.data.items || [];
    console.log(`✅ Found ${level1Items.length} Level 1 items`);
    
    if (level1Items.length === 0) {
      console.log('❌ No Level 1 items found. Cannot test filtering.');
      return;
    }

    // Step 2: Get all Level 2 extended subcategories
    console.log('\n📋 Step 2: Fetching Level 2 extended subcategories...');
    const level2Response = await axios.get(`${BASE_URL}/extended-subcategories?level=2&limit=100`, { headers });
    const level2Items = level2Response.data.items || [];
    console.log(`✅ Found ${level2Items.length} Level 2 items`);
    
    if (level2Items.length === 0) {
      console.log('❌ No Level 2 items found. Cannot test filtering.');
      return;
    }

    // Step 3: Test filtering logic
    console.log('\n🔍 Step 3: Testing filtering logic...');
    
    // Pick the first Level 1 item
    const selectedLevel1 = level1Items[0];
    console.log(`📌 Selected Level 1: ${selectedLevel1.name} (ID: ${selectedLevel1._id})`);
    
    // Filter Level 2 items that belong to this Level 1 parent
    const filteredLevel2 = level2Items.filter(item => {
      const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
      const matches = parentId === selectedLevel1._id;
      
      if (matches) {
        console.log(`  ✅ Match: ${item.name} (Parent: ${parentId})`);
      }
      
      return matches;
    });
    
    console.log(`\n📊 Filtering Results:`);
    console.log(`   Total Level 2 items: ${level2Items.length}`);
    console.log(`   Filtered for Level 1 "${selectedLevel1.name}": ${filteredLevel2.length}`);
    
    if (filteredLevel2.length > 0) {
      console.log(`   ✅ Filtering works! Found ${filteredLevel2.length} child items.`);
      console.log(`   Child items:`);
      filteredLevel2.forEach((item, index) => {
        console.log(`     ${index + 1}. ${item.name}`);
      });
    } else {
      console.log(`   ⚠️  No child items found for "${selectedLevel1.name}"`);
      
      // Let's check what parent IDs exist in Level 2
      console.log('\n🔍 Debugging: Checking all parent IDs in Level 2 items...');
      const parentIds = level2Items.map(item => {
        const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
        console.log(`     ${item.name} -> Parent: ${parentId}`);
        return parentId;
      });
      
      const uniqueParentIds = [...new Set(parentIds)];
      console.log(`\n📋 Unique parent IDs in Level 2: ${uniqueParentIds.length}`);
      uniqueParentIds.forEach(id => console.log(`     ${id}`));
      
      console.log(`\n🔍 Looking for Level 1 ID: ${selectedLevel1._id}`);
      const hasMatch = uniqueParentIds.includes(selectedLevel1._id);
      console.log(`   Match found: ${hasMatch}`);
    }

    // Step 4: Test with different Level 1 items
    console.log('\n🔄 Step 4: Testing with other Level 1 items...');
    for (let i = 1; i < Math.min(3, level1Items.length); i++) {
      const testLevel1 = level1Items[i];
      const testFiltered = level2Items.filter(item => {
        const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
        return parentId === testLevel1._id;
      });
      
      console.log(`   "${testLevel1.name}": ${testFiltered.length} children`);
    }

    console.log('\n✅ Level 2 filtering test completed!');

  } catch (error) {
    console.error('❌ Error testing Level 2 filtering:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testLevel2FilteringFix();