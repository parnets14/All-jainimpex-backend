# Testing Dealer Pricing Route

## Issue: 404 Error on `/api/dealer-pricing`

### Root Cause
The route is correctly set up but the server needs to be **restarted** to load the new route.

## Solution Steps

### 1. **Stop the Current Server**
- Press `Ctrl + C` in the terminal where your backend is running
- Make sure the server is completely stopped

### 2. **Restart the Server**
```bash
cd JainInpexCRMBackend/crm_backend
npm run dev
```

Or if using `node` directly:
```bash
node server.js
```

### 3. **Check Server Logs**
After restarting, you should see these messages in the console:
```
✅ Dealer Pricing Routes: Loading...
🔧 Registering dealer pricing routes...
✅ Dealer Pricing Routes: Registered successfully
   - GET /api/dealer-pricing
   - GET /api/dealer-pricing/product/:productId
   - POST /api/dealer-pricing
   - PUT /api/dealer-pricing/:id
   - POST /api/dealer-pricing/bulk-update
   - POST /api/dealer-pricing/sync-purchase-prices
✅ Dealer pricing routes registered at /api/dealer-pricing
```

### 4. **Test the Route**

#### Option A: Browser Console (with auth token)
```javascript
fetch('http://localhost:5000/api/dealer-pricing?limit=10', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN_HERE'
  }
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));
```

#### Option B: Postman/Thunder Client
- Method: `GET`
- URL: `http://localhost:5000/api/dealer-pricing?limit=10`
- Headers: `Authorization: Bearer YOUR_TOKEN`

#### Option C: Curl
```bash
curl -X GET "http://localhost:5000/api/dealer-pricing?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 5. **If Still Getting 404**

Check these:

1. **Verify the route file exists:**
   ```bash
   ls routes/dealerPricingRoutes.js
   ```

2. **Check server console for errors:**
   - Look for any import errors
   - Look for any module not found errors

3. **Clear Node.js cache:**
   ```bash
   # Stop server
   # Delete node_modules/.cache if exists
   rm -rf node_modules/.cache
   # Restart server
   npm run dev
   ```

4. **Verify the route is in server.js:**
   - Line 36: `import dealerPricingRoutes from "./routes/dealerPricingRoutes.js";`
   - Line 243: `app.use("/api/dealer-pricing", dealerPricingRoutes);`

## Expected Response

When the route works, you should get:
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "currentPage": 1,
    "totalPages": 0,
    "totalRecords": 0,
    "hasNext": false,
    "hasPrev": false
  }
}
```

## Files Created

✅ `models/DealerPricing.js` - Model for storing pricing
✅ `controllers/dealerPricingController.js` - Controller logic
✅ `routes/dealerPricingRoutes.js` - Route definitions
✅ Route registered in `server.js` at line 243

## Route Endpoints

All routes require authentication (Bearer token):

- `GET /api/dealer-pricing` - Get all pricing records
- `GET /api/dealer-pricing/product/:productId` - Get pricing by product
- `POST /api/dealer-pricing` - Create or update pricing
- `PUT /api/dealer-pricing/:id` - Update pricing
- `POST /api/dealer-pricing/bulk-update` - Bulk update
- `POST /api/dealer-pricing/sync-purchase-prices` - Sync purchase prices



