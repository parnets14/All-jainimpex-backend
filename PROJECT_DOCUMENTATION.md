# JainImpex CRM - Full Project Documentation

## Overview

This is a **multi-company CRM (Customer Relationship Management) system** built for three plumbing/sanitary ware distribution companies. The system covers the full business lifecycle: from product and inventory management, to sales orders, dealer management, finance, HRMS, and mobile apps for field executives.

---

## Three Companies Inside This System

The platform is a **single codebase serving three separate companies**, each with its own isolated MongoDB database.

| Company | Identifier | Database | Description |
|---|---|---|---|
| **Jain Impex** | `jain-impex` | `JainImpexCRM` | Sanitary Ware & Plumbing Solutions |
| **Ridhi Build Mart** | `ridhi` | `ridhi_crm` | Premium Plumbing Products |
| **Shree Jain Impex** | `shree-jain-impex` | `shreejain_crm` | Complete Sanitary Solutions |

Each company has its own login, its own data, and its own users — but they all run on the same backend server and frontend application. The company is selected at the login screen via `?company=<identifier>` in the URL.

---

## Project Structure

```
D:\Ravi\JainImpex\
├── jainimpex-frontend-all/        # React + Vite frontend (web CRM)
└── All-jainimpex-backend/
    └── crm_backend/               # Node.js + Express backend
```

---

## Backend — `crm_backend`

### Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js + Express 5** | HTTP server and REST API |
| **MongoDB + Mongoose** | Database (one DB per company) |
| **JWT (jsonwebtoken)** | Authentication tokens |
| **bcrypt** | Password hashing |
| **Redis / ioredis** | Caching and queue support |
| **BullMQ** | Background job queue (salary processing) |
| **Multer** | File uploads (images, documents) |
| **PDFKit** | PDF generation (invoices, salary slips) |
| **ExcelJS** | Excel export |
| **node-cron** | Scheduled jobs |
| **Nodemailer** | Email notifications |
| **face-api.js** | Face recognition for attendance |
| **Helmet + CORS** | Security middleware |
| **dotenv** | Environment configuration |

### Entry Point

`server.js` — starts the Express app, initializes all three company database connections, registers all routes, and starts the HTTP server on port `5000` (default).

### Multi-Database Architecture

`config/multiDatabase.js` manages separate MongoDB connections per company:

```
jain-impex      → JainImpexCRM database
ridhi           → ridhi_crm database
shree-jain-impex → shreejain_crm database
```

The `getCompanyConnection(company)` function returns the correct Mongoose connection. The `companyMiddleware` reads the company from the JWT token and attaches the right DB connection to every request.

### Directory Structure

```
crm_backend/
├── server.js                    # App entry point
├── config/
│   ├── db.js                    # Legacy single DB connection
│   ├── multiDatabase.js         # Multi-company DB connections
│   ├── permissions.js           # Role-based permission definitions
│   └── redis.js                 # Redis connection
├── controllers/                 # 65 controllers (main CRM)
├── models/                      # 60+ Mongoose models
├── routes/                      # 65+ route files
├── middleware/
│   ├── authMiddleware.js        # JWT verification
│   ├── companyMiddleware.js     # Company DB routing
│   ├── permissionMiddleware.js  # RBAC enforcement
│   ├── activityLogMiddleware.js # Audit logging
│   ├── rateLimit.js             # Rate limiting
│   └── upload.js                # Multer file upload config
├── services/                    # Business logic services
├── utils/                       # Utility helpers
├── cron/                        # Scheduled jobs
├── scripts/                     # One-time migration/seed scripts
├── validators/                  # Joi input validators
├── queue/                       # BullMQ salary queue
├── uploads/                     # Uploaded files (images, docs)
├── backups/                     # Data backups
├── app/                         # Dealer Mobile App backend
│   ├── controllers/
│   └── routes/
├── SalesExecutiveAppBackend/    # Sales Executive App backend
│   ├── controllers/
│   ├── models/
│   ├── middleware/
│   └── routes/
└── DeliveryExecutiveAppBackend/ # Delivery Executive App backend
    ├── controllers/
    ├── models/
    ├── middleware/
    └── routes/
```

