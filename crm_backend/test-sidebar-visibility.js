// test-sidebar-visibility.js
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

async function testSidebarVisibility() {
  console.log('🔍 Testing Sidebar Visibility for Nilesh...\n');

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
    
    // 2. Check what sidebar sections should be visible
    console.log('\n2. Expected Sidebar Sections for sub_admin:\n');
    
    const expectedSections = [
      '🏠 Dashboard',
      '⚙️ System Management',
      '📦 Master Management', 
      '🛒 Sales & Purchase Management',
      '📊 Sales Executive Attendance',
      '📦 Inventory & Warehouse Control',
      '👥 HRMS Administration',
      '💰 Finance & Accounts',
      '📈 Reports & Logs',
      '💳 Expense Management',
      '💬 Support & Chat',
      '📱 Sales Executive App',
      '🚚 Delivery Executive App'
    ];

    expectedSections.forEach((section, index) => {
      console.log(`   ${index + 1}. ${section}`);
    });

    console.log(`\n📊 Total Expected Sections: ${expectedSections.length}`);
    
    // 3. Check specific permissions that control sidebar visibility
    console.log('\n3. Key Permissions for Sidebar Sections:\n');
    
    const sidebarPermissions = [
      { section: 'System Management', permission: 'system.management' },
      { section: 'Master Management', permissions: ['master.management', 'product.master', 'dealer.master', 'supplier.master'] },
      { section: 'Sales & Purchase', permissions: ['sales.purchase.management', 'sales.order.dashboard'] },
      { section: 'Sales Executive Attendance', permission: 'se.attendance.view' },
      { section: 'Inventory & Warehouse', permissions: ['inventory.management', 'stock', 'stock.transfer'] },
      { section: 'HRMS Administration', permissions: ['hrms.management', 'employee.registration'] },
      { section: 'Finance & Accounts', permissions: ['finance.management', 'dealer.ledger'] },
      { section: 'Reports & Logs', permissions: ['reports.management', 'reports.read'] },
      { section: 'Expense Management', permissions: ['expense.management', 'expense.head.master'] },
      { section: 'Support & Chat', permission: 'support.chat' },
      { section: 'Sales Executive App', permission: 'sales.executive.app' },
      { section: 'Delivery Executive App', permission: 'delivery.executive.app' }
    ];

    const userPermissions = loginData.user.permissions;
    
    sidebarPermissions.forEach(item => {
      const permissions = item.permissions || [item.permission];
      const hasAccess = permissions.some(perm => userPermissions.includes(perm));
      const status = hasAccess ? '✅' : '❌';
      console.log(`   ${status} ${item.section}`);
      if (!hasAccess) {
        console.log(`      Missing: ${permissions.join(' OR ')}`);
      }
    });

    console.log('\n4. Summary:');
    console.log('===========');
    console.log('After the sidebar fix, nilesh should see ALL 13 sections in the sidebar.');
    console.log('If any sections are still missing, check the permission filtering logic.');
    console.log('');
    console.log('🔧 Sidebar Fix Applied:');
    console.log('   • Updated sub_admin roleConfig to include all baseConfig sections');
    console.log('   • Added missing salesExecutiveAttendance section');
    console.log('   • All 13 sections now included in sub_admin configuration');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSidebarVisibility();