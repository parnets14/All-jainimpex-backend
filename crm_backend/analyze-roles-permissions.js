import { AVAILABLE_PERMISSIONS } from './config/permissions.js';
import fs from 'fs';
import path from 'path';

console.log('='.repeat(80));
console.log('COMPREHENSIVE ROLE & PERMISSION ANALYSIS');
console.log('='.repeat(80));

// Read the sidebar file to extract role configurations
const sidebarPath = '../../JainInpexCRM/src/Components/CRMSidebar.jsx';
let sidebarContent = '';
try {
  sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
} catch (error) {
  console.error('❌ Could not read sidebar file:', error.message);
  process.exit(1);
}

// Extract role configurations from sidebar
const extractRoleConfig = (content) => {
  const roleConfigMatch = content.match(/const roleConfigs = \{([\s\S]*?)\};/);
  if (!roleConfigMatch) return null;
  
  const configText = roleConfigMatch[1];
  const roles = {};
  
  // Extract each role's sections
  const roleMatches = configText.matchAll(/(\w+):\s*\{[\s\S]*?sections:\s*\[([\s\S]*?)\]/g);
  
  for (const match of roleMatches) {
    const roleName = match[1];
    const sectionsText = match[2];
    const sections = sectionsText.match(/baseConfig\.(\w+)/g)?.map(s => s.replace('baseConfig.', '')) || [];
    roles[roleName] = sections;
  }
  
  return roles;
};

// Extract all menu items with their permissions
const extractMenuItems = (content) => {
  const items = [];
  
  // Find baseConfig definition
  const baseConfigMatch = content.match(/const baseConfig = \{([\s\S]*?)const roleConfigs/);
  if (!baseConfigMatch) return items;
  
  const configText = baseConfigMatch[1];
  
  // Extract each section
  const sectionMatches = configText.matchAll(/(\w+):\s*\{[\s\S]*?id:\s*"([^"]+)"[\s\S]*?title:\s*"([^"]+)"[\s\S]*?(?:permission:\s*"([^"]+)"|modulePermissions:\s*\[([^\]]+)\])?/g);
  
  for (const match of sectionMatches) {
    const [, varName, id, title, permission, modulePerms] = match;
    items.push({
      section: varName,
      id,
      title,
      permission: permission || null,
      modulePermissions: modulePerms ? modulePerms.match(/"([^"]+)"/g)?.map(p => p.replace(/"/g, '')) : null
    });
  }
  
  return items;
};

const roleConfigs = extractRoleConfig(sidebarContent);
const menuItems = extractMenuItems(sidebarContent);

console.log('\n📋 ROLE CONFIGURATIONS IN SIDEBAR');
console.log('='.repeat(80));

for (const [role, sections] of Object.entries(roleConfigs)) {
  console.log(`\n${role.toUpperCase().replace(/_/g, ' ')}:`);
  console.log(`  Sections: ${sections.length}`);
  sections.forEach(section => {
    console.log(`    - ${section}`);
  });
}

console.log('\n\n🔑 PERMISSION CATEGORIES');
console.log('='.repeat(80));

for (const [category, permissions] of Object.entries(AVAILABLE_PERMISSIONS)) {
  console.log(`\n${category}:`);
  console.log(`  Total Permissions: ${permissions.length}`);
  permissions.forEach(perm => {
    console.log(`    - ${perm.id}: ${perm.name}`);
  });
}

console.log('\n\n🗺️  MENU ITEMS & REQUIRED PERMISSIONS');
console.log('='.repeat(80));

menuItems.forEach(item => {
  console.log(`\n${item.title} (${item.id}):`);
  if (item.permission) {
    console.log(`  Permission: ${item.permission}`);
  }
  if (item.modulePermissions) {
    console.log(`  Module Permissions: ${item.modulePermissions.join(', ')}`);
  }
  if (!item.permission && !item.modulePermissions) {
    console.log(`  ⚠️  No permissions required (always visible)`);
  }
});

console.log('\n\n🔍 COMPONENT FILE VERIFICATION');
console.log('='.repeat(80));

