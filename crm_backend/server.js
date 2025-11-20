import cluster from "cluster";
import { cpus } from "os";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js"; // Add this import
import dealertypeRoutes from "./routes/dealertypeRoutes.js";
import dealercategoryRouter from "./routes/dealerCategoryRoutes.js";
import dealerRoutes from "./routes/dealerRoutes.js";
import expenseCategoryRoutes from "./routes/expenseCategoryRoutes.js";
import expenseTypeRoutes from "./routes/expenseTypeRoutes.js";
import claimTypeRoutes from "./routes/claimTypeRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import claimRoutes from "./routes/claimRoutes.js";

import { protect } from "./middleware/authMiddleware.js";
import {
  generalLimiter,
  authLimiter,
  uploadLimiter,
  strictLimiter,
} from "./middleware/rateLimit.js";
import fs from "fs";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import employeeRoutes from "./routes/employeeRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import "./cron/attendanceCron.js";
import categoryRoutes from "./routes/categoryRoutes.js"; // Add this
import subcategoryRoutes from "./routes/subcategoryRoutes.js"; // Add this
import brandRoutes from "./routes/brandRoutes.js"; // Add this
import salaryRoutes from "./routes/salaryRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import dealerPricingRoutes from "./routes/dealerPricingRoutes.js";
import regionRoutes from "./routes/regionRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";
import referenceRoutes from "./routes/referenceRoutes.js";
import discountMappingRoutes from "./routes/discountMappingRoutes.js";
import pointsRoutes from "./routes/pointsRoutes.js";
import warehouseRoutes from "./routes/warehouseRoutes.js";
import purchaseOrderRoutes from "./routes/purchaseOrderRoutes.js";
import grnRoutes from './routes/grnRoutes.js';
import stockRoutes from './routes/stockRoutes.js';
import salesOrderRoutes from './routes/salesOrderRoutes.js';
import chequeRoutes from './routes/chequeRoutes.js';
import dealerInvoiceRoutes from './routes/dealerInvoiceRoutes.js';
import supplierInvoiceRoutes from './routes/supplierInvoiceRoutes.js';
import supplierPaymentRoutes from './routes/supplierPaymentRoutes.js';
import debitNoteRoutes from './routes/debitNoteRoutes.js';
import creditNoteRoutes from './routes/creditNoteRoutes.js';
import dealerPaymentRoutes from './routes/dealerPaymentRoutes.js';
import dealerLedgerRoutes from './routes/dealerLedgerRoutes.js';
import supplierLedgerRoutes from './routes/supplierLedgerRoutes.js';
import reconciliationRoutes from './routes/reconciliationRoutes.js';
import profitAnalysisRoutes from './routes/profitAnalysisRoutes.js';
import marginAnalysisRoutes from './routes/marginAnalysisRoutes.js';
import dealerPerformanceRoutes from './routes/dealerPerformanceRoutes.js';
import productRecommendationRoutes from './routes/productRecommendationRoutes.js';
import activityLogRoutes from './routes/activityLogRoutes.js';
import downloadLogRoutes from './routes/downloadLogRoutes.js';
import priceDeviationRoutes from './routes/priceDeviationRoutes.js';
import sampleDataRoutes from './routes/sampleDataRoutes.js';
import testRoutes from './routes/testRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import collectionRoutes from './routes/collectionRoutes.js';

// Dealer App Routes
import appAuthRoutes from './app/routes/authRoutes.js';
import appProductRoutes from './app/routes/productRoutes.js';
import appOrderRoutes from './app/routes/orderRoutes.js';
import appInvoiceRoutes from './app/routes/invoiceRoutes.js';
import appLedgerRoutes from './app/routes/ledgerRoutes.js';
import appPaymentRoutes from './app/routes/paymentRoutes.js';
import appDashboardRoutes from './app/routes/dashboardRoutes.js';
import appPointsRoutes from './app/routes/pointsRoutes.js';
import appChatRoutes from './app/routes/chatRoutes.js';
import appDealerRoutes from './app/routes/dealerRoutes.js';

