// manage-user-permissions.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';
import { AVAILABLE_PERMISSIONS } from './config/permissions.js';

dotenv.config();

// Predefined permission sets for different roles
const ROLE_PERMISSION_SETS = {
  sub_admin: [
    // General
    'dashboard.view',
    'system.management',
    'users.manage',
    'user.management',
    
    // Master Management - ALL permissions
    'master.management',
    'product.master',
    'product.management',
    'dealer.master',
    'dealer.management',
    'dealers.view',
    'dealers.create',
    'dealers.update',
    'dealers.delete',
    'supplier.master',
    'supplier.management',
    'categories.view',
    'categories.create',
    'categories.update',
    'categories.delete',
    'category.setup',
    'region.master',
    'dealer.type',
    'dealer.category',
    'expense.category',
    'warehouseMaster',
    
    // Sales & Purchase - ALL permissions
    'sales.purchase.management',
    'sales.order.dashboard',
    'dealer.specific.discounts',
    'purchasing.points',
    'po.management',
    'grn.entry',
    'invoice',
    'credit.note',
    'debit.note',
    'payment',
    
    // Inventory & Warehouse - ALL permissions
    'inventory.management',
    'stock',
    'stock.transfer',
    
    // HRMS - ALL permissions
    'hrms.management',
    'employee.registration',
    'employees.view',
    'employees.create',
    'employees.update',
    'employees.delete',
    'geo.attendance.monitoring',
    'attendance.master',
    'generate.salary.slip',
    
    // Finance & Accounts - ALL permissions
    'finance.management',
    'dealer.ledger',
    'supplier.ledger',
    'supplier_ledger.read',
    'supplier_ledger.create',
    'supplier_ledger.update',
    'supplier_ledger.delete',
    'cheque.management',
    'cheques.view',
    'cheques.create',
    'cheques.update',
    'cheques.delete',
    'auto.reconciliation',
    'reconciliation.read',
    'reconciliation.create',
    'reconciliation.update',
    'reconciliation.delete',
    
    // Reports & Logs - ALL permissions
    'reports.management',
    'reports.read',
    'activity.logs',
    'subadmin.activity.logs',
    'bill.wise.profit',
    'category.product.gross.margin',
    'sale.vs.purchase.price.deviation',
    'download.logs',
    'download_logs',
    'dealer.performance',
    'dealer_performance_read',
    'dealer_performance_create',
    'dealer_performance_update',
    'dealer_performance_delete',
    'marginAnalysis.read',
    'marginAnalysis.create',
    'marginAnalysis.update',
    'marginAnalysis.delete',
    
    // Expense Management - ALL permissions
    'expense.management',
    'expense.head.master',
    
    // Support & Communication
    'support.chat',
    
    // Sales Executive App - ALL permissions
    'sales.executive.app',
    'se.attendance.view',
    'se.route.plan',
    'se.dealer.insights',
    'se.product.recommendations',
    'se.collections.view',
    'se.targets.view',
    
    // Delivery Executive App - ALL permissions
    'delivery.executive.app',
    'de.assignment.manage',
    'de.monitoring.view',
    'de.deliveries.view',
    'de.tracking.view',
    'de.route.view',
    'de.collections.view',
    'de.history.view'
  ],
  
  sales_manager: [
    'dashboard.view',
    'dealer.master',
    'dealer.management',
    'dealers.view',
    'dealers.create',
    'dealers.update',
    'product.master',
    'categories.view',
    'sales.purchase.management',
    'sales.order.dashboard',
    'dealer.specific.discounts',
    'reports.read',
    'dealer.performance'
  ],
  
  purchase_manager: [
    'dashboard.view',
    'supplier.master',
    'supplier.management',
    'product.master',
    'categories.view',
    'sales.purchase.management',
    'supplier.ledger',
    'supplier_ledger.read',
    'supplier_ledger.create',
    'supplier_ledger.update',
    'reconciliation.read',
    'reconciliation.create',
    'reports.read'
  ],
  
  finance_manager: [
    'dashboard.view',
    'finance.management',
    'dealer.ledger',
    'supplier.ledger',
    'supplier_ledger.read',
    'supplier_ledger.create',
    'supplier_ledger.update',
    'supplier_ledger.delete',
    'reconciliation.read',
    'reconciliation.create',
    'reconciliation.update',
    'reconciliation.delete',
    'reports.read',
    'marginAnalysis.read'
  ],
  
  hr_manager: [
    'dashboard.view',
    'hrms.management',
    'employee.registration',
    'employees.view',
    'employees.create',
    'employees.update',
    'employees.delete',
    'attendance.master',
    'reports.read'
  ]
};

