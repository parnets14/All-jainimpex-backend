# Category Master Debug Guide

## Issue
When clicking "View Nested Levels" on a Level 2 item in Category Master, it shows both Level 2 AND Level 3 items instead of just Level 3 items (the children).

## What We've Done

### 1. Verified API is Correct ✅
- Ran `test-category-master-nested-view.js`
- Confirmed API returns ONLY children when querying by parent
- Example: Querying Level 2 parent returns ONLY Level 3 children

### 2. Added Console Logging
Added extensive logging to track the flow:

#### In `fetchExtendedItems`:
```javascript
console.log('🔍 Fetching extended items:', { 
  parentId, 
  parentType, 
  selectedCategory, 
  selectedSubcategory,
  extendedHierarchyPath 
});
console.log('✅ Items count:', response?.items?.length || 0);
console.log('✅ Item levels:', items.map(i => ({ name: i.name, level: i.level })));
```

#### In "View Nested Levels" button:
```javascript
console.log('🔘 View Nested Levels clicked');
console.log('   Current level:', currentLevel);
console.log('   Selected item:', selectedItem);
console.log('   Selected item level:', selectedItem?.level);
```

#### In `handleChoice` (Add Nested Level):
```javascript
console.log('🔘 Choice selected:', choice);
console.log('   → Setting parent extended to:', selectedItem._id);
console.log('   → Updated extended hierarchy path:', newExtendedPath);
```

#### In `handleAddItem` (Creating extended):
```javascript
console.log('🏗️ Creating extended subcategory');
console.log('   Category:', selectedCategory);
console.log('   Subcategory:', selectedSubcategory);
console.log('   Parent Extended:', selectedExtended);
```

## How to Debug

### Step 1: Open Browser Console
1. Open Category Master in browser
2. Press F12 to open Developer Tools
3. Go to Console tab
4. Clear console (click trash icon)

### Step 2: Test "View Nested Levels"
1. Navigate to a subcategory
2. Click on a Level 1 item
3. Click "View Nested Levels"
4. **Check console output:**
   ```
   🔘 View Nested Levels clicked
      Current level: extended
      Selected item: [object]
      Selected item level: 1
      → Navigating deeper into extended levels
      → Setting parent as: Sub1-L1-Item1 [ID]
      → New extended path: [...]
      → Fetching children of: [ID]
   
   🔍 Fetching extended items:
      parentId: [ID]
      parentType: extended
      ...
   
   ✅ Extended items response: [...]
   ✅ Items count: 2
   ✅ Item levels: [{name: "...", level: 2}, {name: "...", level: 2}]
   ```

