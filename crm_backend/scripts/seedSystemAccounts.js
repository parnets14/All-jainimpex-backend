/**
 * Seed System Accounts for Automatic Accounting
 * 
 * Creates the required system accounts in all companies:
 * - Sundry Debtors (Asset)
 * - Sundry Creditors (Liability)
 * - Sales Account (Income)
 * - Purchase Account (Expense)
 * - GST Payable (Liability)
 * - GST Input Credit (Asset)
 * - Bank Account (Asset)
 * - Cash Account (Asset)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { accountMasterSchema } from '../models/AccountMaster.js';

dotenv.config();

const COMPANIES = [
  { id: 'jain-impex', name: 'JainImpexCRM' },
  { id: 'ridhi', name: 'ridhi_crm' },
  { id: 'shree-jain-impex', name: 'shreejain_crm' }
];

const SYSTEM_ACCOUNTS = [
  {
    accountName: 'Sundry Debtors',
    accountGroup: 'Sundry Debtors',
    accountType: 'Asset',
    openingBalance: 0,
    currentBalance: 0,
    isSystem: true,
    description: 'Customer receivables account'
  },
  {
    accountName: 'Sundry Creditors',
    accountGroup: 'Sundry Creditors',
    accountType: 'Liability',
    openingBalance: 0,
    currentBalance: 0,
    isSystem: true,
    description: 'Supplier payables account'
  },
  {
    accountName: 'Sales Account',
    accountGroup: 'Sales',
    accountType: 'Income',
    openingBalance: 0,
    currentBalance: 0,
    isSystem: true,
    description: 'Revenue from sales'
  },
  {
    accountName: 'Purchase Account',
    accountGroup: 'Purchase',
    accountType: 'Expense',
    openingBalance: 0,
    currentBalance: 0,
    isSystem: true,
    description: 'Cost of purchases'
  },
  {
    accountName: 'GST Payable',
    accountGroup: 'GST Payable',
    accountType: 'Liability',
    openingBalance: 0,
    currentBalance: 0,
    isSystem: true,
    description: 'Output GST liability'
  },
  {
    accountName: 'GST Input Credit',
    accountGroup: 'GST Input Credit',
    accountType: 'Asset',
    openingBalance: 0,
    currentBalance: 0,
    isSystem: true,
    description: 'Input GST credit'
  },
  {
    accountName: 'Cash Account',
    accountGroup: 'Current Assets',
    accountType: 'Asset',
    openingBalance: 0,
    currentBalance: 0,
    isSystem: true,
    description: 'Cash in hand'
  },
  {
    accountName: 'Bank Account',
    accountGroup: 'Current Assets',
    accountType: 'Asset',
    openingBalance: 0,
    currentBalance: 0,
    isSystem: true,
    description: 'Bank balance'
  }
];

const getModels = (dbConnection) => {
  return {
    AccountMaster: dbConnection.models.AccountMaster || dbConnection.model('AccountMaster', accountMasterSchema)
  };
};

const seedCompanyAccounts = async (companyId, companyName) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏢 Processing Company: ${companyName}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    const dbConnection = getCompanyConnection(companyId);
    const { AccountMaster } = getModels(dbConnection);
    
    let created = 0;
    let skipped = 0;
    let updated = 0;
    
    for (const accountData of SYSTEM_ACCOUNTS) {
      try {
        // Check if account already exists
        const existing = await AccountMaster.findOne({ 
          accountName: accountData.accountName,
          isSystem: true 
        });
        
        if (existing) {
          // Update to ensure it's marked as system account
          if (!existing.isSystem) {
            existing.isSystem = true;
            await existing.save();
            updated++;
            console.log(`   ✏️  Updated: ${accountData.accountName}`);
          } else {
            skipped++;
            console.log(`   ⏭️  Skipped: ${accountData.accountName} (already exists)`);
          }
        } else {
          // Create new account
          await AccountMaster.create(accountData);
          created++;
          console.log(`   ✅ Created: ${accountData.accountName}`);
        }
      } catch (error) {
        console.error(`   ❌ Error processing ${accountData.accountName}:`, error.message);
      }
    }
    
    console.log(`\n   📊 Summary: ${created} created, ${updated} updated, ${skipped} skipped`);
    
    return { created, updated, skipped };
    
  } catch (error) {
    console.error(`   ❌ Error processing company ${companyName}:`, error);
    return { created: 0, updated: 0, skipped: 0 };
  }
};

const main = async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🏦 SYSTEM ACCOUNTS SEEDING');
  console.log('='.repeat(60));
  console.log('\nCreating required system accounts for automatic accounting...\n');
  
  const startTime = Date.now();
  const results = {};
  
  try {
    // Process each company
    for (const company of COMPANIES) {
      results[company.id] = await seedCompanyAccounts(company.id, company.name);
    }
    
    // Print final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SEEDING SUMMARY');
    console.log('='.repeat(60));
    
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    
    for (const company of COMPANIES) {
      const result = results[company.id];
      console.log(`\n🏢 ${company.name}:`);
      console.log(`   Created: ${result.created}`);
      console.log(`   Updated: ${result.updated}`);
      console.log(`   Skipped: ${result.skipped}`);
      
      totalCreated += result.created;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
    }
    
    console.log('\n' + '-'.repeat(60));
    console.log(`📈 GRAND TOTAL:`);
    console.log(`   ✅ Created: ${totalCreated}`);
    console.log(`   ✏️  Updated: ${totalUpdated}`);
    console.log(`   ⏭️  Skipped: ${totalSkipped}`);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️  Duration: ${duration} seconds`);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ SEEDING COMPLETE!');
    console.log('='.repeat(60));
    console.log('\nYou can now run the migration script:');
    console.log('node scripts/migrateHistoricalAccounting.js\n');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
};

// Run seeding
main();
