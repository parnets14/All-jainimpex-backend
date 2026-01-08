# Discount System - Client Guide 🎯

## What's New?

Your discount system now has three powerful features:

### 1. ✅ Approval Required
**Only Super Admin approved discounts show in sales orders**

- Anyone can create discounts
- But they need Super Admin approval
- Until approved, they won't show in sales orders
- This gives you complete control!

### 2. ✅ Both Discount Types Together
**Give automatic discount + optional extra discount for good dealers**

- Set a base discount that applies to everyone (e.g., 5%)
- Add optional extra discounts for good dealers (e.g., +3% or +5%)
- User decides if dealer deserves extra discount

### 3. ✅ Re-Approval on Edit
**Any changes to approved discounts need re-approval**

- If someone edits an approved discount
- It automatically needs your approval again
- This prevents unauthorized price changes

---

## How to Use

### Creating a Discount with Both Types

**Step 1: Create Discount**
1. Go to "Discount Management"
2. Click "Add New Mapping"
3. Fill in basic details:
   - Discount Name: "Premium Pipe Discount"
   - Target: Select Product/Brand/Category
   - Validity: From/To dates

**Step 2: Select "Both" Type**
1. Choose discount type: **"Direct + Level-Based (Both)"**
2. Enter direct discount: **5%** (this applies automatically)
3. Add levels for good dealers:
   - Level 1: "Good Dealer" → **+3%** extra
   - Level 2: "Excellent Dealer" → **+5%** extra
4. Click "Submit for Approval"

**Step 3: Super Admin Approves**
1. Super Admin logs in
2. Goes to Discount Management
3. Sees discount with "Pending Approval" badge
4. Reviews and clicks "Approve"
5. Done! Discount is now active

---

## Using Discount in Sales Order

**When adding product to sales order:**

1. **Automatic Discount Applied**
   - Direct discount (5%) applies automatically
   - Shows in discount column
   - No user action needed

2. **Optional Extra Discount**
   - User sees dropdown with options:
     * No extra discount (5% total)
     * Good Dealer (+3% extra = 8% total)
     * Excellent Dealer (+5% extra = 10% total)
   - User selects based on dealer quality

**Example Calculation:**
```
Product Price: ₹1,000

Regular Dealer:
- Direct Discount: 5% = ₹50
- Final Price: ₹950

Good Dealer:
- Direct Discount: 5% = ₹50
- Extra Discount: 3% = ₹30
- Total Discount: 8% = ₹80
- Final Price: ₹920

Excellent Dealer:
- Direct Discount: 5% = ₹50
- Extra Discount: 5% = ₹50
- Total Discount: 10% = ₹100
- Final Price: ₹900
```

---

## Editing Approved Discounts

**What happens when you edit:**

1. User edits approved discount (e.g., changes 5% to 7%)
2. System shows: "Status reset to Pending Approval"
3. Discount disappears from sales orders
4. Super Admin must re-approve
5. Only then it becomes visible again

**Why this is good:**
- Prevents unauthorized price changes
- Super Admin always in control
- Audit trail of all changes

---

## Discount Status Badges

### Approval Status:
- 🟡 **Draft**: Just created, not submitted
- 🟠 **Pending Approval**: Waiting for Super Admin
- 🟢 **Approved**: Active and visible in sales orders
- 🔴 **Rejected**: Not approved by Super Admin
- ⚫ **Expired**: Past validity date

### Date Status:
- 🔵 **Scheduled**: Not yet active (future start date)
- 🟢 **Active**: Currently valid and applicable
- ⚫ **Expired**: Past end date, not applicable

---

## Super Admin Powers

As Super Admin, you can:

1. **Approve/Reject Discounts**
   - Review all pending discounts
   - Approve or reject with reason

2. **Delete Any Discount**
   - Even approved discounts
   - Complete control over pricing

3. **View All Discounts**
   - See draft, pending, approved, rejected
   - Full visibility

---

## Best Practices

### 1. Use "Both" Type for Flexibility
```
✅ Good: Direct 5% + Optional levels
- All dealers get base discount
- Good dealers get extra
- You control who gets what

❌ Not Recommended: Only level-based
- User must remember to select
- Risk of forgetting to apply discount
```

### 2. Set Realistic Validity Dates
```
✅ Good: 3-6 months validity
- Enough time to use
- Not too long to forget

❌ Not Recommended: 1 year+
- May forget to review
- Market conditions change
```

### 3. Use Clear Level Names
```
✅ Good Level Names:
- "Good Dealer"
- "Excellent Dealer"
- "Premium Customer"

❌ Confusing Names:
- "Level 1", "Level 2"
- "A", "B", "C"
```

### 4. Review Pending Approvals Regularly
```
✅ Good Practice:
- Check daily for pending approvals
- Approve/reject within 24 hours
- Keep system moving

❌ Bad Practice:
- Let approvals pile up
- Delay for weeks
- Users get frustrated
```

---

## Common Scenarios

### Scenario 1: Festival Discount
**Goal**: Give 10% discount to all dealers during festival

**Setup**:
- Discount Type: "Direct Only"
- Direct Discount: 10%
- Target: Category (applies to all products)
- Validity: Festival dates
- Submit for approval

**Result**: All dealers get 10% automatically during festival

---

### Scenario 2: Premium Dealer Discount
**Goal**: Give 5% to all, but good dealers get 8%

**Setup**:
- Discount Type: "Both"
- Direct Discount: 5% (auto-applied)
- Levels:
  * Good Dealer: +3% (total 8%)
- Target: Brand/Product
- Submit for approval

**Result**: 
- All dealers: 5% automatic
- Good dealers: User selects level for 8% total

---

### Scenario 3: Clearance Sale
**Goal**: Different discounts for different dealer types

**Setup**:
- Discount Type: "Both"
- Direct Discount: 10% (auto-applied)
- Levels:
  * Bulk Buyer: +5% (total 15%)
  * Premium Customer: +10% (total 20%)
- Target: Specific products
- Validity: 1 month

**Result**:
- Regular dealers: 10%
- Bulk buyers: 15%
- Premium customers: 20%

---

## Troubleshooting

### Q: Discount not showing in sales order?
**A**: Check these:
1. Is status "Approved"? (not Draft or Pending)
2. Is current date within validity period?
3. Is discount active? (not expired)
4. Did Super Admin approve it?

### Q: Edited discount disappeared?
**A**: This is correct behavior!
- Editing approved discount requires re-approval
- Super Admin must approve again
- This prevents unauthorized changes

### Q: Can't delete discount?
**A**: Only Super Admin can delete approved discounts
- Regular users can only delete drafts
- This protects active pricing

### Q: How to give different discounts to different dealers?
**A**: Use "Both" type with levels
- Direct discount for all
- Levels for specific dealer types
- User selects appropriate level

---

## Summary

Your new discount system gives you:

1. **Complete Control**: Only approved discounts are active
2. **Flexibility**: Automatic + optional discounts together
3. **Security**: Changes require re-approval
4. **Visibility**: Clear status badges
5. **Power**: Super Admin can override anything

**Result**: Professional discount management with full control!

---

## Need Help?

Contact your system administrator or refer to:
- `DISCOUNT_SYSTEM_FINAL_IMPLEMENTATION.md` - Technical details
- `DISCOUNT_APPROVAL_AND_BOTH_TYPE_COMPLETE.md` - Feature documentation
- `DISCOUNT_EXPIRATION_SYSTEM.md` - Date expiration details
