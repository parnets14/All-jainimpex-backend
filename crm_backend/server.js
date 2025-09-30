// // server.js (ES Module version)

// import express from "express";
// import dotenv from "dotenv";
// import connectDB from "./config/db.js";

// dotenv.config();
// connectDB();

// const app = express();

// // Middleware
// app.use(express.json());

// // Sample route
// app.get("/", (req, res) => {
//   res.send("API is running...");
// });

// // Start server
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));





// server.js (ES Module with Cluster)
// server.js (Production Version with Cluster)

// import cluster from "cluster";
// import { cpus } from "os";
// import express from "express";
// import cors from "cors";
// import helmet from "helmet";
// import cookieParser from "cookie-parser";
// import dotenv from "dotenv";
// import connectDB from "./config/db.js";
// import authRoutes from "./routes/authRoutes.js";
// import { protect } from "./middleware/authMiddleware.js";

// dotenv.config();

// const numCPUs = cpus().length;

// if (cluster.isPrimary) {
//   console.log(`\n${'='.repeat(50)}`);
//   console.log(`🚀 Primary process ${process.pid} is running`);
//   console.log(`💻 CPU Cores: ${numCPUs}`);
//   console.log(`🔄 Forking ${numCPUs} worker processes...`);
//   console.log(`${'='.repeat(50)}\n`);

//   // Fork workers for each CPU core
//   for (let i = 0; i < numCPUs; i++) {
//     cluster.fork();
//   }

//   // Listen for dying workers and restart
//   cluster.on("exit", (worker, code, signal) => {
//     console.log(`\n⚠️  Worker ${worker.process.pid} died. Restarting...`);
//     cluster.fork();
//   });

//   // Track when workers come online
//   cluster.on("online", (worker) => {
//     console.log(`✅ Worker ${worker.process.pid} is online`);
//   });

// } else {
//   // Worker process
//   const app = express();

//   // Connect to MongoDB (each worker connects)
//   connectDB();

//   // Middleware
//   app.use(cors());
//   app.use(express.json());
//   app.use(express.urlencoded({ extended: true }));

//   // Optional: Logging middleware (comment out in production for performance)
//   app.use((req, res, next) => {
//     console.log(`[Worker ${process.pid}] ${req.method} ${req.url}`);
//     next();
//   });

//   // Routes
//   app.use("/api/auth", authRoutes);

//   // Protected route example
//   app.get("/api/protected", protect, (req, res) => {
//     res.json({
//       success: true,
//       message: `Protected route accessed by ${req.user.username}`,
//       worker: process.pid,
//       data: { secret: "This is sensitive data" }
//     });
//   });

//   // Health check route
//   app.get("/health", (req, res) => {
//     res.json({
//       success: true,
//       worker: process.pid,
//       uptime: process.uptime(),
//       memory: process.memoryUsage(),
//       timestamp: new Date().toISOString()
//     });
//   });

//   // Root route
//   app.get("/", (req, res) => {
//     res.json({ 
//       success: true, 
//       message: "API is running with cluster mode! 🚀",
//       worker: process.pid,
//       availableRoutes: [
//         "GET  /",
//         "GET  /health",
//         "POST /api/auth/register",
//         "POST /api/auth/login",
//         "GET  /api/auth/me (requires Bearer token)",
//         "GET  /api/protected (requires Bearer token)"
//       ]
//     });
//   });

//   // 404 handler
//   app.use((req, res) => {
//     res.status(404).json({
//       success: false,
//       message: `Route ${req.method} ${req.originalUrl} not found`,
//       worker: process.pid
//     });
//   });

//   // Error handler
//   app.use((err, req, res, next) => {
//     console.error(`[Worker ${process.pid}] Error:`, err.message);
//     res.status(500).json({
//       success: false,
//       message: err.message || "Internal Server Error",
//       worker: process.pid
//     });
//   });

//   // Start server
//   const PORT = process.env.PORT || 5000;
//   app.listen(PORT, () => {
//     console.log(`[Worker ${process.pid}] 🎯 Listening on port ${PORT}`);
//   });
// }