---

## Backend Modules

### 1. Authentication & Users
- JWT-based login with company-scoped tokens
- OTP-based login for mobile apps (Sales Executive, Delivery Executive)
- Role-based access control (RBAC) with granular permissions
- Roles: `super_admin`, `admin`, `sub_admin`, `sales_manager`, `purchase_manager`, `finance_manager`, `hr_manager`, `sales_executive`, `warehouse_manager`, `inventory_manager`, `delivery_executive`

### 2. Master Management
- **Products** — categories, subcategories, brands, extended subcategories, pricing
- **Dealers** — dealer master, dealer types, dealer categories, dealer pricing, pricing history, pricing schedules
- **Suppliers** — supplier master
- **Regions & Routes** — geographic region and delivery route master
- **Warehouses** — warehouse master
- **Employees** — employee registration with face image capture

### 3. Sales & Purchase Management
- **Sales Orders** — full order lifecycle (draft → confirmed → dispatched → delivered)
- **Purchase Orders** — PO management with wishlist
- **GRN (Goods Received Note)** — stock receipt from suppliers
- **Dealer Invoices** — invoice generation with print templates
- **Supplier Invoices** — supplier billing
- **Dealer Payments** — payment recording and allocation
- **Supplier Payments** — outgoing payment management
- **Credit Notes / Debit Notes** — adjustments
- **Discount Mappings** — dealer-specific discount rules
- **Purchase Discounts** — supplier-side discount management
- **Points System** — dealer loyalty/purchasing points

### 4. Inventory & Warehouse Control
- **Stock Management** — real-time stock levels per warehouse
- **Stock Adjustments** — manual corrections (damaged, expired, etc.)
- **Stock Movement Service** — tracks all stock in/out events
- **Stock Arrival Service** — handles GRN-triggered stock updates
- **Cron: Stock Status Refresh** — auto-refreshes stock status every 3 hours

### 5. Finance & Accounts
- **Dealer Ledger** — full debit/credit ledger per dealer
- **Supplier Ledger** — full debit/credit ledger per supplier
- **Cheque Management** — cheque tracking and status
- **Voucher Entry** — cash/bank/journal vouchers
- **Journal Vouchers** — double-entry bookkeeping
- **Account Master** — chart of accounts
- **Bank Account Master** — company bank accounts
- **Payment Allocation** — link payments to specific invoices
- **Reconciliation** — bank reconciliation
- **Cash & Bank Book** — cash flow tracking
- **Balance Sheet** — assets, liabilities, equity reporting
- **Capital Management** — owner capital tracking
- **Loans** — loan management
- **Fixed Assets** — asset register

### 6. HRMS (Human Resource Management)
- **Employee Registration** — with face image for recognition
- **Attendance** — geo-tagged check-in/check-out with selfie verification
- **Face Recognition** — face-api.js powered biometric attendance
- **Salary Processing** — salary slip generation via BullMQ queue
- **Shift Management** — shift scheduling
- **Overtime Management** — overtime tracking
- **Daily Wage Management** — daily wage workers
- **Leave Management** — leave records

### 7. Reports & Analytics
- **Bill-wise Profit** — profit per invoice
- **Gross Margin Analysis** — category and product level margins
- **Price Deviation Report** — sale vs purchase price comparison
- **Dealer Performance** — dealer-wise sales performance
- **Profit Analysis** — overall profit reporting
- **Margin Analysis** — margin breakdown
- **Sales Analytics** — sales trends and analytics
- **Activity Logs** — full audit trail of user actions
- **Download Logs** — tracks who downloaded what

### 8. Expense Management
- **Expense Categories & Types** — configurable expense heads
- **Expense Entry** — expense recording with document upload
- **Claim Management** — expense claim submission and approval
- **Document Tracker** — expense document management

### 9. Supplier Incentive Management
- Supplier scheme analysis
- Purchase entry with auto-calculation
- Scheme entry and claim submission
- Reconciliation tracker

### 10. Support & Communication
- **Support Chat** — internal chat system between admin and dealers
- **Notifications** — in-app notification system

