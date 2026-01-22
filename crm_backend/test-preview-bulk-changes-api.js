import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import Category from './models/Category.js';
import Brand from './models/Brand.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const testPreviewBulkChangesAPI = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test the exact same logic as the backend API
    console.log('\n🔍 Testing Preview Bulk Changes API Logic...');

    // Get the "Cera cp fittings" category
    const ceraCategory = await Category.findOne({ 
      name: { $regex: /cera.*cp.*fitting/i } 
    });
    
    if (!ceraCategory) {
      console.log('❌ Cera cp fittings category not found');
      return;
    }

    console.log(`📦 Found category: ${ceraCategory.name} (${ceraCategory._id})`);

    // Simulate the API request
    const filters = {
      categoryId: ceraCategory._id.toString()
    };
    const changeType = 'increase_percentage';
    const changeValue = 10;

    console.log('\n📋 API Request Simulation:');
    console.log('Filters:', filters);
    console.log('Change Type:', changeType);
    console.log('Change Value:', changeValue);

    // Step 1: Build product filter (same as backend)
    let productFilter = {};
    
    if (filters.brandId) {
      productFilter.brand = filters.brandId;
    }
    
    if (filters.categoryId) {
      productFilter.category = filters.categoryId;
    }
    
    if (filters.subcategoryId) {
      productFilter.subcategory = filters.subcategoryId;
    }

    console.log('\n🔍 Product Filter:', productFilter);

    // Step 2: Get matching products (same as backend)
    const products = await Product.find(productFilter)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name');

    console.log(`\n✅ Found ${products.length} products matching filter`);

    if (products.length === 0) {
      console.log('❌ No products found - this is the issue!');
      
      // Debug: Check what products exist in this category
      console.log('\n🔍 Debugging: Checking products in category directly...');
      const directProducts = await Product.find({ category: ceraCategory._id })
        .populate('brand', 'name')
        .populate('category', 'name')
        .populate('subcategory', 'name');
      
      console.log(`📦 Direct category query found ${directProducts.length} products`);
      directProducts.forEach(product => {
        console.log(`- ${product.itemName} (${product.productCode})`);
        console.log(`  Category: ${product.category?.name} (${product.category?._id})`);
      });
      
      return;
    }

    // Step 3: Get existing pricing for these products
    const productIds = products.map(p => p._id);
    const existingPricing = await DealerPricing.find({
      product: { $in: productIds },
      isActive: true
    }).populate('product', 'itemName productCode');

    console.log(`\n💰 Found ${existingPricing.length} existing pricing records`);

    // Step 4: Calculate preview data (same as backend)
    const affectedProducts = [];
    let totalCurrentValue = 0;
    let totalNewValue = 0;

    for (const product of products) {
      // Find existing pricing for this product
      const pricing = existingPricing.find(p => 
        p.product._id.toString() === product._id.toString()
      );

      let currentPrice = 0;
      if (pricing) {
        currentPrice = pricing.sellingPrice || 0;
      } else {
        // Use rate slab if no pricing exists
        currentPrice = product.rateSlabs && product.rateSlabs.length > 0 
          ? product.rateSlabs[0].rate 
          : 0;
      }

      if (currentPrice <= 0) {
        console.log(`⚠️ Skipping ${product.itemName} - no valid price (${currentPrice})`);
        continue;
      }

      // Calculate new price based on change type
      let newPrice = currentPrice;
      
      switch (changeType) {
        case 'increase_percentage':
          newPrice = currentPrice * (1 + changeValue / 100);
          break;
        case 'decrease_percentage':
          newPrice = currentPrice * (1 - changeValue / 100);
          break;
        case 'increase_amount':
          newPrice = currentPrice + changeValue;
          break;
        case 'decrease_amount':
          newPrice = currentPrice - changeValue;
          break;
      }

      newPrice = Math.round(newPrice * 100) / 100; // Round to 2 decimal places

      const change = newPrice - currentPrice;

      affectedProducts.push({
        productId: product._id,
        productName: product.itemName,
        productCode: product.productCode,
        currentPrice,
        newPrice,
        change
      });

      totalCurrentValue += currentPrice;
      totalNewValue += newPrice;
    }

    const totalChange = totalNewValue - totalCurrentValue;

    const previewData = {
      totalProducts: affectedProducts.length,
      affectedProducts,
      summary: {
        totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
        totalNewValue: Math.round(totalNewValue * 100) / 100,
        totalChange: Math.round(totalChange * 100) / 100
      }
    };

    console.log('\n📊 Preview Data Result:');
    console.log('Total Products:', previewData.totalProducts);
    console.log('Total Current Value:', previewData.summary.totalCurrentValue);
    console.log('Total New Value:', previewData.summary.totalNewValue);
    console.log('Total Change:', previewData.summary.totalChange);

    console.log('\n📋 Affected Products:');
    previewData.affectedProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.productName} (${product.productCode})`);
      console.log(`   Current: ₹${product.currentPrice} → New: ₹${product.newPrice} (Change: ₹${product.change})`);
    });

    if (previewData.totalProducts === 0) {
      console.log('\n❌ No products with valid prices found!');
      
      // Debug pricing records
      console.log('\n🔍 Debugging pricing records...');
      const allPricing = await DealerPricing.find({}).populate('product', 'itemName productCode category');
      console.log(`📊 Total pricing records in database: ${allPricing.length}`);
      
      const categoryPricing = allPricing.filter(p => 
        p.product?.category?.toString() === ceraCategory._id.toString()
      );
      console.log(`📊 Pricing records for this category: ${categoryPricing.length}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testPreviewBulkChangesAPI();