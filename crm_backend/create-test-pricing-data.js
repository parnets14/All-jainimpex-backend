import mongoose from 'mongoose';
import DealerPricing from './models/DealerPricing.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import User from './models/User.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGO_URL = process.env.MONGO_URL;

async function createTestPricingData() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get a user for createdBy
    const user = await User.findOne({ role: 'super_admin' });
    if (!user) {
      console.log('❌ No super admin user found');
      return;
    }

    // Get some products
    const products = await Product.find({}).limit(10);
    console.log(`Found ${products.length} products`);

    if (products.length === 0) {
      console.log('❌ No products found to create pricing for');
      return;
    }

    // Create some test brands, categories, subcategories if they don't exist
    let testBrand = await Brand.findOne({ name: 'Test Brand' });
    if (!testBrand) {
      testBrand = await Brand.create({
        name: 'Test Brand',
        description: 'Test brand for pricing',
        isActive: true,
        createdBy: user._id
      });
      console.log('✅ Created test brand');
    }

    let testCategory = await Category.findOne({ name: 'Test Category' });
    if (!testCategory) {
      testCategory = await Category.create({
        name: 'Test Category',
        description: 'Test category for pricing',
        brand: testBrand._id,
        isActive: true,
        createdBy: user._id
      });
      console.log('✅ Created test category');
    }

    let testSubcategory = await Subcategory.findOne({ name: 'Test Subcategory' });
    if (!testSubcategory) {
      testSubcategory = await Subcategory.create({
        name: 'Test Subcategory',
        description: 'Test subcategory for pricing',
        brand: testBrand._id,
        category: testCategory._id,
        isActive: true,
        createdBy: user._id
      });
      console.log('✅ Created test subcategory');
    }

    // Create pricing records for products
    let createdCount = 0;
    for (const product of products) {
      try {
        // Check if pricing already exists
        const existingPricing = await DealerPricing.findOne({ product: product._id });
        
        if (!existingPricing) {
          const purchasePrice = Math.floor(Math.random() * 500) + 100; // 100-600
          const sellingPrice = purchasePrice + Math.floor(Math.random() * 200) + 50; // Add 50-250 margin
          
          await DealerPricing.create({
            product: product._id,
            purchasePrice,
            sellingPrice,
            createdBy: user._id,
            isActive: true
          });
          
          createdCount++;
          console.log(`✅ Created pricing for ${product.itemName}: Purchase ₹${purchasePrice}, Selling ₹${sellingPrice}`);
        }
      } catch (error) {
        console.error(`❌ Error creating pricing for ${product.itemName}:`, error.message);
      }
    }

    console.log(`\n🎉 Created ${createdCount} pricing records`);

    // Update some products to have the test brand/category
    const updateCount = Math.min(5, products.length);
    for (let i = 0; i < updateCount; i++) {
      try {
        await Product.findByIdAndUpdate(products[i]._id, {
          brand: testBrand._id,
          category: testCategory._id,
          subcategory: testSubcategory._id
        });
        console.log(`✅ Updated ${products[i].itemName} with test hierarchy`);
      } catch (error) {
        console.error(`❌ Error updating ${products[i].itemName}:`, error.message);
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
createTestPricingData();