5. **What to look for:**
   - Are the item levels correct? (Should all be Level 2)
   - Is the parentId correct? (Should be the Level 1 item's ID)
   - How many items are returned?

### Step 3: Check What's Displayed
1. Look at the items shown on screen
2. Count how many items are displayed
3. Check if any items have the wrong level

### Step 4: Compare Console vs Display
- **Console says:** 2 items, both Level 2
- **Display shows:** 4 items (2 Level 2 + 2 Level 3)?

If there's a mismatch, the problem is in the rendering, not the API.

## Possible Issues

### Issue 1: State Not Clearing
**Symptom:** Old items from previous view are still showing

**Check:**
```javascript
// In fetchExtendedItems, we added:
setExtendedItems([]); // Clear existing items first
```

**Solution:** Make sure this line is executing before the API call

### Issue 2: Multiple API Calls
**Symptom:** Two API calls happening, one returns Level 2, one returns Level 3

**Check console for:**
```
🔍 Fetching extended items: (appears twice)
```

**Solution:** Check if `fetchExtendedItems` is being called multiple times

### Issue 3: Wrong Parent ID
**Symptom:** API is called with wrong parent ID

**Check console for:**
```
🔍 Fetching extended items:
   parentId: [WRONG_ID]  // Should be the clicked item's ID
```

**Solution:** Verify `selectedItem._id` is correct in "View Nested Levels" button

### Issue 4: React State Update Timing
**Symptom:** State updates happen in wrong order

**Check console for order of logs:**
```
1. 🔘 View Nested Levels clicked
2. → Setting parent as: [ID]
3. 🔍 Fetching extended items: [ID]
4. ✅ Items count: X
```

**Solution:** Ensure state updates complete before API call

## Expected Flow

### Correct Flow for "View Nested Levels" on Level 2 Item:

1. **User clicks Level 2 item** → Choice dialog opens
2. **User clicks "View Nested Levels"**
3. **Console logs:**
   ```
   🔘 View Nested Levels clicked
      Current level: extended
      Selected item level: 2
      → Setting parent as: [Level 2 ID]
   ```
4. **State updates:**
   - `selectedExtended` = Level 2 item ID
   - `extendedHierarchyPath` = [..., Level 2 item]
   - `navigationPath` = [..., Level 2 item]
5. **API call:**
   ```
   🔍 Fetching extended items:
      parentId: [Level 2 ID]
      parentType: extended
   ```
6. **API response:**
   ```
   ✅ Items count: 2
   ✅ Item levels: [
      {name: "Level 3 Item 1", level: 3},
      {name: "Level 3 Item 2", level: 3}
   ]
   ```
7. **Display:** Shows ONLY 2 Level 3 items

## What to Report

After following the debug steps, report:

1. **Console Output:**
   - Copy the complete console output
   - Include all logs from clicking "View Nested Levels"

2. **What's Displayed:**
   - How many items are shown?
   - What are their names?
   - What levels do they appear to be?

3. **API Response:**
   - From Network tab, check the actual API response
   - Go to Network tab → Find the request to `/api/extended-subcategories/by-parent/[ID]`
   - Check the response body

4. **Screenshots:**
   - Screenshot of the items displayed
   - Screenshot of the console output
   - Screenshot of the Network tab response

## Quick Test Script

Run this in browser console to check current state:

```javascript
// Check what items are currently displayed
console.log('Current extended items:', 
  Array.from(document.querySelectorAll('.grid > div'))
    .map(el => el.querySelector('h3')?.textContent)
);

// Check React state (if available)
// This might not work depending on React version
```

## Next Steps

Based on the console output, we can determine:

1. **If API returns correct data but display is wrong:**
   - Issue is in React rendering
   - Check `getCurrentData()` function
   - Check if `extendedItems` state is being set correctly

2. **If API is called with wrong parent:**
   - Issue is in state management
   - Check `selectedExtended` value
   - Check when it's being set

3. **If multiple API calls happen:**
   - Issue is in useEffect dependencies
   - Check if `fetchExtendedItems` is in a useEffect
   - Check dependencies array

## Files to Check

1. `JainInpexCRM/src/Components/MasterManagement/CategoryMaster.jsx`
   - Line ~150: `fetchExtendedItems` function
   - Line ~1000: "View Nested Levels" button
   - Line ~420: `handleChoice` function

2. Browser Network Tab:
   - `/api/extended-subcategories/by-parent/[ID]`
   - Check request parameters
   - Check response body

3. Browser Console:
   - All logs starting with 🔘, 🔍, ✅
   - Any error messages
   - React warnings

## Success Criteria

The fix is successful when:

1. ✅ Clicking "View Nested Levels" on Level 1 shows ONLY Level 2 items
2. ✅ Clicking "View Nested Levels" on Level 2 shows ONLY Level 3 items
3. ✅ Clicking "View Nested Levels" on Level 3 shows ONLY Level 4 items
4. ✅ Clicking "View Nested Levels" on Level 4 shows ONLY Level 5 items
5. ✅ Console logs show correct parent ID and item levels
6. ✅ No duplicate items displayed
7. ✅ No items from wrong levels displayed
