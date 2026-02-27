// verify-new-permissions.js - Verify all new permissions are available
import { AVAILABLE_PERMISSIONS } from './config/permissions.js';

console.log('='.repeat(80));
console.log('PERMISSION VERIFICATION REPORT');
console.log('='.repeat(80));
console.log();

// Count total permissions
let totalPermissions = 0;
const categoryBreakdown = {};

Object.entries(AVAILABLE_PERMISSIONS).forEach(([category, permissions]) => {
  categoryBreakdown[category] = permissions.length;
  totalPermissions += permissions.length;
});

console.log('📊 TOTAL PERMISSIONS:', totalPermissions);
console.log();

// Display by category
console.log('📁 PERMISSIONS BY CATEGORY:');
console.log('-'.repeat(80));
Object.entries(categoryBreakdown).forEach(([category, count]) => {
  console.log(`${category.padEnd(40)} ${count.toString().padStart(3)} permissions`);
});
console.log('-'.repeat(80));
console.log();

// Check for newly added permissions
console.log('✨ NEWLY ADDED PERMISSIONS:');
console.log('-'.repeat(80));

const newPermissions = {
  'Inventory & Warehouse Control': [
    'realtime.stock.report',
    'damaged.expired.goods',
    'manual.stock.adjustment',
    'category.manager',
    'inventory.management.full',
    'stock.with.adjustment'
  ],
  'HRMS Administration': [
    'salary.processing'
  ],
  'Master Management': [
    'price.tier.master',
    'employee.master'
  ],
  'Expense Management': [
    'expense.claim.approval',
    'expense.document.tracker'
  ],
  'Supplier Incentive Management': [
    'supplier.incentive.management',
    'supplier.scheme.analysis',
    'supplier.purchase.entry',
    'supplier.scheme.entry',
    'supplier.claim.submission',
    'supplier.reconciliation.tracker'
  ]
};

let foundCount = 0;
let missingCount = 0;

Object.entries(newPermissions).forEach(([category, permissionIds]) => {
  console.log(`\n${category}:`);
  
  const categoryPermissions = AVAILABLE_PERMISSIONS[category];
  
  if (!categoryPermissions) {
    console.log(`  ❌ Category not found!`);
    missingCount += permissionIds.length;
    return;
  }
  
  permissionIds.forEach(permId => {
    const found = categoryPermissions.find(p => p.id === permId);
    if (found) {
      console.log(`  ✅ ${permId.padEnd(35)} - ${found.name}`);
      foundCount++;
    } else {
      console.log(`  ❌ ${permId.padEnd(35)} - NOT FOUND`);
      missingCount++;
    }
  });
});

console.log();
console.log('-'.repeat(80));
console.log(`✅ Found: ${foundCount} permissions`);
console.log(`❌ Missing: ${missingCount} permissions`);
console.log('-'.repeat(80));
console.log();

// Verify specific permission details
console.log('🔍 DETAILED VERIFICATION:');
console.log('-'.repeat(80));

// Check Supplier Incentive Management module
const supplierModule = AVAILABLE_PERMISSIONS['Supplier Incentive Management'];
if (supplierModule) {
  console.log('✅ Supplier Incentive Management module exists');
  console.log(`   Contains ${supplierModule.length} permissions:`);
  supplierModule.forEach(p => {
    console.log(`   - ${p.id}: ${p.name}`);
  });
} else {
  console.log('❌ Supplier Incentive Management module NOT FOUND');
}

console.log();

// Check Inventory additions
const inventoryModule = AVAILABLE_PERMISSIONS['Inventory & Warehouse Control'];
if (inventoryModule) {
  const inventoryCount = inventoryModule.length;
  console.log(`✅ Inventory & Warehouse Control has ${inventoryCount} permissions`);
  
  const newInventoryPerms = inventoryModule.filter(p => 
    ['realtime.stock.report', 'damaged.expired.goods', 'manual.stock.adjustment', 
     'category.manager', 'inventory.management.full', 'stock.with.adjustment'].includes(p.id)
  );
  
  console.log(`   New permissions added: ${newInventoryPerms.length}/6`);
  newInventoryPerms.forEach(p => {
    console.log(`   - ${p.id}: ${p.name}`);
  });
} else {
  console.log('❌ Inventory & Warehouse Control module NOT FOUND');
}

console.log();
console.log('='.repeat(80));
console.log('VERIFICATION COMPLETE');
console.log('='.repeat(80));

// Exit with appropriate code
if (missingCount > 0) {
  console.log(`\n⚠️  WARNING: ${missingCount} permissions are missing!`);
  process.exit(1);
} else {
  console.log('\n✅ All new permissions verified successfully!');
  process.exit(0);
}
