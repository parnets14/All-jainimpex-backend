# Flexible Hierarchical Discount System - Implementation Plan

## Client Requirements

### 1. Flexible Discount Targeting
- Can create discount for:
  - **Category Only** → Applies to ALL subcategories, extended subcategories, brands, and products under that category
  - **Subcategory Only** → Applies to ALL extended subcategories, brands, and products under that subcategory
  - **Brand Only** → Applies to ALL products of that brand
  - **Product Only** → Applies to that specific product only

### 2. Priority-Based Discount Application (During Sales Order Creation)
When selecting a product in sales order, check discounts in this order:
1. **Product-specific discount** (Highest Priority)
2. **Brand-based discount**
3. **Subcategory-based discount** (including extended subcategories)
4. **Category-based discount** (Lowest Priority)

**Rule**: Use the MOST SPECIFIC discount available. If product has its own discount, ignore all others.

### 3. Two Discount Types

#### A. Direct Discount
- Fixed percentage (e.g., 10%)
- **Applies automatically** when product is selected
- No user selection needed

#### B. Level-Based Discount
- Multiple levels with different percentages
- Example: Level 1 (5%), Level 2 (10%), Level 3 (15%)
- **User must select which level to apply** during sales order creation
- Provides flexibility based on deal/customer

### 4. Sales Order Integration
When adding product to sales order:
1. Check if product-specific discount exists → Use it
2. If not, check brand discount → Use it
3. If not, check subcategory discount → Use it
4. If not, check category discount → Use it
5. If discount is **direct** → Apply automatically
6. If discount is **level-based** → Show dropdown to select level

## Implementation Status

### ✅ Completed
- [x] DiscountMapping Model with flexible targeting
- [x] Backend controllers for CRUD operations
- [x] Priority-based discount lookup logic
- [x] API endpoints for discount management

### ⚠️ Needs Completion
- [ ] Frontend DealerDiscountManagement.jsx - Complete UI implementation
- [ ] Sales Order Dashboard integration - Add discount selection UI
- [ ] Dealer Invoice integration - Show applied discounts
- [ ] API service methods in api.js
- [ ] Testing and validation

## Next Steps
1. Complete frontend DealerDiscountManagement.jsx
2. Integrate discount selection in SalesOrderDashboard
3. Update DealerInvoice to show applied discounts
4. Add API service methods
5. Test complete flow
