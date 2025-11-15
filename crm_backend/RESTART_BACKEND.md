# Restart Backend Server

The collection routes have been added to the backend, but the server needs to be restarted to register them.

## Quick Restart

1. **Stop the current backend server** (Ctrl+C in the terminal where it's running)

2. **Start the server again**:
   ```bash
   cd JainInpexCRMBackend/crm_backend
   npm start
   ```

## Verify Routes Are Working

After restarting, you can test if the routes are registered:

```bash
cd JainInpexCRMBackend/crm_backend
node scripts/testCollectionRoutes.js
```

## What Was Added

### Admin API Routes (Web CRM)
- `GET /api/collections` - Get all collections
- `GET /api/collections/stats` - Get statistics
- `GET /api/collections/:id` - Get collection details
- `PUT /api/collections/:id/approve` - Approve collection
- `PUT /api/collections/:id/reject` - Reject collection

### Mobile API Routes (Sales Executive App)
- `POST /api/se/collections` - Create collection
- `GET /api/se/collections` - Get my collections
- `GET /api/se/collections/:id` - Get collection details

## Files Modified

1. `server.js` - Added collection routes import and registration
2. `routes/collectionRoutes.js` - Admin routes (created)
3. `controllers/collectionController.js` - Admin controller (created)
4. `SalesExecutiveAppBackend/routes/collectionRoutes.js` - Mobile routes (already existed)
5. `SalesExecutiveAppBackend/controllers/collectionController.js` - Mobile controller (already existed)

## Troubleshooting

If you still get 404 errors after restarting:

1. Check if the server started without errors
2. Look for this log message: `✅ Sales Executive App routes registered at /api/se/*`
3. Check if collection routes are imported in server.js (line 70)
4. Check if collection routes are registered (line 303)

## Expected Console Output

When the server starts, you should see:
```
🔧 Registering Sales Executive App routes...
📍 SE Route Hit: GET /api/se/collections
✅ Sales Executive App routes registered at /api/se/*
```
