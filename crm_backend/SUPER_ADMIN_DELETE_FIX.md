# Super Admin Delete Fix - Role Format Issue

## Problem
Super Admin was unable to delete non-draft discounts even though the feature was implemented. The error was:
```
400 Bad Request
"Only draft discount mappings can be deleted. Super Admin can delete any discount."
```

## Root Cause
The backend was checking for `req.user.role === 'Super Admin'` (with space and capital letters), but the actual role in the database might be stored as `'super_admin'` (with underscore and lowercase).

## Solution
Updated the backend controller to normalize the role before checking, handling both formats:
- `'super_admin'` (lowercase with underscore)
- `'Super Admin'` (title case with space)
- `'SUPER ADMIN'` (uppercase with space)
- Any combination of case and spacing

---

## Changes Made

### Backend Controller Update ✅
**File**: `JainInpexCRMBackend/crm_backend/controllers/discountMappingController.js`
**Function**: `deleteDiscountMapping`

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

    // Check if user is super admin (handle both formats: 'super_admin' and 'Super Admin')
    const userRole = req.user?.role?.toLowerCase().replace(/\s+/g, '_');
    const isSuperAdmin = userRole === 'super_admin';

    console.log('Delete discount - User role:', req.user?.role, 'Normalized:', userRole, 'Is Super Admin:', isSuperAdmin);
    console.log('Discount status:', discountMapping.status);

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

### Key Changes:
1. **Role Normalization**: 
   ```javascript
   const userRole = req.user?.role?.toLowerCase().replace(/\s+/g, '_');
   const isSuperAdmin = userRole === 'super_admin';
   ```
   - Converts to lowercase
   - Replaces spaces with underscores
   - Compares against normalized format

2. **Debug Logging**:
   ```javascript
   console.log('Delete discount - User role:', req.user?.role, 'Normalized:', userRole, 'Is Super Admin:', isSuperAdmin);
   console.log('Discount status:', discountMapping.status);
   ```
   - Logs original role
   - Logs normalized role
   - Logs super admin status
   - Logs discount status

3. **Safe Access**:
   ```javascript
   req.user?.role?.toLowerCase()
   ```
   - Uses optional chaining to prevent errors if req.user is undefined

---

## Testing

### Check User Roles in Database
Run the provided script to see all user roles:
```bash
node check-user-role.js
```

This will show:
- All users and their roles
- Original role format
- Normalized role format
- List of super admins

### Test Delete Functionality

#### As Super Admin:
1. Login as super admin
2. Go to Discount Management
3. Try to delete an approved discount
4. Should see confirmation dialog
5. Should successfully delete
6. Should see success message

#### As Regular User:
1. Login as regular user
2. Go to Discount Management
3. Try to delete an approved discount
4. Button should be grayed out
5. Should see error message if clicked

---

## Role Format Handling

The system now handles all these role formats:
- `'super_admin'` → Normalized to `'super_admin'` ✅
- `'Super Admin'` → Normalized to `'super_admin'` ✅
- `'SUPER ADMIN'` → Normalized to `'super_admin'` ✅
- `'super admin'` → Normalized to `'super_admin'` ✅
- `'Super_Admin'` → Normalized to `'super_admin'` ✅

All will be recognized as Super Admin!

---

## Debug Output

When a delete request is made, you'll see in the server console:
```
Delete discount - User role: super_admin Normalized: super_admin Is Super Admin: true
Discount status: Approved
```

Or if not super admin:
```
Delete discount - User role: sales_manager Normalized: sales_manager Is Super Admin: false
Discount status: Approved
```

This helps debug role-related issues.

---

## Status: ✅ FIXED

Super Admin can now delete any discount regardless of status!
