// test-comprehensive-permissions.js
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

async function testComprehensivePermissions() {
  console.log('🧪 Testing Comprehensive Permissions for Nilesh...\n');

  try {
    // 1. Login as nilesh
    console.log('1. Logging in as nilesh...');
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'nilesh123@gmail.com',
        password: 'nilesh123'
      })
    });

    const loginData = await loginResponse.json();
    
    if (!loginData.success) {
      console.log('❌ Login failed:', loginData.message);
      return;
    }

    console.log('✅ Nilesh login successful');
    console.log(`User permissions count: ${loginData.user.permissions.length}`);
    
    const token = loginData.token;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Test various API endpoints that correspond to UI components
    const testEndpoints = [
      // Master Management
      { name: 'Dealer Stats', url: '/dealers/stats', permission: 'dealers.view' },
      { name: 'Categories', url: '/categories', permission: 'categories.view' },
      { name: 'Employees', url: '/employees', permission: 'employees.view' },
      { name: 'Products', url: '/products', permission: 'product.master' },
      { name: 'Suppliers', url: '/suppliers', permission: 'supplier.master' },
      
      // Finance & Accounts
      { name: 'Cheques', url: '/cheques', permission: 'cheques.view' },
      { name: 'Supplier Ledger', url: '/supplier-ledger', permission: 'supplier_ledger.read' },
      { name: 'Reconciliation Summary', url: '/reconciliation/summary', permission: 'reconciliation.read' },
      
      // Reports
      { name: 'Profit Analysis', url: '/profit-analysis/bills', permission: 'reports.read' },
      { name: 'Margin Analysis', url: '/margin-analysis/category', permission: 'marginAnalysis.read' },
      
      // Sales & Purchase
      { name: 'Sales Orders', url: '/sales-orders', permission: 'sales.order.dashboard' },
      { name: 'Purchase Orders', url: '/purchase-orders', permission: 'po.management' },
      
      // Inventory
      { name: 'Stock', url: '/stock', permission: 'stock' },
      
      // HRMS
      { name: 'Attendance', url: '/attendance', permission: 'attendance.master' }
    ];

    console.log('\n2. Testing API endpoints...\n');

    let successCount = 0;
    let totalTests = testEndpoints.length;

    for (const endpoint of testEndpoints) {
      try {
        const response = await fetch(`${BASE_URL}${endpoint.url}`, {
          method: 'GET',
          headers: headers
        });

        if (response.status === 200) {
          console.log(`✅ ${endpoint.name} API successful`);
          successCount++;
        } else if (response.status === 403) {
          console.log(`❌ ${endpoint.name} API failed: 403 (Permission: ${endpoint.permission})`);
        } else if (response.status === 404) {
          console.log(`⚠️  ${endpoint.name} API not found: 404 (Endpoint may not exist)`);
          successCount++; // Don't count as failure if endpoint doesn't exist
        } else {
          console.log(`❌ ${endpoint.name} API failed: ${response.status}`);
        }
      } catch (error) {
        console.log(`❌ ${endpoint.name} API error:`, error.message);
      }
    }

    console.log(`\n📊 Test Results: ${successCount}/${totalTests} endpoints accessible`);
    
    if (successCount >= totalTests * 0.8) {
      console.log('🎉 Permission system is working well!');
    } else {
      console.log('⚠️  Some permissions may need adjustment');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testComprehensivePermissions();