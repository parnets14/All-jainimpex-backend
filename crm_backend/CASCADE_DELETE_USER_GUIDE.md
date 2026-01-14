# Cascade Delete - User Guide

## What is Cascade Delete?

Cascade delete allows you to delete a category along with all its children (subcategories, extended subcategories, and brands) in one operation. The system will show you exactly what will be deleted before you confirm.

## How to Use

### Deleting a Category Without Children

1. Go to **Master Management** → **Category Setup**
2. Find the category you want to delete
3. Click the **trash icon** (🗑️) on the category card
4. A dialog will appear asking for confirmation
5. Click **"Delete"** to confirm
6. The category will be deleted

**Example:**
```
Delete category

Are you sure you want to delete "Empty Category"?

[Delete]  [Cancel]
```

### Deleting a Category With Children

1. Go to **Master Management** → **Category Setup**
2. Find the category you want to delete
3. Click the **trash icon** (🗑️) on the category card
4. A dialog will appear showing:
   - A warning that the category has children
   - A breakdown of what will be deleted:
     - Number of subcategories
     - Number of extended subcategories
     - Number of brands
   - Total number of items that will be deleted
5. Click **"Delete All (X items)"** to delete everything
6. Or click **"Cancel"** to abort

**Example:**
```
Delete category

Are you sure you want to delete "Plumbing"?

⚠️ This item has children:
• 3 subcategories
• 12 extended subcategories
• 8 brands

Total: 23 items will be deleted

[Delete All (24 items)]  [Cancel]
```

## What Happens During Cascade Delete?

When you click "Delete All", the system will:

1. **Delete all brands** under the category
2. **Delete all extended subcategories** under the category
3. **Delete all subcategories** under the category
4. **Delete the category** itself

This happens in a specific order to maintain data integrity.

## Important Notes

### ⚠️ Warning: This Action Cannot Be Undone

Once you delete a category with cascade, all the data is permanently removed. There is no undo button. Make sure you really want to delete everything before clicking "Delete All".

### ✅ Safety Features

1. **Clear Warning**: You'll see exactly what will be deleted
2. **Item Count**: The system shows the total number of items
3. **Two-Step Confirmation**: You must click the delete button twice (once to open dialog, once to confirm)
4. **No Accidental Deletion**: Categories with children cannot be deleted without explicitly choosing cascade delete

### 📊 Stats Update

After deletion, the stats at the top of the page will automatically update to reflect the new counts.

## Examples

### Example 1: Simple Delete

**Scenario**: You have a category "Test Category" with no subcategories or brands.

**Steps**:
1. Click delete on "Test Category"
2. Dialog shows: "Are you sure you want to delete 'Test Category'?"
3. Click "Delete"
4. Category is deleted
5. Success message: "Category deleted successfully"

### Example 2: Cascade Delete

**Scenario**: You have a category "Steel Pipes" with:
- 2 subcategories (Seamless, Welded)
- 5 extended subcategories (various sizes)
- 3 brands (Brand A, Brand B, Brand C)

**Steps**:
1. Click delete on "Steel Pipes"
2. Dialog shows:
   ```
   ⚠️ This item has children:
   • 2 subcategories
   • 5 extended subcategories
   • 3 brands
   
   Total: 10 items will be deleted
   ```
3. Click "Delete All (11 items)"
4. All 11 items are deleted (10 children + 1 category)
5. Success message: "Category and all children deleted successfully"

### Example 3: Canceling Cascade Delete

**Scenario**: You accidentally clicked delete on a category with children.

**Steps**:
1. Click delete on the category
2. Dialog shows warning with child counts
3. Click "Cancel"
4. Nothing is deleted
5. Dialog closes

## Troubleshooting

### "Cannot delete category with existing subcategories"

**Problem**: You tried to delete a category that has children, but the cascade option wasn't used.

**Solution**: This shouldn't happen with the new UI, but if it does:
1. Make sure you're using the latest version of the application
2. Refresh the page and try again
3. If the problem persists, contact support

### Delete button is disabled

**Problem**: The delete button appears grayed out.

**Solution**: 
1. Check if you have permission to delete categories
2. Make sure you're logged in as a user with delete permissions
3. Contact your administrator if you need delete permissions

### Stats not updating after deletion

**Problem**: The stats at the top don't update after deleting items.

**Solution**:
1. Refresh the page
2. The stats should update automatically, but a refresh will force it
3. If the problem persists, contact support

## Best Practices

### 1. Double-Check Before Deleting

Always review the list of items that will be deleted before clicking "Delete All". Make sure you really want to delete everything.

### 2. Export Data First (Optional)

If you're deleting a large category with many children, consider exporting the data first as a backup.

### 3. Delete in Stages (Alternative)

If you're not sure about cascade delete, you can:
1. Delete brands first
2. Then delete extended subcategories
3. Then delete subcategories
4. Finally delete the category

This gives you more control but takes more time.

### 4. Use Descriptive Names

When creating categories, use clear, descriptive names. This makes it easier to identify what you're deleting.

## FAQ

**Q: Can I undo a cascade delete?**
A: No, cascade delete is permanent. There is no undo feature.

**Q: Will cascade delete affect products?**
A: No, products are not deleted when you delete categories. However, products may lose their category association.

**Q: Can I delete multiple categories at once?**
A: Not currently. You must delete categories one at a time.

**Q: What if I only want to delete some children?**
A: Use the manual approach: delete specific children first, then delete the category.

**Q: Is there a limit to how many items can be cascade deleted?**
A: No, but deleting very large hierarchies (100+ items) may take a few seconds.

**Q: Can I see what was deleted after cascade delete?**
A: The success message shows the count of deleted items. For detailed logs, contact your administrator.

## Support

If you encounter any issues or have questions about cascade delete:

1. Check this guide first
2. Contact your system administrator
3. Report bugs to the development team

## Version History

- **v1.0** (Current): Initial implementation for categories
- **Future**: Cascade delete for subcategories, extended subcategories, and brands
