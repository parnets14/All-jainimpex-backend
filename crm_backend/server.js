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




// server.js (add cookie-parser to imports and middleware)
import cluster from "cluster";
import { cpus } from "os";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser"; // Add this import
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import { protect } from "./middleware/authMiddleware.js";

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

  // Middleware
  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true // Important for cookies
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser()); // Add cookie parser middleware

  // Optional: Logging middleware (comment out in production for performance)
  app.use((req, res, next) => {
    console.log(`[Worker ${process.pid}] ${req.method} ${req.url}`);
    next();
  });

  // Routes
  app.use("/api/auth", authRoutes);

  // Protected route example
  app.get("/api/protected", protect, (req, res) => {
    res.json({
      success: true,
      message: `Protected route accessed by ${req.user.username}`,
      worker: process.pid,
      data: { secret: "This is sensitive data" }
    });
  });

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
      message: "API is running with cluster mode! 🚀",
      worker: process.pid,
      availableRoutes: [
        "GET  /",
        "GET  /health",
        "POST /api/auth/register",
        "POST /api/auth/login",
        "POST /api/auth/logout",
        "GET  /api/auth/me (protected)",
        "GET  /api/auth/check-auth (protected)",
        "GET  /api/protected (protected)"
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