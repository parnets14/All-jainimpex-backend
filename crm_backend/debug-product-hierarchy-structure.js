import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

// Load environment variables
dotenv.config({ path: './.env' });

const debugProductHierarchy = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get a sample product with populated hierarchy
    console.log('\n📦 Checking Product Structure...');
    const sampleProduct = await Product.findOne({})
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name');

    if (sampleProduct) {
      console.log('Sample Product Structure:');
      console.log({
        _id: sampleProduct._id,
        itemName: sampleProduct.itemName,
        productCode: sampleProduct.productCode,
        brand: sampleProduct.brand,
        category: sampleProduct.category,
        subcategory: sampleProduct.subcategory,
        brandId: sampleProduct.brand?._id,
        categoryId: sampleProduct.category?._id,
        subcategoryId: sampleProduct.subcategory?._id
      });
    }

    // Check specific category "h cpvc fittings"
    console.log('\n🔍 Checking "h cpvc fittings" category...');
    const hCpvcFittingsCategory = await Category.findOne({ 
      name: { $regex: /h cpvc fittings/i } 
    });
    
    if (hCpvcFittingsCategory) {
      console.log('Found "h cpvc fittings" category:', {
        _id: hCpvcFittingsCategory._id,
        name: hCpvcFittingsCategory.name
      });

      // Find products in this category
      const productsInCategory = await Product.find({ 
        category: hCpvcFittingsCategory._id 
      })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .limit(5);

      console.log(`\n📦 Products in "${hCpvcFittingsCategory.name}" category (${productsInCategory.length} found):`);
      productsInCategory.forEach(product => {
        console.log(`- ${product.itemName} (${product.productCode})`);
        console.log(`  Brand: ${product.brand?.name || 'N/A'}`);
        console.log(`  Category: ${product.category?.name || 'N/A'}`);
        console.log(`  Subcategory: ${product.subcategory?.name || 'N/A'}`);
        console.log(`  Category ID: ${product.category?._id}`);
        console.log('');
      });

      // Check if there are products with string references instead of ObjectId
      const productsWithStringCategory = await Product.find({ 
        category: hCpvcFittingsCategory._id.toString() 
      }).limit(3);
      
      console.log(`Products with string category reference: ${productsWithStringCategory.length}`);
    } else {
      console.log('❌ "h cpvc fittings" category not found');
      
      // Show all categories with similar names
      const similarCategories = await Category.find({
        name: { $regex: /cpvc|fitting/i }
      });
      console.log('Similar categories found:');
      similarCategories.forEach(cat => {
        console.log(`- ${cat.name} (${cat._id})`);
      });
    }

    // Check all categories and their product counts
    console.log('\n📊 All Categories with Product Counts:');
    const allCategories = await Category.find({});
    
    for (const category of allCategories) {
      const productCount = await Product.countDocuments({ category: category._id });
      console.log(`${category.name}: ${productCount} products (ID: ${category._id})`);
    }

    // Check if products have different field structures
    console.log('\n🔍 Checking Product Field Variations...');
    const productFieldVariations = await Product.aggregate([
      {
        $project: {
          itemName: 1,
          brandType: { $type: "$brand" },
          categoryType: { $type: "$category" },
          subcategoryType: { $type: "$subcategory" },
          hasBrand: { $ne: ["$brand", null] },
          hasCategory: { $ne: ["$category", null] },
          hasSubcategory: { $ne: ["$subcategory", null] }
        }
      },
      {
        $group: {
          _id: {
            brandType: "$brandType",
            categoryType: "$categoryType",
            subcategoryType: "$subcategoryType"
          },
          count: { $sum: 1 },
          samples: { $push: "$itemName" }
        }
      }
    ]);

    console.log('Field type variations:');
    productFieldVariations.forEach(variation => {
      console.log(`Brand: ${variation._id.brandType}, Category: ${variation._id.categoryType}, Subcategory: ${variation._id.subcategoryType}`);
      console.log(`  Count: ${variation.count}`);
      console.log(`  Samples: ${variation.samples.slice(0, 3).join(', ')}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n🔌 Disconnecting from MongoDB...');
    await mongoose.disconnect();
  }
};

debugProductHierarchy();