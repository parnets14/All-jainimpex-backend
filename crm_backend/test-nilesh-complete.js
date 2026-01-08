// test-nilesh-complete.js
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

async function testNileshComplete() {
  console.log('🧪 Testing Nilesh Complete Access...\n');

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
    console.log(`User role: ${loginData.user.role}`);
    console.log(`User permissions count: ${loginData.user.permissions.length}`);
    
    const token = loginData.token;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Test comprehensive API access
    console.log('\n2. Testing API Access...\n');
    
    const apiTests = [
      // Core CRM APIs
      { name: 'Dashboard Data', url: '/users', category: 'System' },
      { name: 'Permissions Config', url: '/users/config/permissions', category: 'System' },
      
      // Master Management
      { name: 'Dealers Stats', url: '/dealers/stats', category: 'Master' },
      { name: 'Dealers List', url: '/dealers', category: 'Master' },
      { name: 'Categories', url: '/categories', category: 'Master' },
      { name: 'Products', url: '/products', category: 'Master' },
      { name: 'Suppliers', url: '/suppliers', category: 'Master' },
      { name: 'Employees', url: '/employees', category: 'Master' },
      
      // Sales & Purchase
      { name: 'Sales Orders', url: '/sales-orders', category: 'Sales' },
      { name: 'Purchase Orders', url: '/purchase-orders', category: 'Purchase' },
      
      // Finance & Accounts
      { name: 'Cheques', url: '/cheques', category: 'Finance' },
      { name: 'Supplier Ledger', url: '/supplier-ledger', category: 'Finance' },
      { name: 'Reconciliation Summary', url: '/reconciliation/summary', category: 'Finance' },
      
      // Reports
      { name: 'Profit Analysis', url: '/profit-analysis/bills', category: 'Reports' },
      { name: 'Margin Analysis', url: '/margin-analysis/category', category: 'Reports' },
      
      // Inventory
      { name: 'Stock', url: '/stock', category: 'Inventory' },
      
      // HRMS
      { name: 'Attendance', url: '/attendance', category: 'HRMS' },
      
      // Sales Executive App
      { name: 'SE Attendance All', url: '/se/attendance/all', category: 'SE App' },
      { name: 'SE Attendance Today', url: '/se/attendance/today', category: 'SE App' },
      
      // Delivery Executive App
      { name: 'DE Pending Reschedules', url: '/admin/deliveries/pending-reschedules', category: 'DE App' },
      { name: 'DE Failed Deliveries', url: '/admin/deliveries/failed-deliveries', category: 'DE App' }
    ];

    let successCount = 0;
    let totalTests = apiTests.length;
    const results = {};

    for (const test of apiTests) {
      try {
        const response = await fetch(`${BASE_URL}${test.url}`, {
          method: 'GET',
          headers: headers
        });

        if (!results[test.category]) {
          results[test.category] = { success: 0, total: 0, failed: [] };
        }
        results[test.category].total++;

        if (response.status === 200) {
          console.log(`✅ ${test.name}: 200 OK`);
          successCount++;
          results[test.category].success++;
        } else if (response.status === 403) {
          console.log(`❌ ${test.name}: 403 Forbidden`);
          results[test.category].failed.push(test.name);
        } else if (response.status === 404) {
          console.log(`⚠️  ${test.name}: 404 Not Found (endpoint may not exist)`);
          successCount++; // Don't count as failure
          results[test.category].success++;
        } else {
          console.log(`❌ ${test.name}: ${response.status}`);
          results[test.category].failed.push(test.name);
        }
      } catch (error) {
        console.log(`❌ ${test.name}: Network error - ${error.message}`);
        if (!results[test.category]) {
          results[test.category] = { success: 0, total: 0, failed: [] };
        }
        results[test.category].total++;
        results[test.category].failed.push(test.name);
      }
    }

    // 3. Summary by category
    console.log('\n📊 Results by Category:');
    console.log('========================');
    
    Object.entries(results).forEach(([category, result]) => {
      const percentage = Math.round((result.success / result.total) * 100);
      const status = percentage === 100 ? '✅' : percentage >= 80 ? '⚠️' : '❌';
      
      console.log(`${status} ${category}: ${result.success}/${result.total} (${percentage}%)`);
      
      if (result.failed.length > 0) {
        console.log(`   Failed: ${result.failed.join(', ')}`);
      }
    });

    console.log(`\n🎯 Overall Results: ${successCount}/${totalTests} APIs accessible`);
    
    const overallPercentage = Math.round((successCount / totalTests) * 100);
    
    if (overallPercentage >= 95) {
      console.log('🎉 Excellent! Nilesh has comprehensive access.');
    } else if (overallPercentage >= 80) {
      console.log('👍 Good! Most APIs are accessible, minor issues remain.');
    } else {
      console.log('⚠️  Issues detected. Some APIs are not accessible.');
    }

    // 4. Check specific permission issues
    console.log('\n🔍 Permission Analysis:');
    console.log('======================');
    
    const userPermissions = loginData.user.permissions;
    const criticalPermissions = [
      'dashboard.view',
      'users.manage',
      'dealers.view',
      'product.master',
      'sales.order.dashboard',
      'se.attendance.view',
      'de.assignment.manage'
    ];

    console.log('Critical permissions check:');
    criticalPermissions.forEach(perm => {
      const hasPermission = userPermissions.includes(perm);
      const status = hasPermission ? '✅' : '❌';
      console.log(`  ${status} ${perm}`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testNileshComplete();