async function manageUserPermissions() {
  try {
    console.log('🔧 User Permission Management Tool');
    console.log('================================\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Get command line arguments
    const args = process.argv.slice(2);
    const command = args[0];
    const userEmail = args[1];
    const roleOrPermissions = args[2];

    if (!command || !userEmail) {
      console.log('Usage:');
      console.log('  node manage-user-permissions.js assign-role <email> <role>');
      console.log('  node manage-user-permissions.js list-permissions <email>');
      console.log('  node manage-user-permissions.js list-users');
      console.log('  node manage-user-permissions.js show-role-permissions <role>');
      console.log('\nAvailable roles:', Object.keys(ROLE_PERMISSION_SETS).join(', '));
      return;
    }

    switch (command) {
      case 'assign-role':
        await assignRolePermissions(userEmail, roleOrPermissions);
        break;
      case 'list-permissions':
        await listUserPermissions(userEmail);
        break;
      case 'list-users':
        await listAllUsers();
        break;
      case 'show-role-permissions':
        showRolePermissions(roleOrPermissions);
        break;
      default:
        console.log('❌ Unknown command:', command);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

async function assignRolePermissions(email, role) {
  const user = await User.findOne({ email });
  
  if (!user) {
    console.log('❌ User not found:', email);
    return;
  }

  if (!ROLE_PERMISSION_SETS[role]) {
    console.log('❌ Unknown role:', role);
    console.log('Available roles:', Object.keys(ROLE_PERMISSION_SETS).join(', '));
    return;
  }

  const permissions = ROLE_PERMISSION_SETS[role];
  
  console.log(`🔄 Assigning ${role} permissions to ${user.name} (${email})`);
  console.log(`Permissions count: ${permissions.length}`);
  
  user.permissions = permissions;
  await user.save();
  
  console.log('✅ Permissions assigned successfully!');
}

async function listUserPermissions(email) {
  const user = await User.findOne({ email });
  
  if (!user) {
    console.log('❌ User not found:', email);
    return;
  }

  console.log(`📋 Permissions for ${user.name} (${email})`);
  console.log(`Role: ${user.role}`);
  console.log(`Total permissions: ${user.permissions.length}`);
  console.log('\nPermissions:');
  user.permissions.forEach((permission, index) => {
    console.log(`  ${index + 1}. ${permission}`);
  });
}

async function listAllUsers() {
  const users = await User.find({}).select('name email role permissions');
  
  console.log('👥 All Users:');
  console.log('=============\n');
  
  users.forEach(user => {
    console.log(`Name: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
    console.log(`Permissions: ${user.permissions.length}`);
    console.log('---');
  });
}

function showRolePermissions(role) {
  if (!ROLE_PERMISSION_SETS[role]) {
    console.log('❌ Unknown role:', role);
    console.log('Available roles:', Object.keys(ROLE_PERMISSION_SETS).join(', '));
    return;
  }

  const permissions = ROLE_PERMISSION_SETS[role];
  
  console.log(`📋 Default permissions for ${role}:`);
  console.log(`Total: ${permissions.length} permissions\n`);
  
  permissions.forEach((permission, index) => {
    console.log(`  ${index + 1}. ${permission}`);
  });
}

// Run the tool
manageUserPermissions();