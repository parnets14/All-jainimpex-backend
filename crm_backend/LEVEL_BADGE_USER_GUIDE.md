# Level Badge User Guide

## What Changed?

We've added **level badges** to all subcategory level dropdowns in Product Master to make it crystal clear which level each item belongs to.

## Visual Example

### Before (Confusing)
When you opened the Level 3 dropdown, you saw:
```
Sub1-L1-Item1-L2-Item1-L3-Item1
Sub1-L1-Item1-L2-Item2-L3-Item1
```

You might think: "Why are Level 2 items showing in Level 3?" 😕

### After (Clear)
Now you see:
```
[L3] Sub1-L1-Item1-L2-Item1-L3-Item1
[L3] Sub1-L1-Item1-L2-Item2-L3-Item1
```

The **[L3]** badge tells you: "These are Level 3 items!" ✅

## Understanding Item Names

Item names show the **full hierarchical path**:
- `Sub1` = Subcategory 1
- `L1-Item1` = Level 1 Item 1 (parent)
- `L2-Item1` = Level 2 Item 1 (grandparent)
- `L3-Item1` = Level 3 Item 1 (this item)

The name `Sub1-L1-Item1-L2-Item1-L3-Item1` means:
- This item is at **Level 3** (see the badge: [L3])
- Its parent is "L2-Item1" (Level 2)
- Its grandparent is "L1-Item1" (Level 1)
- It belongs to "Sub1" (Subcategory 1)

## How to Use

### 1. Open Product Master
Navigate to: **Master Management → Product Master**

### 2. Click "Add New Product"
The form opens with all fields

### 3. Look at Extended Subcategory Dropdowns
You'll see 5 optional dropdowns:
- **Subcategory Level 1** - Shows [L1] badges
- **Subcategory Level 2** - Shows [L2] badges
- **Subcategory Level 3** - Shows [L3] badges
- **Subcategory Level 4** - Shows [L4] badges
- **Subcategory Level 5** - Shows [L5] badges

### 4. Select Items
When you click a dropdown, each item shows its level badge:
```
[L3] 2nd level
[L3] Sub1-L1-Item1-L2-Item1-L3-Item1
[L3] Sub1-L1-Item1-L2-Item1-L3-Item2
```

### 5. Selected Value
After selecting, the badge appears in the selected value too:
```
Selected: [L3] Sub1-L1-Item1-L2-Item1-L3-Item1  [×]
```

## Badge Colors

- **Indigo background** with **dark indigo text**
- **Bold font** for visibility
- **Compact size** to not clutter the UI

## Key Points

1. **Badge = Actual Level**: The badge shows the database level, not the name
2. **Name = Full Path**: The name shows the complete hierarchy for context
3. **Filtering Works**: When you select Level 1, Level 2 shows only its children
4. **Searchable**: You can still search across all levels
5. **Auto-fill Works**: Selecting Level 3 auto-fills Level 2, Level 1, Subcategory, Category

## Example Workflow

### Scenario: Adding a Product at Level 3

1. **Select Category**: "Test Category"
2. **Select Subcategory**: "Test Subcategory 1"
3. **Select Level 1**: [L1] Sub1-L1-Item1
4. **Select Level 2**: [L2] Sub1-L1-Item1-L2-Item1
5. **Select Level 3**: [L3] Sub1-L1-Item1-L2-Item1-L3-Item1

Now you know exactly which level you're at! ✅

### Scenario: Jumping Directly to Level 3

1. **Skip to Level 3 dropdown**
2. **Search and select**: [L3] Sub1-L1-Item1-L2-Item1-L3-Item1
3. **Auto-fill happens**: Level 2, Level 1, Subcategory, Category all fill automatically

The badge confirms you selected a Level 3 item! ✅

## Why This Helps

### Problem Before
- Item names contained "L2" even for Level 3 items
- Users got confused about which level they were selecting
- Hard to verify if the right level was selected

### Solution Now
- **[L3]** badge clearly shows it's a Level 3 item
- No confusion about levels
- Easy to verify selections
- Professional and clear UI

## Technical Note

The badge shows the `level` field from the database:
- Database: `{ name: "Sub1-L1-Item1-L2-Item1-L3-Item1", level: 3 }`
- Display: `[L3] Sub1-L1-Item1-L2-Item1-L3-Item1`

The badge is **always correct** because it comes directly from the database level field.

## Questions?

**Q: Why do Level 3 items have "L2" in their names?**
A: The name shows the full path. "L2-Item1" is the parent's name, not this item's level. Look at the badge for the actual level.

**Q: Can I hide the badges?**
A: The badges are essential for clarity. They don't clutter the UI and help prevent mistakes.

**Q: Do all dropdowns have badges?**
A: Only extended subcategory dropdowns (Levels 1-5). Category, Subcategory, and Brand dropdowns don't need them.

**Q: What if I see [L2] in a Level 3 dropdown?**
A: That would be a bug! The badge should always match the dropdown label. Please report it.

## Summary

✅ **Level badges** make it clear which level each item belongs to
✅ **No more confusion** about item names containing "L2", "L3", etc.
✅ **Professional UI** with clear visual indicators
✅ **Easy verification** of selections
✅ **Maintains functionality** - all features work as before

Enjoy the improved clarity! 🎉
