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
import employeeRoutes from "./routes/employeeRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import "./cron/attendanceCron.js";
import categoryRoutes from "./routes/categoryRoutes.js"; // Add this
import subcategoryRoutes from "./routes/subcategoryRoutes.js"; // Add this
import brandRoutes from "./routes/brandRoutes.js"; // Add this
import salaryRoutes from "./routes/salaryRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import regionRoutes from "./routes/regionRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";
import referenceRoutes from "./routes/referenceRoutes.js";
import discountMappingRoutes from "./routes/discountMappingRoutes.js";
import pointsRoutes from "./routes/pointsRoutes.js";

dotenv.config();

const numCPUs = cpus().length;

if (cluster.isPrimary) {
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
  // Worker process
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
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    })
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(cookieParser());
  app.use(helmet());

  // Apply general rate limiting to all routes
  app.use(generalLimiter);

  // Optional: Logging middleware
  app.use((req, res, next) => {
    console.log(`[Worker ${process.pid}] ${req.method} ${req.url}`);
    next();
  });

  // Routes
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
  app.use("/api/regions", regionRoutes);
  app.use("/api/suppliers", supplierRoutes);
  app.use("/api/reference", referenceRoutes);
  app.use("/api/discount-mappings", discountMappingRoutes);
  app.use("/api/points", pointsRoutes);

  // Serve uploaded files statically
  app.use("/uploads", express.static("uploads"));

  // Serve public files (logo, etc.)
  app.use("/public", express.static("public"));

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
  app.listen(PORT, () => {
    console.log(`[Worker ${process.pid}] 🎯 Server running on port ${PORT}`);
  });
}
