import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

async function testExtendedSubcategoryAPI() {
  console.log('🧪 Testing Extended Subcategory API...\n');

  // Test login first
  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'superadmin@jainimpex.com',
      password: 'superadmin123'
    })
  });

  const loginData = await loginResponse.json();
  if (!loginData.success) {
    console.log('❌ Login failed:', loginData.message);
    return;
  }

  const token = loginData.token;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  console.log('✅ Login successful\n');

  // First, get some categories and subcategories to work with
  console.log('1. Getting categories...');
  const categoriesResponse = await fetch(`${BASE_URL}/categories`, { headers });
  const categoriesData = await categoriesResponse.json();
  
  if (!categoriesResponse.ok || !categoriesData.categories?.length) {
    console.log('❌ No categories found');
    return;
  }
  
  const category = categoriesData.categories[0];
  console.log(`✅ Using category: ${category.name} (${category._id})`);

  console.log('2. Getting subcategories...');
  const subcategoriesResponse = await fetch(`${BASE_URL}/categories/${category._id}/subcategories`, { headers });
  const subcategoriesData = await subcategoriesResponse.json();
  
  if (!subcategoriesResponse.ok || !subcategoriesData.subcategories?.length) {
    console.log('❌ No subcategories found');
    return;
  }
  
  const subcategory = subcategoriesData.subcategories[0];
  console.log(`✅ Using subcategory: ${subcategory.name} (${subcategory._id})`);

  // Test extended subcategory endpoints
  console.log('\n3. Testing GET /api/extended-subcategories...');
  try {
    const response = await fetch(`${BASE_URL}/extended-subcategories?category=${category._id}&subcategory=${subcategory._id}&level=1`, { headers });
    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✅ Extended subcategories API working');
      console.log(`Found ${data.items?.length || 0} level 1 extended subcategories`);
    } else {
      console.log('❌ Extended subcategories API failed:', data.message);
    }
  } catch (error) {
    console.log('❌ Error calling extended subcategories API:', error.message);
  }

  // Test creating an extended subcategory
  console.log('\n4. Testing POST /api/extended-subcategories...');
  try {
    const newExtendedSubcategory = {
      name: `Test Extended Subcategory ${Date.now()}`,
      description: 'Test extended subcategory for API testing',
      category: category._id,
      subcategory: subcategory._id
    };

    const response = await fetch(`${BASE_URL}/extended-subcategories`, {
      method: 'POST',
      headers,
      body: JSON.stringify(newExtendedSubcategory)
    });
    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✅ Extended subcategory created successfully');
      console.log(`Created: ${data.item.name} (Level ${data.item.level})`);
      
      // Test creating a child extended subcategory
      console.log('\n5. Testing child extended subcategory creation...');
      const childExtendedSubcategory = {
        name: `Child Extended Subcategory ${Date.now()}`,
        description: 'Child extended subcategory for API testing',
        category: category._id,
        subcategory: subcategory._id,
        parentExtendedSubcategory: data.item._id
      };

      const childResponse = await fetch(`${BASE_URL}/extended-subcategories`, {
        method: 'POST',
        headers,
        body: JSON.stringify(childExtendedSubcategory)
      });
      const childData = await childResponse.json();
      
      if (childResponse.ok) {
        console.log('✅ Child extended subcategory created successfully');
        console.log(`Created: ${childData.item.name} (Level ${childData.item.level})`);
      } else {
        console.log('❌ Failed to create child extended subcategory:', childData.message);
      }
    } else {
      console.log('❌ Failed to create extended subcategory:', data.message);
    }
  } catch (error) {
    console.log('❌ Error creating extended subcategory:', error.message);
  }

  console.log('\n✅ Extended subcategory API tests completed!');
}

testExtendedSubcategoryAPI().catch(console.error);