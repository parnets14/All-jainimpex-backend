# PO-GRN-Stock Issue - RESOLVED

## User Report
- **PO**: PO-20260216-068
- **GRN**: GRN-1771234629393
- **Issue**: Stock mismatch after GRN creation

## Investigation Results

### ✅ GRN Status - FOUND AND WORKING
- **GRN Number**: GRN-1771234629393
- **Created**: Feb 16, 2026 at 15:07:09 (1 minute after PO)
- **Status**: Received
- **Total Amount**: ₹283,536

**Products Received**:
1. Product BFS001
   - Ordered: 1
   - Received: 1
   - Accepted: 1
   - Price: ₹300
   - Total: ₹336

2. Product 154154658
   - Ordered: 501
   - Received: 501
   - Accepted: 500 (1 unit damaged)
   - Price: ₹480
   - Total: ₹283,200

### ✅ Stock Created - CONFIRMED
Stock entries were created on Feb 16, 2026 at 15:07:09:
- 1 unit of Product BFS001
- 500 units of Product 154154658

### ⚠️ CRITICAL ISSUE FOUND: Warehouse NULL Problem

**All stock entries have `warehouse: null` (undefined)**

This affects:
- 25 total stock entries
- 3,821 total units across all products
- All warehouses showing as NULL

## Root Cause

The Stock model or stock creation logic is not properly saving the warehouse ID. When GRN creates stock movements, the warehouse field is being set to `null` or `undefined` instead of the actual warehouse ObjectId.

## Impact

1. **Stock exists** but cannot be filtered by warehouse
2. **Stock reports** won't show correct warehouse-wise inventory
3. **Sales orders** may not find stock because warehouse filter fails
4. **Pending quantities** system may not work correctly

## What's Working
- ✅ PO creation
- ✅ GRN creation with correct products and quantities
- ✅ Stock quantity updates
- ✅ Damage tracking (1 unit marked as damaged)

## What's Broken
- ❌ Warehouse assignment in Stock entries
- ❌ Warehouse-based stock filtering
- ❌ Stock visibility by warehouse

## Recommended Fix

### Option 1: Fix Stock Model/Controller (RECOMMENDED)
1. Check Stock model schema - ensure `warehouse` field is properly defined
2. Check stock creation in GRN controller - ensure warehouse ID is passed correctly
3. Update existing stock entries to add missing warehouse IDs

### Option 2: Recreate Stock Entries
1. Delete all stock entries with null warehouse
2. Recreate from GRN history with correct warehouse IDs

## Next Steps
1. Check Stock model schema definition
2. Check StockMovementService.createStockMovementsFromGRN function
3. Fix warehouse assignment logic
4. Run migration script to fix existing stock entries
5. Verify stock shows correctly by warehouse

## Files to Check
- `JainInpexCRMBackend/crm_backend/models/Stock.js`
- `JainInpexCRMBackend/crm_backend/services/StockMovementService.js`
- `JainInpexCRMBackend/crm_backend/controllers/grnController.js`
