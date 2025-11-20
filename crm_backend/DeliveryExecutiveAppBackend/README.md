# Delivery Executive App Backend

## Overview
Backend API for the Delivery Executive mobile application. Handles delivery assignments, order deliveries, payment collections, and route management.

## API Base URL
`/api/de` (Delivery Executive)

## Features
1. **Authentication** - OTP-based login for delivery executives
2. **Delivery Management** - View and manage assigned deliveries
3. **Order Delivery** - Complete deliveries with OTP verification and POD
4. **Payment Collection** - Record cash/cheque collections
5. **Route Optimization** - Optimized delivery routes
6. **Dashboard** - Performance metrics and statistics

## Folder Structure
```
DeliveryExecutiveAppBackend/
├── controllers/
│   ├── authController.js
│   ├── deliveryController.js
│   ├── paymentController.js
│   └── dashboardController.js
├── models/
│   ├── DeliveryAssignment.js
│   ├── DeliveryPayment.js
│   └── DeliveryRoute.js
├── routes/
│   ├── authRoutes.js
│   ├── deliveryRoutes.js
│   ├── paymentRoutes.js
│   └── dashboardRoutes.js
├── middleware/
│   ├── protect.js
│   └── upload.js
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/de/auth/login` - Send OTP to delivery executive
- `POST /api/de/auth/verify-otp` - Verify OTP and login
- `GET /api/de/auth/me` - Get current user profile
- `POST /api/de/auth/logout` - Logout

### Deliveries
- `GET /api/de/deliveries/today` - Get today's assigned deliveries
- `GET /api/de/deliveries/:id` - Get delivery details
- `POST /api/de/deliveries/:id/start` - Start delivery (in transit)
- `POST /api/de/deliveries/:id/verify-otp` - Verify dealer OTP
- `POST /api/de/deliveries/:id/complete` - Complete delivery with POD
- `POST /api/de/deliveries/:id/fail` - Mark delivery as failed
- `POST /api/de/deliveries/:id/reschedule` - Reschedule delivery
- `GET /api/de/deliveries/history` - Get delivery history

### Payments
- `POST /api/de/payments` - Record payment collection
- `GET /api/de/payments/today` - Get today's collections
- `GET /api/de/payments/history` - Get payment history

### Route
- `GET /api/de/route/today` - Get today's optimized route
- `POST /api/de/route/start` - Start route
- `POST /api/de/route/end` - End route

### Dashboard
- `GET /api/de/dashboard/stats` - Get dashboard statistics

## Database Models

### DeliveryAssignment
Tracks delivery assignments for delivery executives.

### DeliveryPayment
Records payment collections (cash/cheque) during deliveries.

### DeliveryRoute
Manages optimized delivery routes for the day.

## Authentication
- JWT-based authentication
- OTP verification via SMS
- Token stored in mobile app

## File Uploads
- POD (Proof of Delivery) images
- Receipt images
- Cheque images

## Integration
- Integrates with existing SalesOrder model
- Uses existing Dealer model
- Links to User model (delivery_executive role)

---
Created: ${new Date().toISOString()}
