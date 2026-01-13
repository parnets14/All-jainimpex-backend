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

// Test reverse hierarchy relationships
async function testReverseHierarchy() {
  try {
    console.log('🧪 Testing Reverse Hierarchy for Auto-fill...\n');

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

    // Examine Level 2 items to see what parent info they have
    console.log('\n🔍 Level 2 Items - Parent Information:');
    level2Items.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.name}`);
      console.log(`   ID: ${item._id}`);
      console.log(`   Level: ${item.level}`);
      console.log(`   Parent Extended Subcategory: ${item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory || 'None'}`);
      console.log(`   Category: ${item.category?._id || item.category || 'None'} (${item.category?.name || 'No name'})`);
      console.log(`   Subcategory: ${item.subcategory?._id || item.subcategory || 'None'} (${item.subcategory?.name || 'No name'})`);
      
      // Find the parent Level 1 item
      const parentLevel1 = level1Items.find(l1 => l1._id === (item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory));
      if (parentLevel1) {
        console.log(`   ✅ Parent Level 1 Found: "${parentLevel1.name}"`);
        console.log(`      Parent's Category: ${parentLevel1.category?._id || parentLevel1.category || 'None'} (${parentLevel1.category?.name || 'No name'})`);
        console.log(`      Parent's Subcategory: ${parentLevel1.subcategory?._id || parentLevel1.subcategory || 'None'} (${parentLevel1.subcategory?.name || 'No name'})`);
      } else {
        console.log(`   ❌ Parent Level 1 NOT found`);
      }
    });

    // Examine Level 3 items to see what parent info they have
    if (level3Items.length > 0) {
      console.log('\n🔍 Level 3 Items - Parent Information:');
      level3Items.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.name}`);
        console.log(`   ID: ${item._id}`);
        console.log(`   Level: ${item.level}`);
        console.log(`   Parent Extended Subcategory: ${item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory || 'None'}`);
        console.log(`   Category: ${item.category?._id || item.category || 'None'} (${item.category?.name || 'No name'})`);
        console.log(`   Subcategory: ${item.subcategory?._id || item.subcategory || 'None'} (${item.subcategory?.name || 'No name'})`);
        
        // Find the parent Level 2 item
        const parentLevel2 = level2Items.find(l2 => l2._id === (item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory));
        if (parentLevel2) {
          console.log(`   ✅ Parent Level 2 Found: "${parentLevel2.name}"`);
          
          // Find the grandparent Level 1 item
          const grandparentLevel1 = level1Items.find(l1 => l1._id === (parentLevel2.parentExtendedSubcategory?._id || parentLevel2.parentExtendedSubcategory));
          if (grandparentLevel1) {
            console.log(`   ✅ Grandparent Level 1 Found: "${grandparentLevel1.name}"`);
            console.log(`      Complete hierarchy: Category → Subcategory → Level 1 → Level 2 → Level 3`);
            console.log(`      Category: ${item.category?.name || 'Unknown'}`);
            console.log(`      Subcategory: ${item.subcategory?.name || 'Unknown'}`);
            console.log(`      Level 1: ${grandparentLevel1.name}`);
            console.log(`      Level 2: ${parentLevel2.name}`);
            console.log(`      Level 3: ${item.name}`);
          }
        } else {
          console.log(`   ❌ Parent Level 2 NOT found`);
        }
      });
    }

    // Test reverse auto-fill scenarios
    console.log('\n🔄 Testing Reverse Auto-fill Scenarios:');
    
    if (level2Items.length > 0) {
      const testLevel2 = level2Items[0];
      console.log(`\n📌 Scenario 1: User selects Level 2 "${testLevel2.name}"`);
      console.log(`   Should auto-fill:`);
      console.log(`   - Category: ${testLevel2.category?.name || 'Unknown'}`);
      console.log(`   - Subcategory: ${testLevel2.subcategory?.name || 'Unknown'}`);
      
      const parentLevel1 = level1Items.find(l1 => l1._id === (testLevel2.parentExtendedSubcategory?._id || testLevel2.parentExtendedSubcategory));
      if (parentLevel1) {
        console.log(`   - Level 1: ${parentLevel1.name}`);
      }
      console.log(`   - Level 2: ${testLevel2.name} (selected)`);
    }
    
    if (level3Items.length > 0) {
      const testLevel3 = level3Items[0];
      console.log(`\n📌 Scenario 2: User selects Level 3 "${testLevel3.name}"`);
      console.log(`   Should auto-fill:`);
      console.log(`   - Category: ${testLevel3.category?.name || 'Unknown'}`);
      console.log(`   - Subcategory: ${testLevel3.subcategory?.name || 'Unknown'}`);
      
      const parentLevel2 = level2Items.find(l2 => l2._id === (testLevel3.parentExtendedSubcategory?._id || testLevel3.parentExtendedSubcategory));
      if (parentLevel2) {
        console.log(`   - Level 2: ${parentLevel2.name}`);
        
        const grandparentLevel1 = level1Items.find(l1 => l1._id === (parentLevel2.parentExtendedSubcategory?._id || parentLevel2.parentExtendedSubcategory));
        if (grandparentLevel1) {
          console.log(`   - Level 1: ${grandparentLevel1.name}`);
        }
      }
      console.log(`   - Level 3: ${testLevel3.name} (selected)`);
    }

    console.log('\n✅ Reverse hierarchy analysis completed!');

  } catch (error) {
    console.error('❌ Error testing reverse hierarchy:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testReverseHierarchy();