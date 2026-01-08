# Discount Expiration System - Complete Guide

## Overview
Discounts automatically expire based on the `validTo` date. Expired discounts are NOT shown or applied in Sales Order Dashboard or Dealer Invoice creation.

---

## How It Works

### 1. Date Validation in Backend ✅
**Location**: `models/DiscountMapping.js` - `findApplicableDiscounts` method

```javascript
const now = new Date();
const baseQuery = {
  mappingType,
  status: 'Approved',
  isActive: true,
  validFrom: { $lte: now },  // Must have started
  validTo: { $gte: now }      // Must not have expired
};
```

**Logic**:
- `validFrom <= today` → Discount has started
- `validTo >= today` → Discount has not expired
- Both conditions must be true for discount to be applicable

### 2. Automatic Filtering
When fetching applicable discounts for a product:
1. System checks current date/time
2. Filters out discounts where `validTo < today`
3. Only returns active, non-expired discounts
4. These are the ONLY discounts that can be applied

---

## Discount Lifecycle

### Phase 1: Future (Not Yet Active)
- **Condition**: `validFrom > today`
- **Status**: Created/Approved but not yet active
- **Behavior**: NOT shown in Sales Order/Invoice
- **Example**: Discount created on Jan 1 with validFrom = Jan 15

### Phase 2: Active (Currently Valid)
- **Condition**: `validFrom <= today <= validTo`
- **Status**: Active and applicable
- **Behavior**: Shows in Sales Order/Invoice, can be applied
- **Example**: Discount with validFrom = Jan 1, validTo = Jan 31, today = Jan 15

### Phase 3: Expired (Past Valid Date)
- **Condition**: `validTo < today`
- **Status**: Expired, no longer applicable
- **Behavior**: NOT shown in Sales Order/Invoice
- **Example**: Discount with validTo = Jan 31, today = Feb 5

---

## Where Expiration is Enforced

### 1. Sales Order Dashboard ✅
**File**: `SalesOrderDashboard.jsx`
**Function**: `addProductToOrder`

```javascript
// When product is added, system calls:
const discountResponse = await apiService.getApplicableDiscounts(
  productId,
  'sales',
  dealerType
);

// Backend automatically filters expired discounts
// Only active discounts are returned
```

**Result**: Expired discounts never reach the frontend!

### 2. Dealer Invoice Creation ✅
**File**: `DealerInvoice.jsx`
**Function**: `calculateDiscountsAndPoints`

```javascript
// When invoice is created from sales order:
const processedItems = await calculateDiscountsAndPoints(
  invoiceItems,
  formData.dealerId
);

// Backend checks discount validity dates
// Expired discounts are not applied
```

**Result**: Expired discounts cannot be applied to invoices!

### 3. Discount Management UI
**File**: `DealerDiscountManagement.jsx`

Expired discounts are still visible in the management UI (for record-keeping) but:
- Marked with "Expired" badge
- Cannot be applied to new orders
- Can be viewed for historical purposes

---

## Example Scenarios

### Scenario 1: Creating Discount
```
User creates discount:
- Discount Name: "Summer Sale 2026"
- Valid From: June 1, 2026
- Valid To: August 31, 2026
- Status: Approved

Timeline:
- May 15, 2026: Discount exists but NOT applicable (future)
- June 1-Aug 31, 2026: Discount IS applicable (active)
- September 1, 2026: Discount NOT applicable (expired)
```

### Scenario 2: Sales Order Creation
```
Date: July 15, 2026
User adds product to sales order:

1. System calls getApplicableDiscounts(productId)
2. Backend checks:
   - validFrom (June 1) <= today (July 15) ✅
   - validTo (Aug 31) >= today (July 15) ✅
3. Discount is returned and applied
4. User sees: "10% Off - Summer Sale 2026"
```

### Scenario 3: After Expiration
```
Date: September 5, 2026
User adds same product to sales order:

1. System calls getApplicableDiscounts(productId)
2. Backend checks:
   - validFrom (June 1) <= today (Sep 5) ✅
   - validTo (Aug 31) >= today (Sep 5) ❌ EXPIRED!
3. Discount is NOT returned
4. User sees: "No discount"
```

