// fix-nilesh-permissions.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';

dotenv.config();

async function fixNileshPermissions() {
  try {
    console.log('🔧 Fixing Nilesh User Permissions...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find the nilesh user
    const user = await User.findOne({ email: 'nileshshreejainimpex@outlook.com' });
    
    if (!user) {
      console.log('❌ Nilesh user not found');
      return;
    }

    console.log('📋 Current user permissions:');
    console.log(user.permissions);

    // Add the missing permissions that are being checked in routes
    const additionalPermissions = [
      // Dealer permissions (for dealer stats API)
      'dealers.view',
      'dealers.create', 
      'dealers.update',
      'dealers.delete',
      
      // Category permissions
      'categories.view',
      'categories.create',
      'categories.update', 
      'categories.delete',
      
      // Employee permissions
      'employees.view',
      'employees.create',
      'employees.update',
      'employees.delete',
      
      // Supplier permissions
      'supplier.master',
      'supplier.management',
      'supplier_ledger.read',
      'supplier_ledger.create',
      'supplier_ledger.update',
      'supplier_ledger.delete',
      
      // Reports permissions
      'reports.read',
      'reports.management',
      'marginAnalysis.read',
      'download_logs',
      
      // Finance permissions
      'reconciliation.read',
      'reconciliation.create',
      'reconciliation.update',
      'reconciliation.delete',
      
      // Master management
      'master.management',
      'warehouseMaster',
      
      // Sales & Purchase
      'sales.purchase.management',
      'sales.order.dashboard',
      'dealer.specific.discounts',
      
      // HRMS
      'hrms.management',
      'employee.registration',
      'attendance.master',
      
      // Finance & Accounts
      'finance.management',
      'dealer.ledger',
      'supplier.ledger',
      
      // Expense Management
      'expense.management',
      'expense.category',
      
      // Region and other masters
      'region.master',
      'dealer.type',
      'dealer.category',
      'category.setup'
    ];

    // Combine existing permissions with new ones (remove duplicates)
    const updatedPermissions = [...new Set([...user.permissions, ...additionalPermissions])];

    console.log('\n🔄 Updating permissions...');
    console.log('New permissions count:', updatedPermissions.length);
    console.log('Added permissions:', additionalPermissions.filter(p => !user.permissions.includes(p)));

    // Update the user
    user.permissions = updatedPermissions;
    await user.save();

    console.log('✅ Permissions updated successfully!');
    console.log('\n📋 Final permissions:');
    console.log(updatedPermissions);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the fix
fixNileshPermissions();