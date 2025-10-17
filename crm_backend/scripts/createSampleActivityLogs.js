import mongoose from "mongoose";
import ActivityLog from "../models/ActivityLog.js";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config();

const createSampleActivityLogs = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB");

    // Get some users to create logs for
    const users = await User.find().limit(5);
    if (users.length === 0) {
      console.log("No users found. Please create users first.");
      return;
    }

    const modules = [
      "Sales Dashboard",
      "Inventory Management", 
      "HRMS",
      "Financial Reports",
      "User Management",
      "Purchase Orders",
      "Supplier Management",
      "Dealer Management",
      "Expense Management",
      "Attendance Tracking"
    ];

    const activities = [
      "Viewed dashboard",
      "Updated record",
      "Created new entry",
      "Deleted record",
      "Exported data",
      "Imported data",
      "Generated report",
      "Updated settings",
      "Viewed details",
      "Bulk operation"
    ];

    const actions = ["CREATE", "READ", "UPDATE", "DELETE", "EXPORT", "IMPORT", "VIEW"];

    const sampleLogs = [];

    // Create 50 sample logs
    for (let i = 0; i < 50; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const module = modules[Math.floor(Math.random() * modules.length)];
      const activity = activities[Math.floor(Math.random() * activities.length)];
      const action = actions[Math.floor(Math.random() * actions.length)];
      
      // Create timestamp within last 30 days
      const timestamp = new Date();
      timestamp.setDate(timestamp.getDate() - Math.floor(Math.random() * 30));
      timestamp.setHours(Math.floor(Math.random() * 24));
      timestamp.setMinutes(Math.floor(Math.random() * 60));

      sampleLogs.push({
        user: user._id,
        username: user.username || user.name || "Unknown User",
        module: module,
        activity: activity,
        action: action,
        details: {
          method: "GET",
          url: `/api/${module.toLowerCase().replace(/\s+/g, '-')}`,
          params: {},
          query: {},
        },
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        status: Math.random() > 0.1 ? "SUCCESS" : "FAILED", // 90% success rate
        timestamp: timestamp,
      });
    }

    // Insert sample logs
    await ActivityLog.insertMany(sampleLogs);
    console.log(`Created ${sampleLogs.length} sample activity logs`);

    // Also create some login/logout logs
    const authLogs = [];
    for (let i = 0; i < 20; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const action = Math.random() > 0.5 ? "LOGIN" : "LOGOUT";
      
      const timestamp = new Date();
      timestamp.setDate(timestamp.getDate() - Math.floor(Math.random() * 30));
      timestamp.setHours(Math.floor(Math.random() * 24));
      timestamp.setMinutes(Math.floor(Math.random() * 60));

      authLogs.push({
        user: user._id,
        username: user.username || user.name || "Unknown User",
        module: "Authentication",
        activity: action === "LOGIN" ? "User logged in" : "User logged out",
        action: action,
        details: {
          method: "POST",
          url: "/api/auth/login",
          ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        status: "SUCCESS",
        timestamp: timestamp,
      });
    }

    await ActivityLog.insertMany(authLogs);
    console.log(`Created ${authLogs.length} authentication logs`);

    console.log("Sample activity logs created successfully!");
    
  } catch (error) {
    console.error("Error creating sample activity logs:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
};

// Run the script
createSampleActivityLogs();
