# PO-GRN-Stock Mismatch Diagnosis Report

## Issue Summary
User reported stock mismatch for:
- **Purchase Order**: PO-20260216-068
- **GRN**: GRN-1771234629393 (user-provided number)
- **Problem**: Stock doesn't match expected quantities after GRN creation

## Root Cause Analysis

### 1. Purchase Order Status ✅
- **PO Number**: PO-20260216-068
- **Status**: Approved
- **Date**: Feb 16, 2026 15:06:16
- **Warehouse ID**: 68e8f0283f5fd5a817866df6
- **Products**: 2 items
  - Product 1: 1 unit @ ₹300 (GST 12%)
  - Product 2: 501 units @ ₹480 (GST 18%)
- **Total**: ₹284,102.40

### 2. GRN Status ❌ **CRITICAL ISSUE FOUND**
- **GRN Created**: Feb 16, 2026 15:07:09 (1 minute after PO)
- **GRN Number**: Missing (NULL)
- **PO Link**: Missing (NULL)
- **Products**: 0 items (EMPTY!)
- **Status**: "Received" (but nothing was actually received)

**The GRN was created but all critical data is missing!**

### 3. Stock Status ❌
- **No stock entries** exist for either product in the warehouse
- This is expected since the GRN didn't properly record the received items

## Technical Analysis

### Schema Field Mismatch
The GRN model uses different field names than expected:
- Uses `grnNo` (not `grnNumber`)
- Uses `poId` (not `poNumber`)  
- Uses `items` (not `products`)

### What Went Wrong
1. GRN was created with status "Received"
2. But `grnNo`, `poId`, and `items` fields are all empty/null
3. Without proper GRN data, stock movements were never created
4. Result: PO shows "Approved" but stock was never updated

## Impact
- Purchase Order exists and is approved
- GRN exists but is essentially empty (zombie record)
- Stock was never updated
- Inventory is incorrect
- User's GRN number "GRN-1771234629393" doesn't exist in database

## Recommended Fix

### Option 1: Delete Bad GRN and Recreate (RECOMMENDED)
1. Delete the empty GRN record (created Feb 16 15:07:09)
2. Create a new GRN properly from the PO
3. This will:
   - Generate proper GRN number
   - Link to PO correctly
   - Record all products
   - Create stock movements
   - Update inventory

### Option 2: Fix Existing GRN
1. Update the existing GRN with missing data
2. Manually create stock movements
3. More complex and error-prone

## Next Steps
1. Confirm with user if they want to recreate the GRN
2. Check GRN creation code for bugs (why did it save empty data?)
3. Implement fix to prevent this from happening again
4. Add validation to ensure GRN has required data before saving

## Files to Investigate
- `JainInpexCRMBackend/crm_backend/models/GRN.js` - Schema definition
- `JainInpexCRMBackend/crm_backend/controllers/grnController.js` - GRN creation logic
- `JainInpexCRM/src/Sales&Purchase/GRNEntryModule.jsx` - Frontend GRN form