// Define expected component paths based on sidebar routes
const componentPaths = {
  // System Management
  '/system/users': 'JainInpexCRM/src/Components/UserManagement.jsx',
  
  // Master Management
  '/masters/products': 'JainInpexCRM/src/Components/MasterManagement/ProductMaster.jsx',
  '/masters/dealer-product-pricing': 'JainInpexCRM/src/Components/MasterManagement/DealerProductPricing.jsx',
  '/masters/categories': 'JainInpexCRM/src/Components/MasterManagement/CategorySetup.jsx',
  '/masters/dealer-type': 'JainInpexCRM/src/Components/MasterManagement/DealerType.jsx',
  '/masters/dealer-category': 'JainInpexCRM/src/Components/MasterManagement/DealerCategory.jsx',
  '/masters/expense-category': 'JainInpexCRM/src/Components/MasterManagement/ExpenseCategory.jsx',
  '/masters/regions': 'JainInpexCRM/src/Components/MasterManagement/RegionMaster.jsx',
  '/masters/routes': 'JainInpexCRM/src/Components/MasterManagement/RouteMaster.jsx',
  '/masters/warehouse-master': 'JainInpexCRM/src/Components/MasterManagement/WarehouseMaster.jsx',
  '/masters/dealers': 'JainInpexCRM/src/Components/MasterManagement/DealerMaster.jsx',
  '/masters/suppliers': 'JainInpexCRM/src/Components/MasterManagement/SupplierMaster.jsx',
  
  // Sales & Purchase
  '/sales-purchase/sales-order-dashboard': 'JainInpexCRM/src/Sales&Purchase/SalesOrderDashboard.jsx',
  '/sales-purchase/dealer-discounts': 'JainInpexCRM/src/Sales&Purchase/DealerDiscounts.jsx',
  '/sales-purchase/purchasing-points': 'JainInpexCRM/src/Sales&Purchase/PurchasingPoints.jsx',
  '/sales-purchase/po-management': 'JainInpexCRM/src/Sales&Purchase/PurchaseOrderManagement.jsx',
  '/sales-purchase/grn-entry': 'JainInpexCRM/src/Sales&Purchase/GRNEntryModule.jsx',
  '/sales-purchase/invoicing-dispatch': 'JainInpexCRM/src/Sales&Purchase/DealerInvoice.jsx',
  '/sales-purchase/supplier-invoice': 'JainInpexCRM/src/Sales&Purchase/SupplierInvoice.jsx',
  '/sales-purchase/supplier-payments': 'JainInpexCRM/src/Sales&Purchase/SupplierPayments.jsx',
  '/sales-purchase/dealer-payments': 'JainInpexCRM/src/Sales&Purchase/DealerPayment.jsx',
  '/sales-purchase/debit-note': 'JainInpexCRM/src/Sales&Purchase/DebitNote.jsx',
  '/sales-purchase/credit-note': 'JainInpexCRM/src/Sales&Purchase/CreditNote.jsx',
  
  // Support
  '/support/chat': 'JainInpexCRM/src/Support/SupportChat.jsx',
  
  // Sales Executive Attendance
  '/sales-executive/attendance': 'JainInpexCRM/src/SalesExecutiveApp/AttendanceViewer.jsx',
  
  // Inventory
  '/inventory/stock': 'JainInpexCRM/src/Inventory&Warehouse/Stock.jsx',
  '/inventory/stock-transfer': 'JainInpexCRM/src/Inventory&Warehouse/StockTransfer.jsx',
  
  // HRMS
  '/hrms-admin/employee-registration': 'JainInpexCRM/src/HRMS/EmployeeRegistration.jsx',
  '/hrms-admin/geo-attendance': 'JainInpexCRM/src/HRMS/GeoAttendanceMonitoring.jsx',
  '/hrms-admin/attendance-master': 'JainInpexCRM/src/HRMS/AttendanceMaster.jsx',
  '/hrms-admin/generate-salary-slip': 'JainInpexCRM/src/HRMS/GenerateSalarySlip.jsx',
  
  // Finance
  '/finance-accounts/bank-account-master': 'JainInpexCRM/src/Finance&Accounts/BankAccountMaster.jsx',
  '/finance-accounts/voucher-entry': 'JainInpexCRM/src/Finance&Accounts/VoucherEntry.jsx',
  '/finance-accounts/payment-allocation': 'JainInpexCRM/src/Finance&Accounts/PaymentAllocation.jsx',
  '/finance-accounts/cash-bank-book': 'JainInpexCRM/src/Finance&Accounts/CashBankBook.jsx',
  '/finance-accounts/dealer-ledger': 'JainInpexCRM/src/Finance&Accounts/DealerLedger.jsx',
  '/finance-accounts/supplier-ledger': 'JainInpexCRM/src/Finance&Accounts/SupplierLedger.jsx',
  '/finance-accounts/cheque-management': 'JainInpexCRM/src/Finance&Accounts/ChequeManagement.jsx',
  '/finance-accounts/auto-reconciliation': 'JainInpexCRM/src/Finance&Accounts/AutoReconciliation.jsx',
  
  // Reports
  '/reports-logs/profit-analysis/bill-wise-profit': 'JainInpexCRM/src/Reports&Logs/BillWiseProfit.jsx',
  '/reports-logs/profit-analysis/category-product-margin': 'JainInpexCRM/src/Reports&Logs/CategoryProductMargin.jsx',
  '/reports-logs/profit-analysis/sale-vs-purchase-deviation': 'JainInpexCRM/src/Reports&Logs/DeviationReport.jsx',
  '/reports-logs/activity-logs': 'JainInpexCRM/src/Reports&Logs/ActivityLogs.jsx',
  '/reports-logs/download-logs': 'JainInpexCRM/src/Reports&Logs/DownloadLogs.jsx',
  '/reports-logs/dealer-performance': 'JainInpexCRM/src/Reports&Logs/DealerPerformance.jsx',
  
  // Expense
  '/expense-management/expense-head-master': 'JainInpexCRM/src/ExpenseManagement/ExpenseHeadMaster.jsx',
  
  // Sales Executive App
  '/se-app/attendance': 'JainInpexCRM/src/SalesExecutiveApp/AttendanceViewer.jsx',
  '/se-app/route-plan': 'JainInpexCRM/src/SalesExecutiveApp/RoutePlanManagement.jsx',
  '/se-app/dealer-insights': 'JainInpexCRM/src/SalesExecutiveApp/DealerInsightsManagement.jsx',
  '/se-app/product-recommendations': 'JainInpexCRM/src/SalesExecutiveApp/ProductRecommendations.jsx',
  '/se-app/collections': 'JainInpexCRM/src/SalesExecutiveApp/CollectionViewer.jsx',
  '/se-app/targets': 'JainInpexCRM/src/SalesExecutiveApp/TargetManagement.jsx',
  
  // Delivery Executive App
  '/de-app/assignment': 'JainInpexCRM/src/DeliveryExecutiveApp/DeliveryAssignment.jsx',
  '/de-app/monitoring': 'JainInpexCRM/src/DeliveryExecutiveApp/DeliveryMonitoring.jsx',
  '/de-app/my-deliveries': 'JainInpexCRM/src/DeliveryExecutiveApp/MyDeliveries.jsx',
  '/de-app/live-tracking': 'JainInpexCRM/src/DeliveryExecutiveApp/LiveTracking.jsx',
  '/de-app/route-plan': 'JainInpexCRM/src/DeliveryExecutiveApp/RoutePlan.jsx',
  '/de-app/collections': 'JainInpexCRM/src/DeliveryExecutiveApp/Collections.jsx',
  '/de-app/delivery-history': 'JainInpexCRM/src/DeliveryExecutiveApp/DeliveryHistory.jsx',
};

