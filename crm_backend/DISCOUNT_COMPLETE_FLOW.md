# Discount System - Complete Flow

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DISCOUNT SYSTEM                          │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   Backend    │   │   Frontend   │   │   Frontend   │
│              │   │   Discount   │   │   Sales &    │
│ - Model      │   │  Management  │   │   Invoice    │
│ - Controller │   │              │   │              │
│ - Routes     │   │ - Create     │   │ - Display    │
│ - API        │   │ - Edit       │   │ - Apply      │
│              │   │ - Approve    │   │ - Calculate  │
└──────────────┘   └──────────────┘   └──────────────┘
```

## 🔄 Complete Workflow

### Step 1: Create Discount
```
Admin → Discount Management → Create Discount
  ↓
Select Target Type (Category/Subcategory/Brand/Product)
  ↓
Select Discount Type (Direct/Level-Based)
  ↓
Enter Discount Details
  ↓
Submit for Approval
  ↓
Discount Stored in Database
```

### Step 2: Apply Discount in Sales Order
```
User → Sales Order Dashboard → Add Product
  ↓
System Fetches Applicable Discounts (Priority-Based)
  ↓
Product > Brand > Subcategory > Category
  ↓
Discount Found?
  ├─ Yes → Apply Discount
  │   ├─ Direct: Auto-apply percentage
  │   └─ Level-Based: Show level selector
  └─ No → Continue without discount
  ↓
Calculate Discounted Price
  ↓
Display in Product Card
  ↓
Save with Order
```

### Step 3: Create Invoice
```
User → Dealer Invoice → Select Sales Order
  ↓
System Transfers Order Data
  ↓
Discount Information Preserved
  ↓
Display Discount in Invoice
  ↓
Calculate Invoice Totals
  ↓
Save Invoice with Discount Data
```

## 📈 Data Flow

```
DiscountMapping (Database)
        ↓
getApplicableDiscounts (API)
        ↓
SalesOrderDashboard (Frontend)
        ↓
Product with Discount
        ↓
Sales Order (Database)
        ↓
DealerInvoice (Frontend)
        ↓
Invoice with Discount (Database)
```

## 🎯 Priority System

```
When Product is Selected:
        ↓
Check Product-Specific Discount
        ↓ (Not Found)
Check Brand-Based Discount
        ↓ (Not Found)
Check Subcategory-Based Discount
        ↓ (Not Found)
Check Category-Based Discount
        ↓ (Not Found)
No Discount Available
```

## ✅ Implementation Complete

All components working and integrated!