### 11. Scheduled Jobs (Cron)
| Job | Schedule | Purpose |
|---|---|---|
| `attendanceCron` | Daily | Auto-mark absent for no check-in |
| `discountExpiration` | Daily | Expire outdated discount mappings |
| `logCleanup` | Weekly | Clean old activity logs |
| `scheduledPricing` | Configurable | Apply scheduled dealer price changes |
| `stockStatusRefresh` | Every 3 hours | Refresh stock availability status |

---

## Three App Backends (Inside crm_backend)

### A. Dealer Mobile App (`/api/app/*`)
A separate API layer for the dealer-facing mobile app.

| Endpoint Prefix | Module |
|---|---|
| `/api/app/auth` | Dealer authentication |
| `/api/app/products` | Product catalog |
| `/api/app/orders` | Place and track orders |
| `/api/app/invoices` | View invoices |
| `/api/app/ledger` | View account ledger |
| `/api/app/payments` | Payment history |
| `/api/app/dashboard` | Dealer dashboard |
| `/api/app/points` | Loyalty points |
| `/api/app/support/chat` | Support chat |
| `/api/app/dealer` | Dealer profile |
| `/api/app/credit-notes` | Credit notes |

### B. Sales Executive App (`/api/se/*`)
Mobile app backend for field sales executives.

| Endpoint Prefix | Module |
|---|---|
| `/api/se/auth` | OTP-based login |
| `/api/se/attendance` | GPS + selfie check-in/out |
| `/api/se/route-plan` | Daily route planning |
| `/api/se/dealer-insights` | Dealer visit insights |
| `/api/se/dealers` | Dealer information |
| `/api/se/sales-orders` | Create/view sales orders |
| `/api/se/collections` | Payment collection |
| `/api/se/targets` | Sales targets |
| `/api/se/expenses` | Expense submission |

### C. Delivery Executive App (`/api/de/*`)
Mobile app backend for delivery executives.

| Endpoint Prefix | Module |
|---|---|
| `/api/de/auth` | OTP-based login |
| `/api/de/assignments` | Delivery assignments |
| `/api/de/deliveries` | Today's deliveries + history |
| `/api/de/payments` | Cash/cheque collection |
| `/api/de/route-plan` | Optimized delivery route |
| `/api/de/delivery-history` | Past deliveries |
| `/api/de/notifications` | Push notifications |
| `/api/admin/deliveries` | Admin delivery management |

---

## Frontend — `jainimpex-frontend-all`

### Tech Stack

| Technology | Purpose |
|---|---|
| **React 19 + Vite 7** | UI framework and build tool |
| **React Router DOM 7** | Client-side routing |
| **Tailwind CSS 3** | Utility-first styling |
| **MUI (Material UI 7)** | Component library |
| **Ant Design 5** | Additional UI components |
| **Axios** | HTTP client |
| **React Query (TanStack)** | Server state management |
| **Recharts** | Charts and graphs |
| **Framer Motion** | Animations |
| **React Hook Form + Yup** | Form handling and validation |
| **jsPDF + jspdf-autotable** | PDF generation in browser |
| **ExcelJS / xlsx** | Excel export |
| **face-api.js** | Face recognition (attendance) |
| **React Webcam** | Camera access for selfies |
| **Lottie React** | Lottie animations |
| **React Toastify** | Toast notifications |
| **date-fns / moment** | Date utilities |

### Frontend Directory Structure

