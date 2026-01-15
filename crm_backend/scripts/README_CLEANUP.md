# Database Cleanup Script

## Purpose

This script deletes all data from the database **EXCEPT** user accounts (including super admin login). This is useful when you want to start fresh with the new brand-first hierarchy.

## What Gets Deleted

- ✅ Brands
- ✅ Categories
- ✅ Subcategories
- ✅ Extended Subcategories
- ✅ Products
- ✅ Dealers & Dealer Types
- ✅ Suppliers
- ✅ Purchase Orders & GRNs
- ✅ Sales Orders & Invoices
- ✅ Stock & Warehouses
- ✅ Payments & Ledgers
- ✅ Employees & Attendance
- ✅ Expenses & Claims
- ✅ Discount Mappings & Schemes
- ✅ All other transactional data

## What Gets Preserved

- ✅ **Users** (including super admin)
- ✅ **Login credentials**

## How to Run

### Option 1: Using Node (Recommended)

```bash
cd JainInpexCRMBackend/crm_backend
node scripts/cleanupDatabase.js
```

### Option 2: Using npm script

Add this to your `package.json` scripts:

```json
{
  "scripts": {
    "cleanup": "node scripts/cleanupDatabase.js"
  }
}
```

Then run:

```bash
cd JainInpexCRMBackend/crm_backend
npm run cleanup
```

## Before Running

1. **Backup your database** if you want to keep any data
2. Make sure your `.env` file has the correct `MONGODB_URI`
3. Ensure the backend server is **NOT** running

## After Running

1. You can login with your existing super admin credentials
2. Start creating data with the new brand-first hierarchy:
   - Create Brands first
   - Then Categories under Brands
   - Then Subcategories under Categories
   - Then Extended Levels (optional, up to 5 levels)
   - Then Products

## Example Output

```
🔌 Connecting to MongoDB...
✅ Connected to MongoDB

⚠️  WARNING: This will delete ALL data except Users!
📋 Collections to be cleared:
   - Brands
   - Categories
   - Subcategories
   ...

🗑️  Starting cleanup...

✅ Deleted 50 Dealer Payments
✅ Deleted 100 Dealer Invoices
✅ Deleted 200 Sales Orders
...
✅ Deleted 10 Brands

✅ Cleanup complete! Total records deleted: 1500
✅ Users preserved - you can still login with your super admin account

🎉 Database is now clean and ready for the new brand-first hierarchy!

🔌 Disconnected from MongoDB
```

## Safety Features

- Only deletes data collections
- Preserves user accounts
- Shows count of deleted records
- Confirms completion

## Troubleshooting

### Error: Cannot find module

Make sure you're in the correct directory:

```bash
cd JainInpexCRMBackend/crm_backend
```

### Error: Connection refused

Make sure MongoDB is running:

```bash
# For local MongoDB
mongod

# Or check if MongoDB service is running
```

### Error: MONGODB_URI not found

Check your `.env` file has:

```
MONGODB_URI=mongodb://localhost:27017/jainimpexcrm
```

## Warning

⚠️ **This action cannot be undone!** Make sure you have a backup if you need to restore data later.

## After Cleanup - New Hierarchy Flow

1. Login with super admin
2. Go to Category Master
3. Create Brands (top level)
4. Create Categories under Brands
5. Create Subcategories under Categories
6. Create Extended Levels (optional, up to 5)
7. Go to Product Master
8. Create Products (select Brand → Category → Subcategory)
