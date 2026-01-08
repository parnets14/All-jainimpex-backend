# Discount Flow - Complete Clarification

## Current Implementation Status

### ✅ What's Already Working

1. **Dealer Info Panel** - Shows available discounts
2. **Sales Order Dashboard** - Discounts are fetched and stored with products
3. **Discount Types Supported**:
   - Direct Discount (auto-applied)
   - Level-based Discount (user selects level)
   - Both (Direct + Level combined)

---

## Client Requirements (Clarified)

### 1. **Sales Order Dashboard** 
**Current**: Discounts are fetched but may not be visible in UI
**Required**: 
- Show direct discount percentage in product list
- Auto-apply direct discount to price
- For "both" type: Show direct discount, level selection comes later in invoice

### 2. **Invoice Creation**
**Required**:
- Auto-apply direct discount from sales order
- If level-based discount exists, show dropdown to select level
- **Total Discount = Direct % + Level %**
- Example: Direct 5% + Level 10% = 15% total discount

### 3. **Credit Days Flow**
**Required**:
- Sales Order credit days → Invoice credit days → Ledger credit days
- For CD Sales: Custom credit days for that order only
- For Regular Sales: Dealer's default credit days

---

## Discount Application Logic

### Scenario 1: Direct Discount Only
```
Product: PVC Pipe
Base Price: ₹100
Direct Discount: 5%

Calculation:
- Base Amount: ₹100
- Discount: ₹5 (5% of ₹100)
- After Discount: ₹95
- GST (18%): ₹17.10
- Final Price: ₹112.10
```

### Scenario 2: Level-based Discount Only
```
Product: PVC Pipe
Base Price: ₹100
Level Discount: User selects "Level 2" = 10%

Calculation:
- Base Amount: ₹100
- Discount: ₹10 (10% of ₹100)
- After Discount: ₹90
- GST (18%): ₹16.20
- Final Price: ₹106.20
```

### Scenario 3: Both (Direct + Level)
```
Product: PVC Pipe
Base Price: ₹100
Direct Discount: 5% (auto-applied)
Level Discount: User selects "Level 2" = 10%

Calculation:
- Base Amount: ₹100
- Direct Discount: ₹5 (5% of ₹100)
- Level Discount: ₹10 (10% of ₹100)
- Total Discount: ₹15 (15% of ₹100)
- After Discount: ₹85
- GST (18%): ₹15.30
- Final Price: ₹100.30
```

**Important**: Both discounts are calculated on BASE PRICE, not cascading.

---

## Implementation Plan

### Phase 1: Sales Order Dashboard (Show Discounts)

**File**: `SalesOrderDashboard.jsx`

**Current Code** (in addProductToOrder):
```javascript
// Discount is already being fetched
const discountResponse = await apiService.getApplicableDiscounts(...)
newProduct.applicableDiscount = discount
newProduct.discountType = discount.discountType
newProduct.discountPercentage = discount.directDiscountPercentage || 0
```

**Need to Add**: Display discount in product list UI
- Show discount percentage next to price
- Show "Direct: 5%" or "Direct: 5% + Level: Select"
- Calculate and show discounted price

### Phase 2: Invoice Creation (Apply Discounts)

**File**: `DealerInvoice.jsx`

**Need to Add**:
1. When loading sales order products, preserve discount info
2. For "direct" type: Auto-apply discount
3. For "level_based" type: Show dropdown to select level
4. For "both" type: Auto-apply direct + show level dropdown
5. Calculate total discount = direct % + level %

### Phase 3: Ledger (Store Discount Info)

**File**: `DealerLedger` model

**Need to Add**:
- Store discount information with ledger entry
- Show discount details in ledger view

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SALES ORDER DASHBOARD                                    │
├─────────────────────────────────────────────────────────────┤
│ • User selects dealer                                       │
│ • Dealer Info Panel shows available discounts              │
│ • User adds product                                         │
│ • System fetches applicable discount                       │
│ • Direct discount auto-applied                             │
│ • Product shows: "Price: ₹100 (5% off) = ₹95"            │
│ • For "both" type: Shows "Direct: 5% + Level: TBD"        │
│ • Order saved with discount info                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. INVOICE CREATION                                         │
├─────────────────────────────────────────────────────────────┤
│ • User selects sales order                                  │
│ • Products loaded with discount info                       │
│ • Direct discount already applied                          │
│ • If level-based discount exists:                          │
│   - Show dropdown: [Select Level]                          │
│   - Options: Level 1 (5%), Level 2 (10%), Level 3 (15%)  │
│   - User selects level                                     │
│   - Total discount = Direct % + Level %                    │
│ • Invoice shows final discounted price                     │
│ • Credit days from sales order                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. DEALER LEDGER                                            │
├─────────────────────────────────────────────────────────────┤
│ • Ledger entry created with:                               │
│   - Invoice amount (after discount)                        │
│   - Credit days from invoice                               │
│   - Discount details stored                                │
│   - Due date calculated                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## UI Mockups

### Sales Order Dashboard - Product List

```
┌─────────────────────────────────────────────────────────────┐
│ Selected Products  [🔶 CD Sales Order]                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Product: PVC Pipe 2 inch                                ││
│ │ Code: PVC-2IN-001                                       ││
│ │ [CD Sales]                                              ││
│ │                                                         ││
│ │ Warehouse: Main [▼]  Qty: 10                           ││
│ │                                                         ││
│ │ Price: ₹100.00                                          ││
│ │ Discount: 5% Direct 🎁                                  ││
│ │ After Discount: ₹95.00                                  ││
│ │ GST (18%): ₹17.10                                       ││
│ │ Total: ₹112.10                                          ││
│ │                                                         ││
│ │ [Remove]                                                ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Invoice Creation - With Level Discount

```
┌─────────────────────────────────────────────────────────────┐
│ Invoice Items                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Product: PVC Pipe 2 inch                                ││
│ │ Qty: 10  Unit Price: ₹100.00                            ││
│ │                                                         ││
│ │ Discounts:                                              ││
│ │ ✓ Direct Discount: 5% = ₹50.00                         ││
│ │ ✓ Level Discount: [Select Level ▼]                     ││
│ │   Options:                                              ││
│ │   - Level 1: 5% (Qty 50-99)                            ││
│ │   - Level 2: 10% (Qty 100-199) ← Selected              ││
│ │   - Level 3: 15% (Qty 200+)                            ││
│ │                                                         ││
│ │ Discount Breakdown:                                     ││
│ │ - Direct: 5% of ₹1000 = ₹50                            ││
│ │ - Level: 10% of ₹1000 = ₹100                           ││
│ │ - Total Discount: 15% = ₹150                           ││
│ │                                                         ││
│ │ Base Amount: ₹1,000.00                                  ││
│ │ After Discount: ₹850.00                                 ││
│ │ GST (18%): ₹153.00                                      ││
│ │ Line Total: ₹1,003.00                                   ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Summary

### Current Status:
✅ Discounts fetched and stored
✅ Direct discount auto-applied in backend
⚠️ Discount not visible in Sales Order UI
⚠️ Level discount selection not implemented in Invoice

### Next Steps:
1. Update Sales Order Dashboard to show discount in product list
2. Update Invoice Creation to show level discount dropdown
3. Implement combined discount calculation (Direct + Level)
4. Ensure credit days flow through all stages
5. Test complete flow

### Key Points:
- **CD Sales**: Custom credit days for that order only
- **Direct Discount**: Auto-applied everywhere
- **Level Discount**: User selects during invoice creation
- **Both Type**: Direct auto-applied + Level selectable
- **Total Discount**: Direct % + Level % (both on base price)
