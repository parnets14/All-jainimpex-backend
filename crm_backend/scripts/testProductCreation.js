import mongoose from "mongoose";
import dotenv from "dotenv";
import Brand from "../models/Brand.js";
import Category from "../models/Category.js";
import Subcategory from "../models/Subcategory.js";
import ExtendedSubcategory from "../models/ExtendedSubcategory.js";
import Product from "../models/Product.js";
import User from "../models/User.js";

// Load environment variables
dotenv.config();

const testProductCreation = async () => {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URL);
    console.log("✅ Connected to MongoDB");

    // Find any user for testing
    let testUser = await User.findOne();
    if (!testUser) {
      console.log("❌ No users found. Creating a test user...");
      testUser = new User({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
        role: "admin",
      });
      await testUser.save();
      console.log("✅ Test user created");
    }
    console.log("👤 Using test user:", testUser.name);

    // Create test data in brand-first hierarchy
    console.log("\n📦 Creating test brand...");
    const testBrand = new Brand({
      name: "Test Brand " + Date.now(),
      description: "Test brand for product creation",
      createdBy: testUser._id,
    });
    await testBrand.save();
    console.log("✅ Brand created:", testBrand.name);

    console.log("\n📂 Creating test category...");
    const testCategory = new Category({
      name: "Test Category " + Date.now(),
      description: "Test category for product creation",
      brand: testBrand._id,
      createdBy: testUser._id,
    });
    await testCategory.save();
    console.log("✅ Category created:", testCategory.name);

    console.log("\n📁 Creating test subcategory...");
    const testSubcategory = new Subcategory({
      name: "Test Subcategory " + Date.now(),
      description: "Test subcategory for product creation",
      brand: testBrand._id,
      category: testCategory._id,
      createdBy: testUser._id,
    });
    await testSubcategory.save();
    console.log("✅ Subcategory created:", testSubcategory.name);

    console.log("\n📋 Creating test extended subcategory (Level 1)...");
    const testExtended1 = new ExtendedSubcategory({
      name: "Test Extended Level 1 " + Date.now(),
      description: "Test extended subcategory level 1",
      brand: testBrand._id,
      category: testCategory._id,
      subcategory: testSubcategory._id,
      level: 1,
      createdBy: testUser._id,
    });
    await testExtended1.save();
    console.log("✅ Extended Level 1 created:", testExtended1.name);

    // Test product creation
    console.log("\n🛍️ Creating test product...");
    const testProduct = new Product({
      productCode: "TEST-" + Date.now(),
      HSNCode: "1234",
      itemName: "Test Product " + Date.now(),
      description: "Test product for validation",
      unit: "PCS",
      unitPrice: 100,
      gst: 18,
      brand: testBrand._id,
      category: testCategory._id,
      subcategory: testSubcategory._id,
      subcategory1: testExtended1._id,
      minStockLevel: 10,
      salesType: "Regular Sale",
      productType: "Regular Product",
      createdBy: testUser._id,
    });

    await testProduct.save();
    console.log("✅ Product created successfully!");
    console.log("📊 Product details:");
    console.log("  - Product Code:", testProduct.productCode);
    console.log("  - Item Name:", testProduct.itemName);
    console.log("  - Brand ID:", testProduct.brand);
    console.log("  - Category ID:", testProduct.category);
    console.log("  - Subcategory ID:", testProduct.subcategory);
    console.log("  - Extended Level 1 ID:", testProduct.subcategory1);

    // Test with populated data
    const populatedProduct = await Product.findById(testProduct._id)
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("subcategory1", "name");

    console.log("\n🔍 Populated product hierarchy:");
    console.log("  - Brand:", populatedProduct.brand.name);
    console.log("  - Category:", populatedProduct.category.name);
    console.log("  - Subcategory:", populatedProduct.subcategory.name);
    console.log("  - Extended Level 1:", populatedProduct.subcategory1.name);

    console.log("\n🧹 Cleaning up test data...");
    await Product.findByIdAndDelete(testProduct._id);
    await ExtendedSubcategory.findByIdAndDelete(testExtended1._id);
    await Subcategory.findByIdAndDelete(testSubcategory._id);
    await Category.findByIdAndDelete(testCategory._id);
    await Brand.findByIdAndDelete(testBrand._id);
    console.log("✅ Test data cleaned up");

    console.log("\n🎉 Product creation test completed successfully!");
    console.log("✅ Brand-first hierarchy validation is working correctly");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Stack trace:", error.stack);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
};

// Run the test
testProductCreation();
