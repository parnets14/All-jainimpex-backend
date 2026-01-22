import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import Category from './models/Category.js';
import Brand from './models/Brand.js';

dotenv.config();

const findAllCeraProducts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find all categories that might contain Cera products
    const allCategories = await Category.find({});
    console.log('\n📋 All Categories:');
    allCategories.forEach((cat, index) => {
      console.log(`${index + 1}. ${cat.name} (${cat._id})`);
    });

    // Find all brands
    const allBrands = await Brand.find({});
    console.log('\n🏷️ All Brands:');
    allBrands.forEach((brand, index) => {
      console.log(`${index + 1}. ${brand.name} (${brand._id})`);
    });

    // Find Cera brand
    const ceraBrand = await Brand.findOne({ name: { $regex: /cera/i } });
    if (ceraBrand) {
      console.log(`\n🎯 Found Cera Brand: ${ceraBrand.name} (${ceraBrand._id})`);
      
      // Find all products with Cera brand
      const ceraProducts = await Product.find({ brand: ceraBrand._id });
      console.log(`\n📦 All Cera Brand Products: ${ceraProducts.length}`);
      
      // Group by category
      const productsByCategory = {};
      for (const product of ceraProducts) {
        const categoryId = product.category?.toString() || 'No Category';
        if (!productsByCategory[categoryId]) {
          productsByCategory[categoryId] = [];
        }
        productsByCategory[categoryId].push(product);
      }
      
      console.log('\n📊 Cera Products by Category:');
      for (const [categoryId, products] of Object.entries(productsByCategory)) {
        const category = allCategories.find(c => c._id.toString() === categoryId);
        const categoryName = category ? category.name : 'Unknown Category';
        
        console.log(`\n📂 ${categoryName} (${categoryId}): ${products.length} products`);
        
        for (let i = 0; i < products.length; i++) {
          const product = products[i];
          console.log(`   ${i + 1}. ${product.itemName} (${product.productCode})`);
          
          // Check DealerPricing
          const dealerPricing = await DealerPricing.findOne({
            product: product._id,
            isActive: true
          });
          
          if (dealerPricing) {
            console.log(`      ✅ DealerPricing: ₹${dealerPricing.sellingPrice}`);
          } else {
            console.log(`      ❌ No DealerPricing`);
          }
          
          // Check rate slabs
          if (product.rateSlabs && product.rateSlabs.length > 0) {
            console.log(`      📋 RateSlab: ₹${product.rateSlabs[0].rate}`);
          } else {
            console.log(`      ❌ No RateSlabs`);
          }
        }
      }
    }

    // Also search for products that might have "cera" in their name
    console.log('\n🔍 Searching for products with "cera" in name...');
    const ceraNameProducts = await Product.find({ 
      itemName: { $regex: /cera/i } 
    });
    
    console.log(`📦 Products with "cera" in name: ${ceraNameProducts.length}`);
    ceraNameProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.itemName} (${product.productCode}) - Category: ${product.category}`);
    });

    // Check if there are any products without proper category assignment
    console.log('\n🔍 Checking for products with missing or invalid categories...');
    const productsWithoutCategory = await Product.find({ 
      $or: [
        { category: null },
        { category: { $exists: false } }
      ]
    });
    
    console.log(`📦 Products without category: ${productsWithoutCategory.length}`);

  } catch (error) {
    console.error('❌ Search failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

findAllCeraProducts();