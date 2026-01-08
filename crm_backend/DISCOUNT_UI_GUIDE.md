# Discount System - User Interface Guide

## What You'll See in Sales Order Dashboard

### When Adding a Product with Direct Discount
```
┌─────────────────────────────────────────────────┐
│ Product: Ballpoint Pens (Code: PEN001)         │
│ Warehouse: Main Warehouse (Stock: 500)         │
│ Quantity: 100                                   │
│ Unit Price: ₹50                                 │
│ Discount:                                       │
│   10% Off                                       │
│   Auto-applied                                  │
│   Save: ₹500                                    │
│                                                 │
│ GST: 18% | Discount: ₹500 | Total: ₹5,400     │
└─────────────────────────────────────────────────┘
```

### When Adding a Product with Level-Based Discount
```
┌─────────────────────────────────────────────────┐
│ Product: Notebooks (Code: NB001)               │
│ Warehouse: Main Warehouse (Stock: 1000)        │
│ Quantity: 200                                   │
│ Unit Price: ₹100                                │
│ Discount:                                       │
│   [Select Level ▼]                             │
│   - Bronze (5%)                                 │
│   - Silver (10%)                                │
│   - Gold (15%)                                  │
│                                                 │
│ GST: 18% | Discount: ₹2,000 | Total: ₹21,240  │
└─────────────────────────────────────────────────┘
```

### Order Summary with Discounts
```
┌─────────────────────────────────────────────────┐
│ Order Summary                                   │
│                                                 │
│ Gross Amount:        ₹25,000                   │
│ Total Discount:      -₹2,500 (in green)       │
│ Total GST:           ₹4,050                    │
│ Total Amount:        ₹26,550                   │
└─────────────────────────────────────────────────┘
```

## What Gets Saved

### Sales Order Data
- Product details
- Discount percentage applied
- Discount amount calculated
- Applied discount metadata:
  - Discount ID
  - Discount name
  - Discount type (direct/level_based)
  - Target type (category/subcategory/brand/product)
  - Selected level (if level-based)

### Invoice Data
- All sales order discount information preserved
- Discount breakdown in totals
- Complete audit trail

## How to Use

1. Create discount in Dealer Discount Management
2. Add product to sales order
3. System automatically fetches and applies discount
4. For level-based: Select desired level
5. Review discount in order summary
6. Submit order with discount data
7. Create invoice from order (discount preserved)

**Status**: Fully Implemented ✅
