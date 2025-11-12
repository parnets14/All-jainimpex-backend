# Sales Executive App Backend

Backend API for the Sales Executive Mobile Application.

## 📁 Structure

```
SalesExecutiveAppBackend/
├── models/
│   └── Attendance.js ✅
├── controllers/
│   ├── authController.js ✅
│   └── attendanceController.js ✅
├── routes/
│   ├── authRoutes.js ✅
│   └── attendanceRoutes.js ✅
├── middleware/
│   ├── protect.js ✅
│   └── upload.js ✅
├── server.js ✅
├── package.json ✅
└── README.md ✅
```

## 🚀 Setup

### 1. Install Dependencies
```bash
cd JainInpexCRMBackend/crm_backend/SalesExecutiveAppBackend
npm install
```

### 2. Environment Variables
Make sure `.env` file exists in `crm_backend/` with:
```
MONGODB_URI=mongodb://localhost:27017/jainimpex_crm
JWT_SECRET=your-secret-key-here
SE_APP_PORT=5001
```

### 3. Start Server
```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

Server will run on: `http://localhost:5001`

## 📡 API Endpoints

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

### Health Check
```
GET    /api/se/health                  // Server health check
```

## 🔐 Authentication Flow

1. **Login**: POST `/api/se/auth/login`
   ```json
   {
     "phone": "9876543210"
   }
   ```
   Response:
   ```json
   {
     "success": true,
     "message": "OTP sent successfully",
     "otp": "123456",
     "phone": "9876543210"
   }
   ```

2. **Verify OTP**: POST `/api/se/auth/verify-otp`
   ```json
   {
     "phone": "9876543210",
     "otp": "123456"
   }
   ```
   Response:
   ```json
   {
     "success": true,
     "message": "Login successful",
     "token": "jwt_token_here",
     "user": {
       "id": "user_id",
       "name": "Sales Executive Name",
       "email": "email@example.com",
       "phone": "9876543210",
       "role": "sales_executive",
       "assignedRegions": ["Region1", "Region2"]
     }
   }
   ```

3. **Use Token**: Add to headers for protected routes
   ```
   Authorization: Bearer jwt_token_here
   ```

## 📝 Attendance Flow

### Check-in
POST `/api/se/attendance/check-in`

Headers:
```
Authorization: Bearer jwt_token_here
Content-Type: multipart/form-data
```

Body (form-data):
```
latitude: 19.0760
longitude: 72.8777
address: "Mumbai, Maharashtra"
selfie: [image file]
```

Response:
```json
{
  "success": true,
  "message": "Checked in successfully",
  "attendance": {
    "_id": "attendance_id",
    "user": "user_id",
    "date": "2025-11-12T00:00:00.000Z",
    "checkInTime": "2025-11-12T09:30:00.000Z",
    "checkInLocation": {
      "latitude": 19.0760,
      "longitude": 72.8777,
      "address": "Mumbai, Maharashtra"
    },
    "selfieImage": "/uploads/selfies/selfie-123456.jpg",
    "status": "present"
  }
}
```

### Check-out
POST `/api/se/attendance/check-out`

Headers:
```
Authorization: Bearer jwt_token_here
Content-Type: application/json
```

Body:
```json
{
  "latitude": 19.0760,
  "longitude": 72.8777,
  "address": "Mumbai, Maharashtra"
}
```

## 🗄️ Database Models

### Attendance Model
```javascript
{
  user: ObjectId (ref: 'User'),
  date: Date,
  checkInTime: Date,
  checkOutTime: Date,
  checkInLocation: { latitude, longitude, address },
  checkOutLocation: { latitude, longitude, address },
  selfieImage: String,
  status: String (enum: ['present', 'absent', 'half_day', 'late']),
  lateReason: String,
  remarks: String,
  verifiedBy: ObjectId (ref: 'User'),
  verifiedAt: Date,
  timestamps: true
}
```

## 📂 File Uploads

Uploaded files are stored in:
```
crm_backend/uploads/
├── selfies/      // Attendance selfies
├── receipts/     // Collection receipts
├── expenses/     // Expense bills
└── visits/       // Visit images
```

## 🔒 Security

- JWT authentication required for all protected routes
- Only users with role `sales_executive` can access
- File upload validation (images only, max 5MB)
- OTP expires after 5 minutes

## 🧪 Testing

### Test with cURL

1. **Login**:
```bash
curl -X POST http://localhost:5001/api/se/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"9876543210"}'
```

2. **Verify OTP**:
```bash
curl -X POST http://localhost:5001/api/se/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"9876543210","otp":"123456"}'
```

3. **Check-in**:
```bash
curl -X POST http://localhost:5001/api/se/attendance/check-in \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "latitude=19.0760" \
  -F "longitude=72.8777" \
  -F "address=Mumbai" \
  -F "selfie=@/path/to/image.jpg"
```

## 📊 Status

- ✅ Authentication (Login, OTP, JWT)
- ✅ Attendance (Check-in, Check-out, History)
- ⏳ Route Plan (Coming next)
- ⏳ Dealer Visit
- ⏳ Sales Order
- ⏳ Collection
- ⏳ Target
- ⏳ Expense
- ⏳ GPS Tracking

## 🐛 Troubleshooting

**Port already in use:**
```bash
# Change port in .env
SE_APP_PORT=5002
```

**MongoDB connection error:**
```bash
# Check if MongoDB is running
# Update MONGODB_URI in .env
```

**File upload error:**
```bash
# Check if uploads directory exists
# Check file permissions
```

## 📝 Next Steps

1. ✅ Setup backend structure
2. ✅ Implement authentication
3. ✅ Implement attendance module
4. ⏳ Create frontend attendance screens
5. ⏳ Test end-to-end flow
6. ⏳ Implement remaining modules

---

**Version**: 1.0.0  
**Last Updated**: 2025-11-12
