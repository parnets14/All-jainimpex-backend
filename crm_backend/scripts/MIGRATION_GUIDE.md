# Historical Accounting Migration Guide

## Overview

This script creates automatic journal entries for all existing approved invoices and payments that don't have journal entries yet.

---

## What It Does

The migration script will:

1. **Find all approved dealer invoices** without journal entries
2. **Find all approved supplier invoices** without journal entries
3. **Find all approved dealer payments** without journal entries
4. **Find all approved supplier payments** without journal entries
5. **Create automatic journal entries** for all of them

It processes all 3 companies:
- JainImpexCRM
- ridhi_crm
- shreejain_crm

---

## Before Running

### 1. Backup Your Database
```bash
# Always backup before running migration scripts!
mongodump --uri="mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net"
```

### 2. Ensure System Accounts Exist

Make sure these accounts exist in Account Master for each company:
- ✅ Sundry Debtors (Asset)
- ✅ Sundry Creditors (Liability)
- ✅ Sales Account (Income)
- ✅ Purchase Account (Expense)
- ✅ GST Payable (Liability)
- ✅ GST Input Credit (Asset)
- ✅ Bank Account (Asset)
- ✅ Cash Account (Asset)

If these don't exist, the script will log warnings but won't fail.

---

## How to Run

### Step 1: Navigate to Backend Directory
```bash
cd JainInpexCRMBackend/crm_backend
```

### Step 2: Run the Migration Script
```bash
node scripts/migrateHistoricalAccounting.js
```

### Step 3: Wait for Completion

The script will show progress like this:

```
============================================================
🚀 HISTORICAL ACCOUNTING MIGRATION
============================================================

============================================================
🏢 Processing Company: JainImpexCRM
============================================================
   ✅ Using system user: 69da10bca5d4404883cea296

📋 Migrating Dealer Invoices for JainImpexCRM...
   Found 45 approved dealer invoices
   ✅ Created entry for invoice INV-2026-0001
   ✅ Created entry for invoice INV-2026-0002
   ...
   📊 Summary: 45 created, 0 skipped, 0 failed

📋 Migrating Supplier Invoices for JainImpexCRM...
   Found 32 approved supplier invoices
   ✅ Created entry for invoice SI-123456
   ...
   📊 Summary: 32 created, 0 skipped, 0 failed

💰 Migrating Dealer Payments for JainImpexCRM...
   Found 28 approved dealer payments
   ✅ Created entry for payment PAY-12345678
   ...
   📊 Summary: 28 created, 0 skipped, 0 failed

💰 Migrating Supplier Payments for JainImpexCRM...
   Found 15 approved supplier payments
   ✅ Created entry for payment SPAY-12345678
   ...
   📊 Summary: 15 created, 0 skipped, 0 failed

============================================================
📊 MIGRATION SUMMARY
============================================================

🏢 JainImpexCRM:
   Dealer Invoices:   45 created, 0 skipped, 0 failed
   Supplier Invoices: 32 created, 0 skipped, 0 failed
   Dealer Payments:   28 created, 0 skipped, 0 failed
   Supplier Payments: 15 created, 0 skipped, 0 failed
   Total: 120 created, 0 skipped, 0 failed

🏢 ridhi_crm:
   Dealer Invoices:   0 created, 0 skipped, 0 failed
   Supplier Invoices: 0 created, 0 skipped, 0 failed
   Dealer Payments:   0 created, 0 skipped, 0 failed
   Supplier Payments: 0 created, 0 skipped, 0 failed
   Total: 0 created, 0 skipped, 0 failed

🏢 shreejain_crm:
   Dealer Invoices:   0 created, 0 skipped, 0 failed
   Supplier Invoices: 0 created, 0 skipped, 0 failed
   Dealer Payments:   0 created, 0 skipped, 0 failed
   Supplier Payments: 0 created, 0 skipped, 0 failed
   Total: 0 created, 0 skipped, 0 failed

------------------------------------------------------------
📈 GRAND TOTAL:
   ✅ Created: 120
   ⏭️  Skipped: 0
   ❌ Failed:  0

⏱️  Duration: 12.45 seconds

============================================================
✅ MIGRATION COMPLETE!
============================================================

You can now view the journal entries in:
Finance & Accounts → Voucher Entry → Journal Voucher tab
```

