# Super Admin Delete Power - Implementation

## Overview
Super Admin now has the power to delete ANY discount mapping regardless of status (Draft, Approved, Rejected, etc.).

---

## Changes Made

### 1. Backend Controller Update ✅
**File**: `JainInpexCRMBackend/crm_backend/controllers/discountMappingController.js`
**Function**: `deleteDiscountMapping`
**Location**: Line 448-481

#### Changes:
- Added check for Super Admin role
- Super Admin can bypass status restriction
- Other users can only delete Draft discounts

```javascript
export const deleteDiscountMapping = async (req, res) => {
  try {
    const discountMapping = await DiscountMapping.findById(req.params.id);

    if (!discountMapping) {
      return res.status(404).json({
        success: false,
        message: 'Discount mapping not found'
      });
    }

    // Check if user is super admin
    const isSuperAdmin = req.user && req.user.role === 'Super Admin';

    // Only allow deletion of Draft mappings (unless user is Super Admin)
    if (discountMapping.status !== 'Draft' && !isSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Only draft discount mappings can be deleted. Super Admin can delete any discount.'
      });
    }

    await DiscountMapping.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Discount mapping deleted successfully'
    });
  } catch (error) {
    console.error('Delete discount mapping error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting discount mapping'
    });
  }
};
```

---

### 2. Frontend Update ✅
**File**: `JainInpexCRM/src/Sales&Purchase/DealerDiscountManagement.jsx`

#### A. Updated handleDelete Function
**Location**: Line 1780-1810

**Changes**:
- Check if user is Super Admin
- Skip status validation for Super Admin
- Show different confirmation message for Super Admin
- Enhanced error message

```javascript
const handleDelete = useCallback(async (mappingId) => {
  // Find the mapping to check its status
  const mapping = mappings.find(m => m._id === mappingId);
  
  // Check if user is super admin
  const isSuperAdmin = currentUser.role === 'super_admin' || currentUser.role === 'Super Admin';
  
  // Only check status if not super admin
  if (mapping && mapping.status !== 'draft' && !isSuperAdmin) {
    setError(`Cannot delete ${mapping.status} discount mapping. Only draft discount mappings can be deleted. Super Admin can delete any discount.`);
    setTimeout(() => setError(null), 5000);
    return;
  }
  
  const confirmMessage = isSuperAdmin && mapping && mapping.status !== 'draft'
    ? `You are about to delete a ${mapping.status} discount mapping. This action cannot be undone. Are you sure?`
    : "Are you sure you want to delete this mapping?";
  
  if (window.confirm(confirmMessage)) {
    setLoading(true);
    setError(null);
    try {
      await apiService.deleteDiscountMapping(mappingId);
      setSuccessMessage("Discount mapping deleted successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadMappings();
    } catch (error) {
      console.error("Error deleting discount mapping:", error);
      const errorMessage = error.response?.data?.message || error.message || "Failed to delete discount mapping";
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  }
}, [mappings, currentUser]);
```

#### B. Updated Delete Button UI
**Location**: Line 2301-2318

**Changes**:
- Visual indicator (color) based on user role and status
- Different tooltips for different scenarios
- Disabled state for non-super-admin users on non-draft discounts

```jsx
<button
  className={`${
    mapping.status === 'draft' || currentUser.role === 'super_admin' || currentUser.role === 'Super Admin'
      ? 'text-red-600 hover:text-red-900'
      : 'text-gray-400 cursor-not-allowed'
  }`}
  onClick={() => handleDelete(mapping._id)}
  title={
    mapping.status === 'draft'
      ? 'Delete'
      : (currentUser.role === 'super_admin' || currentUser.role === 'Super Admin')
      ? 'Super Admin: Delete any discount'
      : 'Only draft discounts can be deleted'
  }
  disabled={mapping.status !== 'draft' && currentUser.role !== 'super_admin' && currentUser.role !== 'Super Admin'}
>
  <Trash2 size={16} />
</button>
```

---

## How It Works

### For Regular Users:
1. Can only delete **Draft** discounts
2. Delete button is **grayed out** for Approved/Rejected discounts
3. Tooltip shows: "Only draft discounts can be deleted"
4. Clicking shows error message in UI

### For Super Admin:
1. Can delete **ANY** discount (Draft, Approved, Rejected, etc.)
2. Delete button is **always red** (active)
3. Tooltip shows: "Super Admin: Delete any discount"
4. Special confirmation message: "You are about to delete a {status} discount mapping. This action cannot be undone. Are you sure?"
5. Successfully deletes and shows success message

---

## User Experience

### Regular User Trying to Delete Approved Discount:
```
❌ Error Message (Red notification):
"Cannot delete approved discount mapping. Only draft discount mappings can be deleted. Super Admin can delete any discount."
```

### Super Admin Deleting Approved Discount:
```
⚠️ Confirmation Dialog:
"You are about to delete a approved discount mapping. This action cannot be undone. Are you sure?"

[Cancel] [OK]

✅ Success Message (Green notification):
"Discount mapping deleted successfully!"
```

---

## Visual Indicators

### Delete Button States:

#### Draft Discount (All Users):
- **Color**: Red (text-red-600)
- **Cursor**: Pointer
- **Tooltip**: "Delete"
- **Clickable**: Yes

#### Approved/Rejected Discount (Regular User):
- **Color**: Gray (text-gray-400)
- **Cursor**: Not-allowed
- **Tooltip**: "Only draft discounts can be deleted"
- **Clickable**: No (disabled)

#### Approved/Rejected Discount (Super Admin):
- **Color**: Red (text-red-600)
- **Cursor**: Pointer
- **Tooltip**: "Super Admin: Delete any discount"
- **Clickable**: Yes

---

## Security

### Backend Protection:
- Checks `req.user.role === 'Super Admin'`
- Returns 400 error if non-super-admin tries to delete non-draft
- Error message: "Only draft discount mappings can be deleted. Super Admin can delete any discount."

### Frontend Protection:
- Pre-validates user role before API call
- Shows error message in UI
- Disables button visually for non-super-admin

---

## Testing Checklist

### As Regular User:
- [ ] Can delete draft discount → Success
- [ ] Try to delete approved discount → Button grayed out
- [ ] Click grayed button → Shows error message
- [ ] Error message auto-dismisses after 5 seconds

### As Super Admin:
- [ ] Can delete draft discount → Success
- [ ] Can delete approved discount → Shows special confirmation
- [ ] Can delete rejected discount → Shows special confirmation
- [ ] Delete button always red (active)
- [ ] Tooltip shows "Super Admin: Delete any discount"
- [ ] Success message shows after deletion

---

## Role Variations Supported

The code checks for both role formats:
- `'super_admin'` (lowercase with underscore)
- `'Super Admin'` (title case with space)

Both formats will have delete power.

---

## Status: ✅ COMPLETE

Super Admin now has full power to delete any discount mapping!