```
src/
├── App.jsx                        # Root component with all routes
├── main.jsx                       # React entry point
├── Context/
│   └── AuthContext.jsx            # Global auth state (company, user, token)
├── Components/
│   ├── Login.jsx                  # Login page (company-aware)
│   ├── CompanySelection.jsx       # Company picker (3 companies)
│   ├── CRMDashboard.jsx           # Main dashboard
│   ├── CRMSidebar.jsx             # Navigation sidebar
│   ├── Layout.jsx                 # App shell layout
│   ├── ProtectedRoute.jsx         # Auth guard
│   ├── UserManagement.jsx         # User/role management
│   ├── FaceCapture.jsx            # Face image capture
│   ├── FaceRecognition.jsx        # Face recognition attendance
│   ├── Dashboard/                 # Dashboard widgets
│   ├── MasterManagement/          # Product, dealer, supplier masters
│   ├── Inventory&Warehouse/       # Stock management UI
│   └── SupplierIncentiveManagement/
├── Sales&Purchase/
│   ├── SalesOrderDashboard.jsx
│   ├── DealerInvoice.jsx
│   ├── DealerPayment.jsx
│   ├── PurchaseOrderManagement.jsx
│   ├── GRNEntryModule.jsx
│   ├── SupplierInvoice.jsx
│   ├── SupplierPaymentManagement.jsx
│   ├── CreditNotePage.jsx
│   ├── DebitNote.jsx
│   ├── DealerDiscountManagement.jsx
│   └── PurchasingPoints.jsx
├── Finance&Accounts/
│   ├── DealerLedger.jsx
│   ├── SupplierLedger.jsx
│   ├── ChequeManagement.jsx
│   ├── VoucherEntry.jsx
│   ├── PaymentAllocation.jsx
│   ├── Reconciliation.jsx
│   ├── CashBankBook.jsx
│   ├── AccountMaster.jsx
│   ├── BankAccountMaster.jsx
│   ├── CapitalManagement.jsx
│   └── CreditDays.jsx
├── HRMS/
│   ├── EmployeeRegistrationForm.jsx
│   ├── AttendancePage.jsx
│   ├── AttendanceMasterPage.jsx
│   ├── SalaryPage.jsx
│   ├── GenerateSalarySlip.jsx
│   ├── ShiftPage.jsx
│   ├── OvertimePage.jsx
│   └── DailyWagePage.jsx
├── ExpensesReports/
│   ├── BalanceSheet.jsx
│   ├── BillWiseProfit.jsx
│   ├── GrossMarginAnalysis.jsx
│   ├── PriceDeviationReport.jsx
│   ├── DealerPerformance.jsx
│   ├── ActivityLogs.jsx
│   └── DownloadLogs.jsx
├── ExpenseManagement/
│   ├── ExpenseHeadMaster.jsx
│   ├── ClaimApproval.jsx
│   └── DocumentTracker.jsx
├── SalesExecutiveApp/
│   ├── AttendanceViewer.jsx
│   ├── CollectionViewer.jsx
│   ├── DealerInsightsManagement.jsx
│   ├── ProductRecommendations.jsx
│   ├── RoutePlanManagement.jsx
│   └── TargetManagement.jsx
├── DeliveryExecutiveApp/
│   ├── DeliveryAssignment.jsx
│   ├── MyDeliveries.jsx
│   ├── DeliveryMonitoring.jsx
│   ├── DeliveryHistory.jsx
│   ├── RoutePlan.jsx
│   ├── RouteOptimization.jsx
│   ├── LiveTracking.jsx
│   ├── LiveTrackingMap.jsx
│   └── Collection.jsx
├── Support/
│   └── SupportChat.jsx
├── services/
│   ├── api.js                     # Axios instance with company header
│   ├── balanceSheetService.js
│   ├── cacheService.js
│   ├── expenseService.js
│   └── schemeService.js
└── utils/
    ├── creditCheck.js
    └── downloadLogger.js
```

### Company Selection & Login Flow

1. User visits the app → lands on **CompanySelection** page
2. Selects one of three companies (Jain Impex, Ridhi Build Mart, Shree Jain Impex)
3. Redirected to `/login?company=<identifier>`
4. Logs in with credentials → JWT token stored with company context
5. All subsequent API calls include the company identifier so the backend routes to the correct database

### Role-Based Access Control (Frontend)

The `ProtectedRoute` component checks permissions from `AuthContext`. The sidebar and all pages are conditionally rendered based on the user's assigned permissions. Permissions are granular (e.g., `products.view`, `products.create`, `invoices.approve`).

---

## Key Data Models