// import cluster from "cluster";
// import { cpus } from "os";
// import express from "express";
// import cors from "cors";
// import helmet from "helmet";
// import cookieParser from "cookie-parser";
// import dotenv from "dotenv";
// import connectDB from "./config/db.js";
// import authRoutes from "./routes/authRoutes.js";
// import { protect } from "./middleware/authMiddleware.js";
// import { 
//   generalLimiter, 
//   authLimiter, 
//   uploadLimiter,
//   strictLimiter 
// } from "./middleware/rateLimit.js";
// import { 
//   uploadSingle, 
//   uploadMultiple,
//   handleUploadErrors 
// } from "./middleware/upload.js";
//   import fs from 'fs';

// dotenv.config();

// const numCPUs = cpus().length;

// if (cluster.isPrimary) {
//   console.log(`\n${'='.repeat(50)}`);
//   console.log(`🚀 Primary process ${process.pid} is running`);
//   console.log(`💻 CPU Cores: ${numCPUs}`);
//   console.log(`🔄 Forking ${numCPUs} worker processes...`);
//   console.log(`${'='.repeat(50)}\n`);

//   // Fork workers for each CPU core
//   for (let i = 0; i < numCPUs; i++) {
//     cluster.fork();
//   }

//   // Listen for dying workers and restart
//   cluster.on("exit", (worker, code, signal) => {
//     console.log(`\n⚠️  Worker ${worker.process.pid} died. Restarting...`);
//     cluster.fork();
//   });

//   // Track when workers come online
//   cluster.on("online", (worker) => {
//     console.log(`✅ Worker ${worker.process.pid} is online`);
//   });

// } else {
//   // Worker process
//   const app = express();

//   // Connect to MongoDB (each worker connects)
//   connectDB();

//   // Create uploads directory if it doesn't exist

//   const uploadsDir = './uploads';
//   if (!fs.existsSync(uploadsDir)) {
//     fs.mkdirSync(uploadsDir, { recursive: true });
//   }

//   // Middleware
//   app.use(cors({
//     origin: process.env.CLIENT_URL || 'http://localhost:5173',
//     credentials: true
//   }));
//   app.use(express.json({ limit: '10mb' })); // Increase JSON payload limit
//   app.use(express.urlencoded({ extended: true, limit: '10mb' }));
//   app.use(cookieParser());
//   app.use(helmet());

//   // Apply general rate limiting to all routes
//   app.use(generalLimiter);

//   // Optional: Logging middleware
//   app.use((req, res, next) => {
//     console.log(`[Worker ${process.pid}] ${req.method} ${req.url}`);
//     next();
//   });

//   // Apply specific rate limiters to auth routes
//   app.use("/api/auth", authLimiter);

//   // Routes
//   app.use("/api/auth", authRoutes);

//   // File upload routes with upload rate limiting
//   app.post("/api/upload/single", 
//     uploadLimiter, 
//     uploadSingle('file'), 
//     handleUploadErrors,
//     (req, res) => {
//       if (!req.file) {
//         return res.status(400).json({
//           success: false,
//           message: 'No file uploaded'
//         });
//       }

//       res.json({
//         success: true,
//         message: 'File uploaded successfully',
//         file: {
//           filename: req.file.filename,
//           originalname: req.file.originalname,
//           size: req.file.size,
//           mimetype: req.file.mimetype,
//           path: req.file.path
//         }
//       });
//     }
//   );

//   app.post("/api/upload/multiple", 
//     uploadLimiter, 
//     uploadMultiple('files', 5), 
//     handleUploadErrors,
//     (req, res) => {
//       if (!req.files || req.files.length === 0) {
//         return res.status(400).json({
//           success: false,
//           message: 'No files uploaded'
//         });
//       }

//       const files = req.files.map(file => ({
//         filename: file.filename,
//         originalname: file.originalname,
//         size: file.size,
//         mimetype: file.mimetype,
//         path: file.path
//       }));

//       res.json({
//         success: true,
//         message: `${files.length} files uploaded successfully`,
//         files: files
//       });
//     }
//   );

//   // Protected route example with strict rate limiting
//   app.get("/api/protected", protect, strictLimiter, (req, res) => {
//     res.json({
//       success: true,
//       message: `Protected route accessed by ${req.user.username}`,
//       worker: process.pid,
//       data: { secret: "This is sensitive data" }
//     });
//   });

//   // Serve uploaded files statically
//   app.use('/uploads', express.static('uploads'));

//   // Health check route
//   app.get("/health", (req, res) => {
//     res.json({
//       success: true,
//       worker: process.pid,
//       uptime: process.uptime(),
//       memory: process.memoryUsage(),
//       timestamp: new Date().toISOString()
//     });
//   });