---

## What Happens

### For Each Approved Dealer Invoice:
```
Creates Journal Entry:
  Debit:  Sundry Debtors     (Total Amount)
  Credit: Sales Account      (Subtotal)
  Credit: GST Payable        (GST Amount)
```

### For Each Approved Supplier Invoice:
```
Creates Journal Entry:
  Debit:  Purchase Account   (Subtotal)
  Debit:  GST Input Credit   (GST Amount)
  Credit: Sundry Creditors   (Total Amount)
```

### For Each Approved Dealer Payment:
```
Creates Journal Entry:
  Debit:  Bank/Cash Account  (Payment Amount)
  Credit: Sundry Debtors     (Payment Amount)
```

### For Each Approved Supplier Payment:
```
Creates Journal Entry:
  Debit:  Sundry Creditors   (Payment Amount)
  Credit: Bank/Cash Account  (Payment Amount)
```

---

## Safety Features

### 1. Duplicate Prevention
- Script checks if journal entry already exists before creating
- If entry exists, it skips that transaction
- Safe to run multiple times

### 2. Error Handling
- If one transaction fails, script continues with others
- Failed transactions are logged but don't stop the migration
- Summary shows how many succeeded, skipped, and failed

### 3. Non-Destructive
- Only creates new journal entries
- Doesn't modify existing invoices or payments
- Doesn't delete anything

---

## After Migration

### 1. Verify Journal Entries

Go to: **Finance & Accounts → Voucher Entry → Journal Voucher tab**

- Click "Automatic" filter
- You should see all migrated entries with ⚡ icon
- Each entry should have reference to source invoice/payment

### 2. Check Balance Sheet

Go to: **Finance & Accounts → Balance Sheet**

Verify accounts are updated:
- Sundry Debtors (should show total receivables)
- Sundry Creditors (should show total payables)
- Sales Account (should show total sales)
- Purchase Account (should show total purchases)
- GST Payable (should show output GST)
- GST Input Credit (should show input GST)

### 3. Verify Specific Entries

Click "View" on any journal entry to see:
- Complete debit/credit details
- Reference to source transaction
- Balanced totals
- Auto-generated indicator

---

## Troubleshooting

### Issue: "No super admin found"
**Solution**: Create a super admin for that company first
```bash
node scripts/createSuperAdmin.js
```

### Issue: "System account not found"
**Solution**: Create the required accounts in Account Master
- Go to Finance & Accounts → Account Master
- Create missing system accounts

### Issue: Some entries failed
**Solution**: Check the console output for specific errors
- Look for "❌ Error processing" messages
- Fix the underlying issue
- Run script again (it will skip already created entries)

### Issue: Script takes too long
**Solution**: This is normal for large datasets
- Script processes each transaction individually
- For 1000 transactions, expect 1-2 minutes
- Don't interrupt the script

---

## Re-running the Script

**Safe to re-run!** The script:
- ✅ Checks for existing entries before creating
- ✅ Skips transactions that already have entries
- ✅ Only creates missing entries
- ✅ Won't create duplicates

---

## What's Next

After migration:
1. ✅ All historical data now has journal entries
2. ✅ Balance sheet reflects complete accounting
3. ✅ Future invoices/payments will auto-create entries
4. ✅ No manual journal entries needed going forward

---

## Support

If you encounter issues:
1. Check the console output for specific errors
2. Verify system accounts exist
3. Ensure super admin exists for each company
4. Check database connection
5. Review the error messages in the output

---

**Date**: April 14, 2026  
**Script**: migrateHistoricalAccounting.js  
**Status**: Ready to run
