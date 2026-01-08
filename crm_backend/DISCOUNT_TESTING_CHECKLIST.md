# Discount System - Testing Checklist

## 🧪 Testing Guide for Client

### Prerequisites
- Backend server running
- Frontend application running
- At least one dealer created
- At least one product created
- User logged in with appropriate permissions

---

## Test 1: Create Category Discount

### Steps:
1. Navigate to Sales & Purchase → Dealer Discount Management
2. Click "Add New Mapping"
3. Select "Sales Discount Mapping"
4. Enter discount name: "Category Test Discount"
5. Select Target Type: "Category"
6. Select a category from dropdown
7. Select Discount Type: "Direct Discount"
8. Enter percentage: 10%
9. Set validity dates
10. Click Submit

### Expected Result:
✅ Discount created successfully
✅ Shows in discount list
✅ Status: Pending Approval

---

## Test 2: Apply Direct Discount in Sales Order

### Steps:
1. Navigate to Sales Order Dashboard
2. Click "Add Order"
3. Select a dealer
4. Add a product that belongs to the category from Test 1
5. Observe the discount column

### Expected Result:
✅ Discount shows: "10% Off"
✅ Shows "Auto-applied"
✅ Shows savings amount
✅ Total price reflects discount
✅ Order summary shows discount breakdown

---

## Test 3: Create Level-Based Discount

### Steps:
1. Navigate to Dealer Discount Management
2. Create new discount
3. Select Target Type: "Product"
4. Select a specific product
5. Select Discount Type: "Level-Based Discount"
6. Add levels:
   - Bronze: 5%
   - Silver: 10%
   - Gold: 15%
7. Submit

### Expected Result:
✅ Discount created with multiple levels
✅ All levels saved correctly

---

## Test 4: Apply Level-Based Discount

### Steps:
1. Go to Sales Order Dashboard
2. Add the product from Test 3
3. Observe discount column

### Expected Result:
✅ Shows dropdown with levels
✅ Can select Bronze/Silver/Gold
✅ Price updates when level changes
✅ Selected level saved with order

---

## Test 5: Priority System

### Steps:
1. Create category discount: 5%
2. Create product discount: 15% (for same product)
3. Add that product to sales order

### Expected Result:
✅ Product discount (15%) applies
✅ Category discount (5%) ignored
✅ Higher priority wins

---

## Test 6: Invoice Creation

### Steps:
1. Create sales order with discount
2. Update status to "Delivered"
3. Go to Dealer Invoice
4. Select the dealer
5. Select the sales order
6. Create invoice

### Expected Result:
✅ Discount information transferred
✅ Discount shows in invoice items
✅ Invoice totals include discount
✅ Discount saved with invoice

---

## Test 7: No Discount Scenario

### Steps:
1. Add product without any discount
2. Check discount column

### Expected Result:
✅ Shows "No discount"
✅ Order works normally
✅ No errors

---

## 🐛 Common Issues to Check

- [ ] Discount not showing? Check if discount is approved
- [ ] Wrong discount applying? Check priority system
- [ ] Level selector not working? Check if levels are defined
- [ ] Discount not saving? Check browser console for errors

---

## ✅ All Tests Passed?

If all tests pass, the system is working correctly!

**Report any issues with:**
- Screenshot
- Steps to reproduce
- Expected vs actual result
