// scripts/seedReferenceData.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from root directory
dotenv.config({ path: join(__dirname, '..', '.env') });

import SchemeType from "../models/SchemeType.js";
import PaymentTerm from "../models/PaymentTerm.js";

console.log("MongoDB URL:", process.env.MONGO_URL ? "Loaded" : "Not loaded");

const seedData = async () => {
  try {
    if (!process.env.MONGO_URL) {
      throw new Error("MONGO_URL is not defined in environment variables");
    }

    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB");

    // Clear existing data (optional)
    await SchemeType.deleteMany({});
    await PaymentTerm.deleteMany({});

    // Seed Scheme Types
    const schemeTypes = [
      { name: "Volume Discount", code: "VD" },
      { name: "Early Payment", code: "EP" },
      { name: "Quarterly Bonus", code: "QB" },
      { name: "Loyalty Reward", code: "LR" }
    ];

    for (const schemeType of schemeTypes) {
      await SchemeType.create(schemeType);
      console.log(`Created scheme type: ${schemeType.name}`);
    }
    console.log("Scheme types seeded successfully");

    // Seed Payment Terms
    const paymentTerms = [
      { name: "Net 15", days: 15, code: "NET15" },
      { name: "Net 30", days: 30, code: "NET30" },
      { name: "Net 45", days: 45, code: "NET45" },
      { name: "COD", days: 0, code: "COD" },
      { name: "Net 60", days: 60, code: "NET60" },
      { name: "Custom", days: null, code: "CUSTOM" }
    ];

    for (const paymentTerm of paymentTerms) {
      await PaymentTerm.create(paymentTerm);
      console.log(`Created payment term: ${paymentTerm.name}`);
    }
    console.log("Payment terms seeded successfully");

    console.log("All reference data seeded successfully");
    
    // Get counts to verify
    const schemeTypeCount = await SchemeType.countDocuments();
    const paymentTermCount = await PaymentTerm.countDocuments();
    console.log(`Total Scheme Types: ${schemeTypeCount}`);
    console.log(`Total Payment Terms: ${paymentTermCount}`);
    
    process.exit(0);
  } catch (error) {
    console.error("Error seeding data:", error);
    process.exit(1);
  }
};

seedData();