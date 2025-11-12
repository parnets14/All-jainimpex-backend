# Sales Executive App Backend - Integration Complete! ✅

## 🎉 Successfully Integrated into Main CRM Backend

The Sales Executive App backend has been integrated into the main CRM backend server instead of running as a separate service.

---

## 📁 File Structure

```
crm_backend/
├── SalesExecutiveAppBackend/
│   ├── models/
│   │   └── Attendance.js ✅
│   ├── controllers/
│   │   ├── authController.js ✅
│   │   └── attendanceController.js ✅
│   ├── routes/
│   │   ├── authRoutes.js ✅
│   │   └── attendanceRoutes.js ✅
│   ├── middleware/
│   │   ├── protect.js ✅
│   │   └── upload.js ✅
│   └── README.md ✅
├── server.js (UPDATED - Routes added) ✅
└── ... (other CRM files)
```

---

## 🔗 Integration Points

### 1. Routes Added to Main Server
In `server.js`, added:
```javascript
// Sales Executive App Routes
import seAuthRoutes from './SalesExecutiveAppBackend/routes/authRoutes.js';
import seAttendanceRoutes from './SalesExecutiveAppBackend/routes/attendanceRoutes.js';

// Route registration
app.use('/api/se/auth', seAuthRoutes);
app.use('/api/se/attendance', seAttendanceRoutes);
```

### 2. Shared Resources
- **Database**: Uses same MongoDB connection
- **User Model**: Shares `models/User.js` from main CRM
- **JWT Secret**: Uses same JWT_SECRET from `.env`
- **Uploads**: Uses same `uploads/` directory

### 3. ES6 Modules
All files converted to ES6 modules to match main server:
- `import/export` instead of `require/module.exports`
- `import.meta.url` for `__dirname` equivalent

---

## 🚀 How to Start

### 1. Start Main CRM Backend
```bash
cd JainInpexCRMBackend/crm_backend
npm start
```

The Sales Executive App routes will be available automatically!

### 2. Test Health Check
```bash
curl http://localhost:5000/api/
```

---

## 📡 Available API Endpoints

### Base URL: `http://localhost:5000/api/se/`

### Authentication
```
POST   /api/se/auth/login              // Send OTP
POST   /api/se/auth/verify-otp         // Verify OTP & Login
GET    /api/se/auth/me                 // Get Profile (Protected)
POST   /api/se/auth/logout             // Logout (Protected)
```

### Attendance
```
POST   /api/se/attendance/check-in     // Check-in with GPS & Selfie (Protected)
POST   /api/se/attendance/check-out    // Check-out (Protected)
GET    /api/se/attendance/today        // Today's Attendance (Protected)
GET    /api/se/attendance/history      // Attendance History (Protected)
```

---

## 🧪 Testing

### 1. Test Login
```bash
curl -X POST http://localhost:5000/api/se/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"9876543210"}'
```

Expected Response:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "otp": "123456",
  "phone": "9876543210"
}
```

### 2. Test OTP Verification
```bash
curl -X POST http://localhost:5000/api/se/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"9876543210","otp":"123456"}'
```

Expected Response:
```json
{
  "success": true,
  "message": "Login successful",
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "name": "Sales Executive Name",
    "phone": "9876543210",
    "role": "sales_executive"
  }
}
```

### 3. Test Check-in (with token)
```bash
curl -X POST http://localhost:5000/api/se/attendance/check-in \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "latitude=19.0760" \
  -F "longitude=72.8777" \
  -F "address=Mumbai" \
  -F "selfie=@/path/to/image.jpg"
```

---

## 🔐 Authentication Flow

1. **Sales Executive Created in Web CRM**
   - Admin creates user with role `sales_executive`
   - Phone number is saved in database

2. **Mobile App Login**
   - User enters phone number
   - Backend generates OTP (currently displayed, not sent via SMS)
   - User enters OTP
   - Backend verifies and returns JWT token

3. **Protected Routes**
   - All attendance routes require JWT token
   - Token must be sent in `Authorization: Bearer <token>` header
   - Middleware verifies user has `sales_executive` role

---

## 📂 File Uploads

Uploaded files are stored in:
```
crm_backend/uploads/
├── selfies/      // Attendance selfies
├── receipts/     // Collection receipts (future)
├── expenses/     // Expense bills (future)
└── visits/       // Visit images (future)
```

---

## 🔄 Next Steps

### Phase 2: Frontend Integration
1. Update mobile app API base URL to `http://localhost:5000/api/se`
2. For Android emulator: `http://10.0.2.2:5000/api/se`
3. For physical device: `http://YOUR_IP:5000/api/se`
4. Uncomment production code in:
   - `LoginScreen.jsx`
   - `OTPScreen.jsx`
   - `AuthContext.jsx`

### Phase 3: Create Attendance Screens
1. AttendanceScreen.jsx
2. SelfieVerificationScreen.jsx
3. Install camera & GPS packages
4. Test end-to-end flow

### Phase 4: Add More Modules
- Route Plan
- Dealer Visit
- Sales Order
- Collection
- Target
- Expense
- GPS Tracking

---

## ✅ Benefits of Integration

1. **Single Server**: No need to run multiple servers
2. **Shared Database**: All data in one MongoDB instance
3. **Shared Auth**: Same JWT secret and User model
4. **Easier Deployment**: Deploy one backend instead of two
5. **Consistent Code Style**: All ES6 modules
6. **Shared Middleware**: Reuse existing middleware

---

## 🐛 Troubleshooting

### Routes not working?
- Check if main server is running: `npm start`
- Check console for "Sales Executive App routes registered" message
- Verify routes with: `curl http://localhost:5000/api/se/auth/login`

### Import errors?
- All files use ES6 modules (`.js` extension required in imports)
- Check for `import` instead of `require`
- Check for `export` instead of `module.exports`

### User not found?
- Make sure user exists in database with role `sales_executive`
- Check phone number matches exactly
- User status must be `Active`

---

## 📊 Status

- ✅ Backend integrated into main server
- ✅ Authentication APIs working
- ✅ Attendance APIs working
- ✅ File upload configured
- ✅ ES6 modules converted
- ⏳ Frontend needs to be updated to use real backend
- ⏳ Attendance screens need to be created

---

**Last Updated**: 2025-11-12  
**Status**: Backend Integration Complete - Ready for Frontend Testing
