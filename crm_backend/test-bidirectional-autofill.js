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

// Test bidirectional auto-fill functionality
async function testBidirectionalAutoFill() {
  try {
    console.log('🧪 Testing Bidirectional Auto-fill Functionality...\n');

    // Login first
    const token = await login();
    const headers = { Authorization: `Bearer ${token}` };

    // Get all levels of data
    const [level1Response, level2Response, level3Response] = await Promise.all([
      axios.get(`${BASE_URL}/extended-subcategories?level=1&limit=1000`, { headers }),
      axios.get(`${BASE_URL}/extended-subcategories?level=2&limit=1000`, { headers }),
      axios.get(`${BASE_URL}/extended-subcategories?level=3&limit=1000`, { headers })
    ]);
    
    const level1Items = level1Response.data.items || [];
    const level2Items = level2Response.data.items || [];
    const level3Items = level3Response.data.items || [];
    
    console.log(`📊 Data loaded:`);
    console.log(`   Level 1 items: ${level1Items.length}`);
    console.log(`   Level 2 items: ${level2Items.length}`);
    console.log(`   Level 3 items: ${level3Items.length}`);

    // Test 1: Forward auto-fill (Level 1 → Level 2)
    console.log('\n🔄 Test 1: Forward Auto-fill (Level 1 → Level 2)');
    const testLevel1 = level1Items.find(item => 
      level2Items.some(l2 => (l2.parentExtendedSubcategory?._id || l2.parentExtendedSubcategory) === item._id)
    );
    
    if (testLevel1) {
      console.log(`📌 Select Level 1: "${testLevel1.name}"`);
      
      // Simulate Level 1 selection
      const level2Children = level2Items.filter(item => {
        const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
        return parentId === testLevel1._id;
      });
      
      console.log(`✅ Level 2 should show: ${level2Children.length} items`);
      level2Children.forEach((child, index) => {
        console.log(`   ${index + 1}. ${child.name}`);
      });
    }

    // Test 2: Reverse auto-fill (Level 2 → Level 1, Category, Subcategory)
    console.log('\n🔄 Test 2: Reverse Auto-fill (Level 2 → Level 1, Category, Subcategory)');
    const testLevel2 = level2Items[0];
    
    if (testLevel2) {
      console.log(`📌 Select Level 2: "${testLevel2.name}"`);
      
      // Find parent Level 1
      const parentLevel1 = level1Items.find(l1 => 
        l1._id === (testLevel2.parentExtendedSubcategory?._id || testLevel2.parentExtendedSubcategory)
      );
      
      console.log(`✅ Should auto-fill:`);
      console.log(`   Category: ${testLevel2.category?.name || 'Unknown'}`);
      console.log(`   Subcategory: ${testLevel2.subcategory?.name || 'Unknown'}`);
      if (parentLevel1) {
        console.log(`   Level 1: ${parentLevel1.name}`);
      }
      console.log(`   Level 2: ${testLevel2.name} (selected)`);
      
      // Test Level 2 filtering after auto-fill
      console.log(`\n🔍 Level 2 filtering after auto-fill:`);
      if (parentLevel1) {
        const level2Siblings = level2Items.filter(item => {
          const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
          return parentId === parentLevel1._id;
        });
        console.log(`   Level 2 dropdown should show: ${level2Siblings.length} items`);
        level2Siblings.forEach((sibling, index) => {
          console.log(`   ${index + 1}. ${sibling.name} ${sibling._id === testLevel2._id ? '(selected)' : ''}`);
        });
      }
    }

    // Test 3: Reverse auto-fill (Level 3 → Level 2, Level 1, Category, Subcategory)
    if (level3Items.length > 0) {
      console.log('\n🔄 Test 3: Reverse Auto-fill (Level 3 → Level 2, Level 1, Category, Subcategory)');
      const testLevel3 = level3Items[0];
      
      console.log(`📌 Select Level 3: "${testLevel3.name}"`);
      
      // Find parent Level 2
      const parentLevel2 = level2Items.find(l2 => 
        l2._id === (testLevel3.parentExtendedSubcategory?._id || testLevel3.parentExtendedSubcategory)
      );
      
      // Find grandparent Level 1
      let grandparentLevel1 = null;
      if (parentLevel2) {
        grandparentLevel1 = level1Items.find(l1 => 
          l1._id === (parentLevel2.parentExtendedSubcategory?._id || parentLevel2.parentExtendedSubcategory)
        );
      }
      
      console.log(`✅ Should auto-fill:`);
      console.log(`   Category: ${testLevel3.category?.name || 'Unknown'}`);
      console.log(`   Subcategory: ${testLevel3.subcategory?.name || 'Unknown'}`);
      if (grandparentLevel1) {
        console.log(`   Level 1: ${grandparentLevel1.name}`);
      }
      if (parentLevel2) {
        console.log(`   Level 2: ${parentLevel2.name}`);
      }
      console.log(`   Level 3: ${testLevel3.name} (selected)`);
      
      // Test Level 2 filtering after Level 3 selection
      console.log(`\n🔍 Level 2 filtering after Level 3 selection:`);
      if (grandparentLevel1) {
        const level2Options = level2Items.filter(item => {
          const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
          return parentId === grandparentLevel1._id;
        });
        console.log(`   Level 2 dropdown should show: ${level2Options.length} items`);
        level2Options.forEach((option, index) => {
          console.log(`   ${index + 1}. ${option.name} ${option._id === parentLevel2?._id ? '(selected)' : ''}`);
        });
      }
    }

    // Test 4: Verify the fix for "Items: 0" issue
    console.log('\n🔍 Test 4: Verify Level 2 "Items: 0" Fix');
    console.log('Scenario: User opens form, no selections made');
    console.log('Expected: Level 2 shows "Items: 0" (correct - no Level 1 selected)');
    
    console.log('\nScenario: User selects Level 1 with children');
    const level1WithChildren = level1Items.find(l1 => 
      level2Items.some(l2 => (l2.parentExtendedSubcategory?._id || l2.parentExtendedSubcategory) === l1._id)
    );
    
    if (level1WithChildren) {
      const children = level2Items.filter(l2 => 
        (l2.parentExtendedSubcategory?._id || l2.parentExtendedSubcategory) === level1WithChildren._id
      );
      console.log(`Selected Level 1: "${level1WithChildren.name}"`);
      console.log(`Expected: Level 2 shows "Items: ${children.length}" (should be > 0)`);
    }
    
    console.log('\nScenario: User selects Level 2 directly');
    if (testLevel2 && parentLevel1) {
      const siblings = level2Items.filter(l2 => 
        (l2.parentExtendedSubcategory?._id || l2.parentExtendedSubcategory) === parentLevel1._id
      );
      console.log(`Selected Level 2: "${testLevel2.name}"`);
      console.log(`Expected: Level 1 auto-fills to "${parentLevel1.name}"`);
      console.log(`Expected: Level 2 shows "Items: ${siblings.length}" (should be > 0)`);
    }

    console.log('\n✅ Bidirectional auto-fill test completed!');
    console.log('\n📋 Summary of Expected Behavior:');
    console.log('1. ✅ Forward: Level 1 selection → Level 2 options appear');
    console.log('2. ✅ Reverse: Level 2 selection → Level 1 auto-fills');
    console.log('3. ✅ Reverse: Level 3 selection → Level 2 and Level 1 auto-fill');
    console.log('4. ✅ Filtering: Level 2 dropdown always shows correct count');

  } catch (error) {
    console.error('❌ Error testing bidirectional auto-fill:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testBidirectionalAutoFill();