//   // Root route
//   app.get("/", (req, res) => {
//     res.json({ 
//       success: true, 
//       message: "API is running with cluster mode! 🚀",
//       worker: process.pid,
//       features: [
//         "Rate Limiting ✅",
//         "File Uploads ✅", 
//         "JWT Authentication ✅",
//         "Cluster Mode ✅"
//       ],
//       availableRoutes: [
//         "GET  /",
//         "GET  /health",
//         "POST /api/auth/register",
//         "POST /api/auth/login", 
//         "POST /api/auth/logout",
//         "GET  /api/auth/me (protected)",
//         "POST /api/upload/single",
//         "POST /api/upload/multiple", 
//         "GET  /api/protected (protected)"
//       ]
//     });
//   });

//   // 404 handler
//   app.use((req, res) => {
//     res.status(404).json({
//       success: false,
//       message: `Route ${req.method} ${req.originalUrl} not found`,
//       worker: process.pid
//     });
//   });

//   // Error handler
//   app.use((err, req, res, next) => {
//     console.error(`[Worker ${process.pid}] Error:`, err.message);
//     res.status(500).json({
//       success: false,
//       message: err.message || "Internal Server Error",
//       worker: process.pid
//     });
//   });

//   // Start server
//   const PORT = process.env.PORT || 5000;
//   app.listen(PORT, () => {
//     console.log(`[Worker ${process.pid}] 🎯 Listening on port ${PORT}`);
//   });
// }






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
import { protect } from "./middleware/authMiddleware.js";
import { 
  generalLimiter, 
  authLimiter, 
  uploadLimiter,
  strictLimiter 
} from "./middleware/rateLimit.js";
 import fs from 'fs';
import employeeRoutes from './routes/employeeRoutes.js';



dotenv.config();

const numCPUs = cpus().length;

if (cluster.isPrimary) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 Primary process ${process.pid} is running`);
  console.log(`💻 CPU Cores: ${numCPUs}`);
  console.log(`🔄 Forking ${numCPUs} worker processes...`);
  console.log(`${'='.repeat(50)}\n`);

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
 
  const uploadsDir = './uploads';
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Middleware
  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(helmet());

  // Apply general rate limiting to all routes
  app.use(generalLimiter);

  // Optional: Logging middleware
  app.use((req, res, next) => {
    console.log(`[Worker ${process.pid}] ${req.method} ${req.url}`);
    next();
  });

  // Apply specific rate limiters to auth routes
  app.use("/api/auth", authLimiter);

  // Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/users", protect, userRoutes); // Add user routes
  app.use("/api/employees", protect, employeeRoutes);

  // Protected route example with role-based access
  app.get("/api/protected", protect, strictLimiter, (req, res) => {
    res.json({
      success: true,
      message: `Protected route accessed by ${req.user.name} (${req.user.role})`,
      worker: process.pid,
      user: {
        id: req.user._id,
        name: req.user.name,
        role: req.user.role,
        permissions: req.user.permissions
      }
    });
  });

  // Serve uploaded files statically
  app.use('/uploads', express.static('uploads'));

  // Health check route
  app.get("/health", (req, res) => {
    res.json({
      success: true,
      worker: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  });

  // Root route
  app.get("/", (req, res) => {
    res.json({ 
      success: true, 
      message: "Jain Impex CRM API is running with cluster mode! 🚀",
      worker: process.pid,
      features: [
        "Role-based Authentication ✅",
        "User Management ✅",
        "Permission System ✅",
        "Rate Limiting ✅",
        "File Uploads ✅", 
        "JWT Authentication ✅",
        "Cluster Mode ✅"
      ],
      availableRoutes: [
        "POST /api/auth/login",
        "POST /api/auth/logout", 
        "GET  /api/auth/me (protected)",
        "GET  /api/users (protected - super admin)",
        "POST /api/users (protected - super admin)",
        "GET  /api/users/config/permissions (protected - super admin)"
      ]
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route ${req.method} ${req.originalUrl} not found`,
      worker: process.pid
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error(`[Worker ${process.pid}] Error:`, err.message);
    res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      worker: process.pid
    });
  });

  // Start server
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`[Worker ${process.pid}] 🎯 Listening on port ${PORT}`);
  });
}