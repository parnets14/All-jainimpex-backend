/**
 * Update System Account Groups
 * 
 * Updates existing system accounts to use the new specific account groups
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

const ACCOUNT_UPDATES = [
  { name: 'Sundry Debtors', newGroup: 'Sundry Debtors' },
  { name: 'Sundry Creditors', newGroup: 'Sundry Creditors' },
  { name: 'GST Payable', newGroup: 'GST Payable' },
  { name: 'GST Input Credit', newGroup: 'GST Input Credit' }
];

const getModels = (dbConnection) => {
  return {
    AccountMaster: dbConnection.models.AccountMaster || dbConnection.model('AccountMaster', accountMasterSchema)
  };
};

const updateCompanyAccounts = async (companyId, companyName) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏢 Processing Company: ${companyName}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    const dbConnection = getCompanyConnection(companyId);
    const { AccountMaster } = getModels(dbConnection);
    
    let updated = 0;
    let notFound = 0;
    
    for (const { name, newGroup } of ACCOUNT_UPDATES) {
      try {
        const account = await AccountMaster.findOne({ accountName: name });
        
        if (account) {
          const oldGroup = account.accountGroup;
          if (oldGroup !== newGroup) {
            account.accountGroup = newGroup;
            await account.save();
            updated++;
            console.log(`   ✅ Updated: ${name}`);
            console.log(`      ${oldGroup} → ${newGroup}`);
          } else {
            console.log(`   ⏭️  Skipped: ${name} (already ${newGroup})`);
          }
        } else {
          notFound++;
          console.log(`   ⚠️  Not Found: ${name}`);
        }
      } catch (error) {
        console.error(`   ❌ Error updating ${name}:`, error.message);
      }
    }
    
    console.log(`\n   📊 Summary: ${updated} updated, ${notFound} not found`);
    
    return { updated, notFound };
    
  } catch (error) {
    console.error(`   ❌ Error processing company ${companyName}:`, error);
    return { updated: 0, notFound: 0 };
  }
};

const main = async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 UPDATE SYSTEM ACCOUNT GROUPS');
  console.log('='.repeat(60));
  console.log('\nUpdating system accounts to use new specific groups...\n');
  
  const startTime = Date.now();
  const results = {};
  
  try {
    // Process each company
    for (const company of COMPANIES) {
      results[company.id] = await updateCompanyAccounts(company.id, company.name);
    }
    
    // Print final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 UPDATE SUMMARY');
    console.log('='.repeat(60));
    
    let totalUpdated = 0;
    let totalNotFound = 0;
    
    for (const company of COMPANIES) {
      const result = results[company.id];
      console.log(`\n🏢 ${company.name}:`);
      console.log(`   Updated: ${result.updated}`);
      console.log(`   Not Found: ${result.notFound}`);
      
      totalUpdated += result.updated;
      totalNotFound += result.notFound;
    }
    
    console.log('\n' + '-'.repeat(60));
    console.log(`📈 GRAND TOTAL:`);
    console.log(`   ✅ Updated: ${totalUpdated}`);
    console.log(`   ⚠️  Not Found: ${totalNotFound}`);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️  Duration: ${duration} seconds`);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ UPDATE COMPLETE!');
    console.log('='.repeat(60));
    console.log('\nRefresh Account Master page to see the updated groups.\n');
    
  } catch (error) {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
};

// Run update
main();