// Sales Executive App Routes
import seAuthRoutes from './SalesExecutiveAppBackend/routes/authRoutes.js';
import seAttendanceRoutes from './SalesExecutiveAppBackend/routes/attendanceRoutes.js';
import seRoutePlanRoutes from './SalesExecutiveAppBackend/routes/routePlanRoutes.js';
import seDealerInsightsRoutes from './SalesExecutiveAppBackend/routes/dealerInsightsRoutes.js';
import seDealerRoutes from './SalesExecutiveAppBackend/routes/dealerRoutes.js';
import seSalesOrderRoutes from './SalesExecutiveAppBackend/routes/salesOrderRoutes.js';
import seCollectionRoutes from './SalesExecutiveAppBackend/routes/collectionRoutes.js';
import seTargetRoutes from './SalesExecutiveAppBackend/routes/targetRoutes.js';
import seExpenseRoutes from './SalesExecutiveAppBackend/routes/expenseRoutes.js';

// Delivery Executive App Routes
import deAuthRoutes from './DeliveryExecutiveAppBackend/routes/authRoutes.js';
import deAssignmentRoutes from './DeliveryExecutiveAppBackend/routes/assignmentRoutes.js';
import dePaymentRoutes from './DeliveryExecutiveAppBackend/routes/paymentRoutes.js';
import deRoutePlanRoutes from './DeliveryExecutiveAppBackend/routes/routePlanRoutes.js';
import deDeliveryHistoryRoutes from './DeliveryExecutiveAppBackend/routes/deliveryHistoryRoutes.js';
import deDeliveriesRoutes from './DeliveryExecutiveAppBackend/routes/deliveriesRoutes.js';
import deNotificationRoutes from './DeliveryExecutiveAppBackend/routes/notificationRoutes.js';

dotenv.config();

const numCPUs = cpus().length;

// Disable cluster mode for free Render.com tier to avoid memory issues
const useCluster = process.env.NODE_ENV === 'production' && process.env.USE_CLUSTER === 'true';

