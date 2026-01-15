import mongoose from "mongoose";
import dotenv from "dotenv";

// Import models
import Brand from "../models/Brand.js";
import Category from "../models/Category.js";
import Subcategory from "../models/Subcategory.js";
import ExtendedSubcategory from "../models/ExtendedSubcategory.js";

dotenv.config();

async function testDataStorage() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGO_URL ||
        process.env.MONGODB_URI ||
        "mongodb://localhost:27017/jaininpexcrm"
    );
    console.log("✅ Connected to MongoDB");

    console.log("\n🔍 TESTING DATA STORAGE - BRAND-FIRST HIERARCHY\n");
    console.log("=".repeat(60));

    // 1. Check Brands
    console.log("\n📋 BRANDS:");
    const brands = await Brand.find({}).sort({ createdAt: -1 });
    console.log(`Total Brands: ${brands.length}`);

    if (brands.length > 0) {
      brands.forEach((brand, index) => {
        console.log(`${index + 1}. ${brand.name} (ID: ${brand._id})`);
        console.log(`   Description: ${brand.description || "No description"}`);
        console.log(`   Status: ${brand.status}`);
        console.log(`   Created: ${brand.createdAt}`);
        console.log("");
      });
    } else {
      console.log("   No brands found");
    }

    // 2. Check Categories for each Brand
    console.log("\n📁 CATEGORIES (by Brand):");
    for (const brand of brands) {
      const categories = await Category.find({ brand: brand._id }).sort({
        createdAt: -1,
      });
      console.log(
        `\n🏷️  Brand: ${brand.name} (${categories.length} categories)`
      );

      if (categories.length > 0) {
        categories.forEach((category, index) => {
          console.log(
            `   ${index + 1}. ${category.name} (ID: ${category._id})`
          );
          console.log(
            `      Description: ${category.description || "No description"}`
          );
          console.log(`      Brand ID: ${category.brand}`);
          console.log(`      Status: ${category.status}`);
          console.log("");
        });
      } else {
        console.log("   No categories found for this brand");
      }
    }

    // 3. Check Subcategories for each Category
    console.log("\n📂 SUBCATEGORIES (by Brand → Category):");
    for (const brand of brands) {
      const categories = await Category.find({ brand: brand._id });

      for (const category of categories) {
        const subcategories = await Subcategory.find({
          brand: brand._id,
          category: category._id,
        }).sort({ createdAt: -1 });

        if (subcategories.length > 0) {
          console.log(
            `\n🏷️  ${brand.name} → ${category.name} (${subcategories.length} subcategories)`
          );

          subcategories.forEach((subcategory, index) => {
            console.log(
              `   ${index + 1}. ${subcategory.name} (ID: ${subcategory._id})`
            );
            console.log(
              `      Description: ${
                subcategory.description || "No description"
              }`
            );
            console.log(`      Brand ID: ${subcategory.brand}`);
            console.log(`      Category ID: ${subcategory.category}`);
            console.log(`      Status: ${subcategory.status}`);
            console.log("");
          });
        }
      }
    }

    // 4. Check Extended Subcategories
    console.log("\n🏗️  EXTENDED SUBCATEGORIES (by hierarchy):");
    for (const brand of brands) {
      const categories = await Category.find({ brand: brand._id });

      for (const category of categories) {
        const subcategories = await Subcategory.find({
          brand: brand._id,
          category: category._id,
        });

        for (const subcategory of subcategories) {
          const extendedItems = await ExtendedSubcategory.find({
            brand: brand._id,
            category: category._id,
            subcategory: subcategory._id,
          }).sort({ level: 1, createdAt: -1 });

          if (extendedItems.length > 0) {
            console.log(
              `\n🏷️  ${brand.name} → ${category.name} → ${subcategory.name} (${extendedItems.length} extended items)`
            );

            extendedItems.forEach((item, index) => {
              console.log(
                `   ${index + 1}. ${item.name} (Level ${item.level}) (ID: ${
                  item._id
                })`
              );
              console.log(
                `      Description: ${item.description || "No description"}`
              );
              console.log(`      Brand ID: ${item.brand}`);
              console.log(`      Category ID: ${item.category}`);
              console.log(`      Subcategory ID: ${item.subcategory}`);
              console.log(
                `      Parent Extended: ${
                  item.parentExtendedSubcategory || "None (Level 1)"
                }`
              );
              console.log(`      Level: ${item.level}`);
              console.log(`      Status: ${item.status}`);
              console.log("");
            });
          }
        }
      }
    }

    // 5. Hierarchy Validation
    console.log("\n🔍 HIERARCHY VALIDATION:");
    console.log("=".repeat(40));

    let validationErrors = [];

    // Check if all categories have valid brand references
    const allCategories = await Category.find({});
    for (const category of allCategories) {
      const brandExists = await Brand.findById(category.brand);
      if (!brandExists) {
        validationErrors.push(
          `Category "${category.name}" references non-existent brand: ${category.brand}`
        );
      }
    }

    // Check if all subcategories have valid brand and category references
    const allSubcategories = await Subcategory.find({});
    for (const subcategory of allSubcategories) {
      const brandExists = await Brand.findById(subcategory.brand);
      const categoryExists = await Category.findById(subcategory.category);

      if (!brandExists) {
        validationErrors.push(
          `Subcategory "${subcategory.name}" references non-existent brand: ${subcategory.brand}`
        );
      }
      if (!categoryExists) {
        validationErrors.push(
          `Subcategory "${subcategory.name}" references non-existent category: ${subcategory.category}`
        );
      }
    }

    // Check if all extended subcategories have valid references
    const allExtended = await ExtendedSubcategory.find({});
    for (const extended of allExtended) {
      const brandExists = await Brand.findById(extended.brand);
      const categoryExists = await Category.findById(extended.category);
      const subcategoryExists = await Subcategory.findById(
        extended.subcategory
      );

      if (!brandExists) {
        validationErrors.push(
          `Extended "${extended.name}" references non-existent brand: ${extended.brand}`
        );
      }
      if (!categoryExists) {
        validationErrors.push(
          `Extended "${extended.name}" references non-existent category: ${extended.category}`
        );
      }
      if (!subcategoryExists) {
        validationErrors.push(
          `Extended "${extended.name}" references non-existent subcategory: ${extended.subcategory}`
        );
      }

      // Check parent extended reference if exists
      if (extended.parentExtendedSubcategory) {
        const parentExists = await ExtendedSubcategory.findById(
          extended.parentExtendedSubcategory
        );
        if (!parentExists) {
          validationErrors.push(
            `Extended "${extended.name}" references non-existent parent: ${extended.parentExtendedSubcategory}`
          );
        }
      }
    }

    if (validationErrors.length === 0) {
      console.log("✅ All hierarchy references are valid!");
    } else {
      console.log("❌ Validation errors found:");
      validationErrors.forEach((error) => console.log(`   • ${error}`));
    }

    // 6. Summary Statistics
    console.log("\n📊 SUMMARY STATISTICS:");
    console.log("=".repeat(30));
    console.log(`Total Brands: ${brands.length}`);
    console.log(`Total Categories: ${allCategories.length}`);
    console.log(`Total Subcategories: ${allSubcategories.length}`);
    console.log(`Total Extended Items: ${allExtended.length}`);

    // Level distribution for extended items
    const levelCounts = {};
    allExtended.forEach((item) => {
      levelCounts[item.level] = (levelCounts[item.level] || 0) + 1;
    });

    console.log("\nExtended Items by Level:");
    for (let level = 1; level <= 5; level++) {
      console.log(`   Level ${level}: ${levelCounts[level] || 0} items`);
    }

    console.log("\n✅ Data storage test completed!");
  } catch (error) {
    console.error("❌ Error testing data storage:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

// Run the test
testDataStorage();
