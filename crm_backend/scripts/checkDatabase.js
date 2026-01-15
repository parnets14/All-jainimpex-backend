import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/jainimpexcrm";

async function checkDatabase() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    console.log("📍 URI:", MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Get database name
    const dbName = mongoose.connection.db.databaseName;
    console.log("📊 Database:", dbName);
    console.log("─".repeat(60));

    // Get all collections
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();

    console.log(`\n📋 Found ${collections.length} collections:\n`);

    let totalDocuments = 0;

    // Count documents in each collection
    for (const collection of collections) {
      const count = await mongoose.connection.db
        .collection(collection.name)
        .countDocuments();
      totalDocuments += count;

      const icon = count > 0 ? "📦" : "📭";
      console.log(
        `${icon} ${collection.name.padEnd(30)} ${count
          .toString()
          .padStart(6)} documents`
      );
    }

    console.log("─".repeat(60));
    console.log(
      `\n📊 Total documents across all collections: ${totalDocuments}`
    );

    if (totalDocuments === 0) {
      console.log("\n⚠️  Database is empty! No data to delete.");
    } else {
      console.log("\n✅ Database has data that can be cleaned.");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await mongoose.connection.close();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the check
checkDatabase();
