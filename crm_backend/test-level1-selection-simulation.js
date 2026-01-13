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

// Test what happens when user selects Level 1 item
async function testLevel1Selection() {
  try {
    console.log('🧪 Testing Level 1 Selection Behavior...\n');

    // Login first
    const token = await login();
    const headers = { Authorization: `Bearer ${token}` };

    // Get Level 1 and Level 2 data
    const [level1Response, level2Response] = await Promise.all([
      axios.get(`${BASE_URL}/extended-subcategories?level=1&limit=1000`, { headers }),
      axios.get(`${BASE_URL}/extended-subcategories?level=2&limit=1000`, { headers })
    ]);
    
    const level1Items = level1Response.data.items || [];
    const level2Items = level2Response.data.items || [];
    
    console.log(`📊 Data loaded:`);
    console.log(`   Level 1 items: ${level1Items.length}`);
    console.log(`   Level 2 items: ${level2Items.length}`);
    
    if (level1Items.length === 0) {
      console.log('❌ No Level 1 items to test with');
      return;
    }

    console.log('\n📋 Available Level 1 items:');
    level1Items.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.name} (ID: ${item._id})`);
    });

    console.log('\n📋 Available Level 2 items:');
    level2Items.forEach((item, index) => {
      const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
      console.log(`   ${index + 1}. ${item.name} (Parent: ${parentId})`);
    });

    // Test each Level 1 item to see what Level 2 children it has
    console.log('\n🔍 Testing Level 1 → Level 2 relationships:');
    
    for (const level1Item of level1Items) {
      const children = level2Items.filter(item => {
        const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
        return parentId === level1Item._id;
      });
      
      console.log(`\n📌 Level 1: "${level1Item.name}"`);
      console.log(`   ID: ${level1Item._id}`);
      console.log(`   Children: ${children.length}`);
      
      if (children.length > 0) {
        console.log(`   ✅ Level 2 children:`);
        children.forEach((child, index) => {
          console.log(`      ${index + 1}. ${child.name}`);
        });
        console.log(`   📊 UI would show: "Subcategory Level 2 (Optional) - Items: ${children.length}"`);
      } else {
        console.log(`   ❌ No Level 2 children found`);
        console.log(`   📊 UI would show: "Subcategory Level 2 (Optional) - Items: 0"`);
      }
    }

    // Summary
    console.log('\n📊 Summary:');
    const level1WithChildren = level1Items.filter(level1Item => {
      return level2Items.some(level2Item => {
        const parentId = level2Item.parentExtendedSubcategory?._id || level2Item.parentExtendedSubcategory;
        return parentId === level1Item._id;
      });
    });
    
    console.log(`   Total Level 1 items: ${level1Items.length}`);
    console.log(`   Level 1 items with Level 2 children: ${level1WithChildren.length}`);
    console.log(`   Level 1 items without Level 2 children: ${level1Items.length - level1WithChildren.length}`);
    
    if (level1WithChildren.length > 0) {
      console.log(`\n✅ EXPECTED BEHAVIOR:`);
      console.log(`   - When no Level 1 selected: "Items: 0" (correct)`);
      console.log(`   - When Level 1 with children selected: "Items: X" where X > 0`);
      console.log(`   - When Level 1 without children selected: "Items: 0"`);
    }

    console.log('\n✅ Level 1 selection test completed!');

  } catch (error) {
    console.error('❌ Error testing Level 1 selection:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testLevel1Selection();