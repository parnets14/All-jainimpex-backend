import mongoose from "mongoose";
import DownloadLog from "../models/DownloadLog.js";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config();

const createSampleDownloadLogs = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB");

    // Get some users to use as references
    const users = await User.find().limit(5);
    if (users.length === 0) {
      console.log("No users found. Please create some users first.");
      return;
    }

    const modules = [
      "Activity Logs",
      "Download Logs", 
      "Dealer Performance",
      "Sales Order Dashboard",
      "Purchase Order Management",
      "User Management",
      "Dealer Management",
      "Product Management",
      "GRN Entry Module",
      "Supplier Invoice"
    ];

    const reportTypes = ["EXCEL", "PDF", "CSV"];
    const statuses = ["SUCCESS", "FAILED", "PENDING"];

    const sampleLogs = [];

    for (let i = 0; i < 20; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const module = modules[Math.floor(Math.random() * modules.length)];
      const reportType = reportTypes[Math.floor(Math.random() * reportTypes.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      // Generate random file size (in bytes)
      const fileSize = status === "SUCCESS" ? Math.floor(Math.random() * 5000000) + 100000 : 0;
      
      // Generate random timestamp within last 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      const randomTime = new Date(thirtyDaysAgo.getTime() + Math.random() * (now.getTime() - thirtyDaysAgo.getTime()));

      const log = {
        user: user._id,
        username: user.username || user.name || "Unknown User",
        reportName: `${module} Report - ${new Date().toISOString().slice(0, 10)}`,
        module: module,
        reportType: reportType,
        fileSize: fileSize,
        downloadUrl: `/api/reports/${module.toLowerCase().replace(/\s+/g, '-')}`,
        filters: {
          dateRange: "Last 30 days",
          format: reportType,
          includeDetails: true
        },
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        timestamp: randomTime,
        status: status
      };

      sampleLogs.push(log);
    }

    await DownloadLog.insertMany(sampleLogs);
    console.log(`Successfully created ${sampleLogs.length} sample download logs!`);

    // Show some statistics
    const stats = await DownloadLog.aggregate([
      {
        $group: {
          _id: "$module",
          count: { $sum: 1 },
          totalSize: { $sum: "$fileSize" }
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log("\nDownload Log Statistics by Module:");
    stats.forEach(stat => {
      console.log(`${stat._id}: ${stat.count} downloads, ${(stat.totalSize / 1024 / 1024).toFixed(2)} MB total`);
    });

  } catch (error) {
    console.error("Error creating sample download logs:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
};

createSampleDownloadLogs();
