if (useCluster && cluster.isPrimary) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`🚀 Primary process ${process.pid} is running`);
  console.log(`💻 CPU Cores: ${numCPUs}`);
  console.log(`🔄 Forking ${numCPUs} worker processes...`);
  console.log(`${"=".repeat(50)}\n`);

  // Fork workers for each CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Listen for dying workers and restart
  cluster.on("exit", (worker, code, signal) => {
    console.log(`\n⚠️  Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

  // Track when workers come online
  cluster.on("online", (worker) => {
    console.log(`✅ Worker ${worker.process.pid} is online`);
  });
} else {
  // Single process mode (for free tier) or worker process
  console.log(`🚀 Running in single process mode (PID: ${process.pid})`);
  const app = express();

  // Connect to MongoDB (each worker connects)
  connectDB();

  // Create uploads directory if it doesn't exist
  const uploadsDir = "./uploads";
  const facesDir = "./uploads/faces";

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  if (!fs.existsSync(facesDir)) {
    fs.mkdirSync(facesDir, { recursive: true });
  }

  // Middleware


app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "http://localhost:5173",             // local web dev
        "https://jainimpex.netlify.app",     // ✅ correct Netlify domain
        "https://jainimpex.netlify.app/",    // ✅ with trailing slash
        "http://localhost:3000",             // local dealer app (React Native Metro)
        "http://localhost:8081",             // local dealer app (React Native alternative)
        "exp://localhost:19000",             // Expo dev
      ];
      
      console.log('🌐 CORS Origin Check:', { origin, allowedOrigins });
      
      // Allow requests with no origin (mobile apps, Postman, etc.)
      // Mobile apps typically don't send origin header, so allow null
      if (!origin || allowedOrigins.includes(origin)) {
        console.log('✅ CORS: Origin allowed', { origin: origin || 'null (mobile app)' });
        callback(null, true);
      } else {
        console.log('❌ CORS: Origin blocked', { origin });
        // For development, allow all origins to avoid issues
        if (process.env.NODE_ENV !== 'production') {
          console.log('⚠️ Development mode: Allowing origin anyway');
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    // Allow preflight requests
    preflightContinue: false,
    optionsSuccessStatus: 204
  })
);

// ✅ Preflight requests are handled by the CORS middleware above

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
// Configure helmet to allow images and static files
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Optional: Logging middleware
app.use((req, res, next) => {
  console.log(`[Worker ${process.pid}] ${req.method} ${req.url}`);
  next();
});

// Routes
// Health check route
app.get("/api/", (req, res) => {
  res.json({
    success: true,
    message: "CRM API is running! 🚀",
    worker: process.pid,
    features: [
      "Employee Management ✅",
      "Face Recognition ✅", 
      "Attendance Tracking ✅",
      "JWT Authentication ✅",
      "File Uploads ✅"
    ],
    availableRoutes: [
      "GET  /api/categories",
      "POST /api/categories",
      "GET  /api/categories/:categoryId/subcategories",
      "POST /api/categories/:categoryId/subcategories",
      "GET  /api/subcategories/:subcategoryId/brands",
      "POST /api/subcategories/:subcategoryId/brands",
      "GET  /api/categories/stats",
      "GET  /api/products",
      "POST /api/products",
      "GET  /api/products/:id",
      "PUT  /api/products/:id",
      "DELETE /api/products/:id",
      "GET  /api/products/stats",
      "GET  /api/sales-orders",
      "POST /api/sales-orders",
      "GET  /api/sales-orders/:id",
      "PUT  /api/sales-orders/:id",
      "DELETE /api/sales-orders/:id",
      "GET  /api/sales-orders/stats/summary",
      "GET  /api/sales-orders/overdue",
      "GET  /api/cheques",
      "POST /api/cheques",
      "GET  /api/cheques/:id",
      "PUT  /api/cheques/:id",
      "DELETE /api/cheques/:id",
      "GET  /api/cheques/stats/summary",
      "PATCH /api/cheques/:id/status"
    ]
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dealer-types", dealertypeRoutes);
app.use("/api/dealer-categories", dealercategoryRouter);
app.use("/api/dealers", dealerRoutes);
app.use("/api/expense-categories", expenseCategoryRoutes);
app.use("/api/expense-types", expenseTypeRoutes);
app.use("/api/claim-types", claimTypeRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/claims", claimRoutes);

app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subcategoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/salary", salaryRoutes);
app.use("/api/products", productRoutes);
// Register dealer pricing routes
console.log('🔧 Registering dealer pricing routes...');
app.use("/api/dealer-pricing", dealerPricingRoutes);
console.log('✅ Dealer pricing routes registered at /api/dealer-pricing');
app.use("/api/regions", regionRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/reference", referenceRoutes);
app.use("/api/discount-mappings", discountMappingRoutes);
app.use("/api/points", pointsRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use('/api/grn', grnRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sales-orders', salesOrderRoutes);
app.use('/api/cheques', chequeRoutes);
app.use('/api/dealer-invoices', dealerInvoiceRoutes);
app.use('/api/supplier-invoices', supplierInvoiceRoutes);
app.use('/api/supplier-payments', supplierPaymentRoutes);
app.use('/api/dealer-payments', dealerPaymentRoutes);
app.use('/api/debit-notes', debitNoteRoutes);
app.use('/api/credit-notes', creditNoteRoutes);
app.use('/api/dealer-ledger', dealerLedgerRoutes);
app.use('/api/supplier-ledger', supplierLedgerRoutes);
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/profit-analysis', profitAnalysisRoutes);
app.use('/api/margin-analysis', marginAnalysisRoutes);
app.use('/api/dealer-performance', dealerPerformanceRoutes);
app.use('/api/product-recommendations', productRecommendationRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/download-logs', downloadLogRoutes);
app.use('/api/reports', priceDeviationRoutes);
app.use('/api/sample-data', sampleDataRoutes);
app.use('/api/test', testRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/support/chat', chatRoutes);
app.use('/api/collections', collectionRoutes);

// Dealer App Routes (separate API prefix for app)
app.use('/api/app/auth', appAuthRoutes);
app.use('/api/app/products', appProductRoutes);
app.use('/api/app/orders', appOrderRoutes);
app.use('/api/app/invoices', appInvoiceRoutes);
app.use('/api/app/ledger', appLedgerRoutes);
app.use('/api/app/payments', appPaymentRoutes);
app.use('/api/app/dashboard', appDashboardRoutes);
app.use('/api/app/points', appPointsRoutes);
app.use('/api/app/support/chat', appChatRoutes);
app.use('/api/app/dealer', appDealerRoutes);

// Sales Executive App Routes (separate API prefix for SE app)
console.log('🔧 Registering Sales Executive App routes...');

// Add logging middleware for SE routes
app.use('/api/se', (req, res, next) => {
  console.log(`📍 SE Route Hit: ${req.method} ${req.url}`);
  next();
});

app.use('/api/se/auth', seAuthRoutes);
app.use('/api/se/attendance', seAttendanceRoutes);
app.use('/api/se/route-plan', seRoutePlanRoutes);
app.use('/api/se/dealer-insights', seDealerInsightsRoutes);
app.use('/api/se/dealers', seDealerRoutes);
app.use('/api/se/sales-orders', seSalesOrderRoutes);
app.use('/api/se/collections', seCollectionRoutes);
app.use('/api/se/targets', seTargetRoutes);
app.use('/api/se/expenses', seExpenseRoutes);
console.log('✅ Sales Executive App routes registered at /api/se/*');

// Delivery Executive App Routes (separate API prefix for DE app)
console.log('🔧 Registering Delivery Executive App routes...');
app.use('/api/de/auth', deAuthRoutes);
app.use('/api/de/assignments', deAssignmentRoutes);
app.use('/api/de/payments', dePaymentRoutes);
app.use('/api/de/route-plan', deRoutePlanRoutes);
app.use('/api/de/delivery-history', deDeliveryHistoryRoutes);
app.use('/api/de/notifications', deNotificationRoutes);
// Mobile app compatibility routes (using different paths)
app.use('/api/de/route', deRoutePlanRoutes); // Mobile app uses /route instead of /route-plan
app.use('/api/de/deliveries', deDeliveriesRoutes); // Mobile app uses /deliveries/today
app.use('/api/de/deliveries', deDeliveryHistoryRoutes); // Mobile app uses /deliveries/history
console.log('✅ Delivery Executive App routes registered at /api/de/*');

// Serve uploaded files statically - use absolute path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve uploaded files statically with proper headers
app.use("/uploads", express.static(join(__dirname, "uploads"), {
  setHeaders: (res, path) => {
    // Set CORS headers for images
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
  }
}));

// Serve public files (logo, etc.)
app.use("/public", express.static(join(__dirname, "public")));

  // Root route
  app.get("/", (req, res) => {
    res.json({
      success: true,
      message: "CRM API is running! 🚀",
      worker: process.pid,
      features: [
        "Employee Management ✅",
        "Face Recognition ✅",
        "Attendance Tracking ✅",
        "JWT Authentication ✅",
        "File Uploads ✅",
      ],
      availableRoutes: [
        "GET  /api/categories",
        "POST /api/categories",
        "GET  /api/categories/:categoryId/subcategories",
        "POST /api/categories/:categoryId/subcategories",
        "GET  /api/subcategories/:subcategoryId/brands",
        "POST /api/subcategories/:subcategoryId/brands",
        "GET  /api/categories/stats",
        "GET  /api/products",
        "POST /api/products",
        "GET  /api/products/:id",
        "PUT  /api/products/:id",
        "DELETE /api/products/:id",
        "GET  /api/products/stats",
        "GET  /api/sales-orders",
        "POST /api/sales-orders",
        "GET  /api/sales-orders/:id",
        "PUT  /api/sales-orders/:id",
        "DELETE /api/sales-orders/:id",
        "GET  /api/sales-orders/stats/summary",
        "GET  /api/sales-orders/overdue",
        "GET  /api/cheques",
        "POST /api/cheques",
        "GET  /api/cheques/:id",
        "PUT  /api/cheques/:id",
        "DELETE /api/cheques/:id",
        "GET  /api/cheques/stats/summary",
        "PATCH /api/cheques/:id/status",
      ],
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route ${req.method} ${req.originalUrl} not found`,
      worker: process.pid,
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error(`[Worker ${process.pid}] Error:`, err.message);
    res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      worker: process.pid,
    });
  });

  // Direct processing mode - no queue system needed
  console.log("📝 Using direct salary processing (no queue system)");

  // Start server
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Worker ${process.pid}] 🎯 Server running on port ${PORT}`);
  });
}