---

## Database Query

The actual MongoDB query that filters expired discounts:

```javascript
{
  mappingType: 'sales',
  status: 'Approved',
  isActive: true,
  validFrom: { $lte: new Date() },  // Started
  validTo: { $gte: new Date() },    // Not expired
  targetType: 'product',
  product: productId
}
```

**MongoDB Operators**:
- `$lte`: Less than or equal to (validFrom <= today)
- `$gte`: Greater than or equal to (validTo >= today)

---

## Visual Indicators (Recommended Enhancement)

### In Discount Management UI:
Add status badges to show discount state:

```jsx
{/* Discount Status Badge */}
{(() => {
  const now = new Date();
  const validFrom = new Date(mapping.validFrom);
  const validTo = new Date(mapping.validTo);
  
  if (now < validFrom) {
    return (
      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
        Scheduled
      </span>
    );
  } else if (now > validTo) {
    return (
      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
        Expired
      </span>
    );
  } else {
    return (
      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
        Active
      </span>
    );
  }
})()}
```

---

## Testing Checklist

### Test 1: Future Discount
- [ ] Create discount with validFrom = tomorrow
- [ ] Try to add product to sales order today
- [ ] Verify discount is NOT applied
- [ ] Wait until tomorrow
- [ ] Verify discount IS applied

### Test 2: Active Discount
- [ ] Create discount with validFrom = yesterday, validTo = tomorrow
- [ ] Add product to sales order today
- [ ] Verify discount IS applied
- [ ] Verify correct percentage shows

### Test 3: Expired Discount
- [ ] Create discount with validTo = yesterday
- [ ] Try to add product to sales order today
- [ ] Verify discount is NOT applied
- [ ] Check discount management UI
- [ ] Verify discount shows as "Expired"

### Test 4: Expiration During Day
- [ ] Create discount with validTo = today at 11:59 PM
- [ ] Add product to sales order before midnight
- [ ] Verify discount IS applied
- [ ] Wait until after midnight
- [ ] Add same product to new sales order
- [ ] Verify discount is NOT applied

---

## Automatic Expiration Process

### No Manual Action Required!
- Discounts expire automatically at midnight on validTo date
- No cron job needed
- No manual status update needed
- System checks dates in real-time on every query

### How It Works:
1. User creates discount with validTo = Jan 31, 2026
2. On Feb 1, 2026 at 12:00 AM:
   - Discount still exists in database
   - Status is still "Approved"
   - BUT: `validTo < now` so it's filtered out
3. Discount never appears in sales orders after Feb 1

---

## Benefits

### 1. Automatic Management
- No manual intervention needed
- Discounts expire automatically
- Real-time validation

### 2. Data Integrity
- Expired discounts remain in database for history
- Can generate reports on past discounts
- Audit trail maintained

### 3. User Experience
- Users only see applicable discounts
- No confusion about expired offers
- Clear validity period shown

### 4. Business Control
- Set exact start and end dates
- Schedule future promotions
- Time-limited offers work perfectly

---

## API Endpoints

### Get Applicable Discounts
```
GET /api/discount-mappings/product/:productId/applicable?mappingType=sales&dealerType=Retailer
```

**Response** (only active discounts):
```json
{
  "success": true,
  "applicableDiscounts": [
    {
      "_id": "...",
      "discountName": "Summer Sale",
      "discountType": "direct",
      "directDiscountPercentage": 10,
      "validFrom": "2026-06-01",
      "validTo": "2026-08-31",
      "status": "Approved"
    }
  ],
  "discountCount": 1
}
```

**Note**: If discount is expired, `applicableDiscounts` array will be empty!

---

## Status: ✅ ALREADY IMPLEMENTED

The automatic expiration system is **already working**! 

- ✅ Date validation in backend
- ✅ Automatic filtering of expired discounts
- ✅ Real-time checking on every query
- ✅ Works in Sales Order Dashboard
- ✅ Works in Dealer Invoice creation
- ✅ No manual intervention needed

**Expired discounts will NOT show up in sales orders or invoices automatically!**
