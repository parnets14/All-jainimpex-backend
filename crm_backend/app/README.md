# Dealer App Backend

This folder contains the backend routes and controllers specifically for the Dealer Mobile App.

## Structure

```
app/
├── routes/          # Dealer app specific routes
├── controllers/     # Dealer app specific controllers
└── services/        # Dealer app specific services (if needed)
```

## API Endpoints

All dealer app endpoints are prefixed with `/api/app/`:

### Authentication
- `POST /api/app/auth/login` - Login with email/password
- `POST /api/app/auth/send-otp` - Send OTP to dealer phone
- `POST /api/app/auth/verify-otp` - Verify OTP and login
- `GET /api/app/auth/me` - Get dealer profile
- `POST /api/app/auth/logout` - Logout

### Products
- `GET /api/app/products` - Get products for dealer (with dealer pricing)
- `GET /api/app/products/:id` - Get product details
- `GET /api/app/products/category/:categoryId` - Get products by category
- `GET /api/app/products/brand/:brandId` - Get products by brand

### Orders
- `GET /api/app/orders` - Get dealer's orders
- `GET /api/app/orders/:id` - Get order details
- `POST /api/app/orders` - Create new order
- `PATCH /api/app/orders/:id/cancel` - Cancel order
- `GET /api/app/orders/history` - Get order history

### Invoices
- `GET /api/app/invoices` - Get dealer's invoices
- `GET /api/app/invoices/stats` - Get invoice statistics
- `GET /api/app/invoices/:id` - Get invoice details
- `GET /api/app/invoices/:id/download` - Download invoice PDF

### Ledger
- `GET /api/app/ledger` - Get dealer's ledger entries
- `GET /api/app/ledger/statement` - Get ledger statement (with date range)
- `GET /api/app/ledger/outstanding` - Get outstanding amount summary
- `GET /api/app/ledger/ageing` - Get ageing buckets

### Dashboard
- `GET /api/app/dashboard/stats` - Get dashboard overview stats
- `GET /api/app/dashboard/recent-orders` - Get recent orders
- `GET /api/app/dashboard/recent-invoices` - Get recent invoices
- `GET /api/app/dashboard/notifications` - Get notifications

## Authentication

All routes (except login/OTP) require authentication via JWT token. The token should be sent in the Authorization header:
```
Authorization: Bearer <token>
```

## Dealer Identification

Dealers are identified by matching the User model's `username` field with the Dealer model's `code` field. When a dealer logs in, their user account must have:
- `role: 'Dealer'`
- `username: <dealer_code>` (matches Dealer.code)

## Shared Resources

The dealer app uses shared resources from the parent `crm_backend` directory:
- Models: `../../models/`
- Middleware: `../../middleware/`
- Utils: `../../utils/`
- Config: `../../config/`

This ensures data consistency between the web CRM and mobile app.