| Model | Description |
|---|---|
| `User` | System users with roles and permissions |
| `Employee` | Employee records with face image |
| `Dealer` | Dealer master with credit limit, pricing tier |
| `DealerInvoice` | Sales invoices to dealers |
| `DealerLedger` | Dealer account ledger entries |
| `DealerPayment` | Payments received from dealers |
| `DealerPricing` | Custom pricing per dealer |
| `Supplier` | Supplier master |
| `SupplierInvoice` | Purchase invoices from suppliers |
| `SupplierLedger` | Supplier account ledger |
| `SupplierPayment` | Payments made to suppliers |
| `Product` | Product catalog with pricing |
| `Category / Subcategory / Brand` | Product hierarchy |
| `SalesOrder` | Sales order with line items |
| `PurchaseOrder` | Purchase order |
| `GRN` | Goods received note |
| `Stock` | Current stock levels per product/warehouse |
| `StockAdjustment` | Manual stock corrections |
| `Warehouse` | Warehouse master |
| `CreditNote / DebitNote` | Financial adjustments |
| `Cheque` | Cheque tracking |
| `Voucher / JournalVoucher` | Accounting entries |
| `AccountMaster` | Chart of accounts |
| `BankAccount` | Company bank accounts |
| `PaymentAllocation` | Invoice-payment linking |
| `Attendance` | Employee attendance records |
| `SalarySlip` | Generated salary slips |
| `Expense` | Expense records |
| `Claim` | Expense claims |
| `Notification` | In-app notifications |
| `ChatConversation / ChatMessage` | Support chat |
| `ActivityLog` | Audit trail |
| `DownloadLog` | Download tracking |
| `Points` | Dealer loyalty points |
| `DiscountMapping` | Dealer-specific discounts |
| `Region / Route` | Geographic masters |
| `DeliveryAssignment` | Delivery executive assignments |
| `DeliveryPayment` | Delivery-time payment collections |
| `DeliveryRoute` | Optimized delivery routes |

---

## Environment Variables (Backend)

Key variables in `crm_backend/.env`:

| Variable | Purpose |
|---|---|
| `MONGO_URI` | Legacy single MongoDB URI |
| `MONGO_BASE_URI` | Base URI for multi-company connections |
| `MONGO_DB_JAINIMPEX` | DB name for Jain Impex |
| `MONGO_DB_RIDHI` | DB name for Ridhi |
| `MONGO_DB_SHREEJAIN` | DB name for Shree Jain Impex |
| `MONGO_OPTIONS` | MongoDB connection options |
| `JWT_SECRET` | JWT signing secret |
| `PORT` | Server port (default 5000) |
| `NODE_ENV` | Environment (development/production) |
| `USE_CLUSTER` | Enable Node.js cluster mode |

---

## Deployment

- **Frontend**: Deployed on **Netlify** (`https://jainimpex.netlify.app`)
- **Backend**: Deployed on **Render.com** (free tier, single process mode)
- **Database**: **MongoDB Atlas** (cloud-hosted, separate databases per company)
- **Cluster Mode**: Disabled on free Render tier to avoid memory issues; enabled via `USE_CLUSTER=true` in production

---

## API Base URLs

| Environment | URL |
|---|---|
| Local development | `http://localhost:5000` |
| Production | Render.com hosted URL |

### CORS Allowed Origins
- `http://localhost:5173` (local web dev)
- `https://jainimpex.netlify.app` (production frontend)
- `http://localhost:3000` / `http://localhost:8081` (local mobile dev)
- `exp://localhost:19000` (Expo dev)
- Mobile apps (no origin header — always allowed)

---

## Summary

This is a **full-stack, multi-tenant CRM platform** for three plumbing/sanitary ware distribution companies. It covers:

- **3 companies** sharing one codebase, each with isolated data
- **Web CRM** for admin/management (React + Vite frontend)
- **Dealer App** for dealers to place orders and view accounts
- **Sales Executive App** for field sales staff (attendance, route plans, orders, collections)
- **Delivery Executive App** for delivery staff (assignments, deliveries, collections, routes)
- **Full accounting** (ledgers, vouchers, balance sheet, reconciliation)
- **HRMS** (employees, attendance with face recognition, salary, shifts)
- **Inventory** (stock, GRN, adjustments, warehouses)
- **Reports** (profit, margins, performance, audit logs)