let existingCount = 0;
let missingCount = 0;

for (const [route, componentPath] of Object.entries(componentPaths)) {
  const fullPath = path.resolve(componentPath);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    console.log(`✅ ${route}`);
    console.log(`   ${componentPath}`);
    existingCount++;
  } else {
    console.log(`❌ ${route}`);
    console.log(`   MISSING: ${componentPath}`);
    missingCount++;
  }
}

console.log('\n\n📊 SUMMARY');
console.log('='.repeat(80));
console.log(`Total Routes: ${Object.keys(componentPaths).length}`);
console.log(`Existing Components: ${existingCount} ✅`);
console.log(`Missing Components: ${missingCount} ❌`);

console.log('\n\n⚠️  POTENTIAL ISSUES');
console.log('='.repeat(80));

// Check for roles missing sections
console.log('\n1. Role Configuration Issues:');
const allSections = ['dashboard', 'system', 'masters', 'salesPurchase', 'inventory', 'hrms', 'finance', 'reports', 'expense', 'support', 'salesExecutiveAttendance', 'salesExecutive', 'deliveryExecutive'];

for (const [role, sections] of Object.entries(roleConfigs)) {
  const missingSections = allSections.filter(s => !sections.includes(s));
  if (missingSections.length > 0) {
    console.log(`   ${role}: Missing sections - ${missingSections.join(', ')}`);
  }
}

// Check for permissions without corresponding menu items
console.log('\n2. Unused Permissions (defined but not used in sidebar):');
const usedPermissions = new Set();
menuItems.forEach(item => {
  if (item.permission) usedPermissions.add(item.permission);
  if (item.modulePermissions) {
    item.modulePermissions.forEach(p => usedPermissions.add(p));
  }
});

for (const [category, permissions] of Object.entries(AVAILABLE_PERMISSIONS)) {
  permissions.forEach(perm => {
    if (!usedPermissions.has(perm.id)) {
      console.log(`   ${perm.id} (${category})`);
    }
  });
}

console.log('\n✅ Analysis Complete!');
