// analyze-ui-permissions.js
import dotenv from 'dotenv';
import { AVAILABLE_PERMISSIONS } from './config/permissions.js';

dotenv.config();

function analyzeUIPermissions() {
  console.log('🔍 UI Components & Permission Analysis');
  console.log('=====================================\n');

  console.log('📊 PERMISSION CATEGORIES & COMPONENTS:\n');

  let totalPermissions = 0;
  let categoryCount = 0;

  Object.entries(AVAILABLE_PERMISSIONS).forEach(([category, permissions]) => {
    categoryCount++;
    console.log(`📁 ${categoryCount}. ${category.toUpperCase()}`);
    console.log(`   └── ${permissions.length} permissions available`);
    
    permissions.forEach((permission, index) => {
      console.log(`   ${index + 1}. ✓ ${permission.name}`);
      console.log(`      ID: ${permission.id}`);
      console.log(`      Description: ${permission.description}`);
      console.log('');
    });
    
    totalPermissions += permissions.length;
    console.log('');
  });

  console.log('📈 SUMMARY:');
  console.log(`   • Total Categories: ${categoryCount}`);
  console.log(`   • Total Permissions: ${totalPermissions}`);
  console.log('');

  console.log('🎯 UI COMPONENT MAPPING:');
  console.log('========================\n');

  // Map UI components to their permissions
  const uiComponentMapping = {
    'Dashboard': ['dashboard.view'],
    
    'System Management': {
      'User Management': ['users.manage', 'user.management']
    },
    
    'Master Management': {
      'Product Master': ['product.master', 'product.management'],
      'Dealer Product Pricing': ['product.master'],
      'Category Setup': ['category.setup', 'categories.view', 'categories.create', 'categories.update', 'categories.delete'],
      'Dealer Type': ['dealer.type'],
      'Dealer Category': ['dealer.category'],
      'Expense Category': ['expense.category'],
      'Region Master': ['region.master'],
      'Warehouse Master': ['warehouseMaster'],
      'Dealer Master': ['dealer.master', 'dealer.management', 'dealers.view', 'dealers.create', 'dealers.update', 'dealers.delete'],
      'Supplier Master': ['supplier.master', 'supplier.management']
    },
    
    'Sales & Purchase Management': {
      'Sales Order Dashboard': ['sales.order.dashboard'],
      'Dealer-Specific Discounts': ['dealer.specific.discounts'],
      'Purchasing Points': ['purchasing.points'],
      'PO Management': ['po.management'],
      'GRN Entry': ['grn.entry'],
      'Dealer Invoice': ['invoice'],
      'Supplier Invoice': ['invoice'],
      'Supplier Payments': ['payment'],
      'Dealer Payments': ['payment'],
      'Debit Note': ['debit.note'],
      'Credit Note': ['credit.note']
    },
    
    'Support & Chat': {
      'Support Chat': ['support.chat']
    },
    
    'Inventory & Warehouse Control': {
      'Stock': ['stock', 'inventory.management'],
      'Stock Transfer': ['stock.transfer']
    },
    
    'HRMS Administration': {
      'Employee Registration': ['employee.registration', 'employees.view', 'employees.create', 'employees.update', 'employees.delete'],
      'Geo Attendance Monitoring': ['geo.attendance.monitoring'],
      'Attendance Master': ['attendance.master'],
      'Generate Salary Slip': ['generate.salary.slip']
    },
    
    'Finance & Accounts': {
      'Dealer Ledger': ['dealer.ledger'],
      'Supplier Ledger': ['supplier.ledger', 'supplier_ledger.read', 'supplier_ledger.create', 'supplier_ledger.update', 'supplier_ledger.delete'],
      'Cheque Management': ['cheque.management', 'cheques.view', 'cheques.create', 'cheques.update', 'cheques.delete'],
      'Auto Reconciliation': ['auto.reconciliation', 'reconciliation.read', 'reconciliation.create', 'reconciliation.update', 'reconciliation.delete']
    },
    
    'Reports & Logs': {
      'Profit Analysis': {
        'Bill-wise Profit': ['bill.wise.profit'],
        'Category & Product Gross Margin': ['category.product.gross.margin'],
        'Deviation Report': ['sale.vs.purchase.price.deviation']
      },
      'Activity Logs': ['activity.logs', 'subadmin.activity.logs'],
      'Download Logs': ['download.logs', 'download_logs'],
      'Dealer Performance': ['dealer.performance', 'dealer_performance_read', 'dealer_performance_create', 'dealer_performance_update', 'dealer_performance_delete'],
      'Margin Analysis': ['marginAnalysis.read', 'marginAnalysis.create', 'marginAnalysis.update', 'marginAnalysis.delete']
    },
    
    'Expense Management': {
      'Expense Head Master': ['expense.head.master']
    },
    
    'Sales Executive App': {
      'Attendance Viewer': ['se.attendance.view'],
      'Route Plan Management': ['se.route.plan'],
      'Dealer Insights': ['se.dealer.insights'],
      'Product Recommendations': ['se.product.recommendations'],
      'Collections': ['se.collections.view'],
      'Target Management': ['se.targets.view']
    },
    
    'Delivery Executive App': {
      'Delivery Assignment': ['de.assignment.manage'],
      'Delivery Monitoring': ['de.monitoring.view'],
      'My Deliveries': ['de.deliveries.view'],
      'Live Tracking': ['de.tracking.view'],
      'Route Plan': ['de.route.view'],
      'Collections': ['de.collections.view'],
      'Delivery History': ['de.history.view']
    }
  };

  function printComponentMapping(components, level = 0) {
    const indent = '  '.repeat(level);
    
    Object.entries(components).forEach(([componentName, permissions]) => {
      if (Array.isArray(permissions)) {
        console.log(`${indent}📱 ${componentName}`);
        permissions.forEach(permission => {
          console.log(`${indent}   ✓ ${permission}`);
        });
      } else if (typeof permissions === 'object') {
        console.log(`${indent}📂 ${componentName}`);
        printComponentMapping(permissions, level + 1);
      }
      console.log('');
    });
  }

  printComponentMapping(uiComponentMapping);

  console.log('🎨 PERMISSION SELECTION UI:');
  console.log('===========================\n');
  console.log('In the User Management interface, permissions are organized as:');
  console.log('');
  console.log('1. 📁 Expandable Categories (like folders)');
  console.log('   ├── Category checkbox (select/deselect all in category)');
  console.log('   └── Individual permission checkboxes');
  console.log('');
  console.log('2. 🔍 Each permission shows:');
  console.log('   ├── Permission Name (user-friendly)');
  console.log('   ├── Permission ID (technical identifier)');
  console.log('   └── Description (what it allows)');
  console.log('');
  console.log('3. 🎯 Selection Features:');
  console.log('   ├── Individual permission selection');
  console.log('   ├── Category-wide selection (all permissions in category)');
  console.log('   ├── Indeterminate state (some permissions selected)');
  console.log('   └── Visual feedback for selected permissions');
  console.log('');

  console.log('💡 USAGE RECOMMENDATIONS:');
  console.log('=========================\n');
  console.log('For different roles, consider these permission sets:');
  console.log('');
  console.log('🔹 Sub Admin (Full Access): All 100 permissions');
  console.log('🔹 Sales Manager: Dashboard + Master Management + Sales & Purchase + Reports');
  console.log('🔹 Purchase Manager: Dashboard + Master Management + Sales & Purchase + Inventory');
  console.log('🔹 Finance Manager: Dashboard + Finance & Accounts + Reports');
  console.log('🔹 HR Manager: Dashboard + HRMS Administration + Employee-related permissions');
  console.log('🔹 Sales Executive: Dashboard + Sales Executive App + Limited master data view');
  console.log('');
}

analyzeUIPermissions();