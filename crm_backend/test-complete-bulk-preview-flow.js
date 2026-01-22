import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import Category from './models/Category.js';

dotenv.config();

const testCompleteBulkPreviewFlow = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Step 1: Get the category
    const ceraCategory = await Category.findOne({ 
      name: { $regex: /cera.*cp.*fitting/i } 
    });
    
    if (!ceraCategory) {
      console.log('❌ Cera cp fittings category not found');
      return;
    }

    console.log(`📦 Found category: ${ceraCategory.name} (${ceraCategory._id})`);

    // Step 2: Test the FIXED backend logic (without isActive filter on products)
    console.log('\n🔍 Testing FIXED Backend Logic...');

    const filters = {
      categoryId: ceraCategory._id.toString()
    };
    const changeType = 'increase_percentage';
    const changeValue = 10;

    // Build product filter (FIXED - no isActive filter)
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

    console.log('🔍 Product Filter:', productFilter);

    // Get matching products
    const products = await Product.find(productFilter).select('_id');
    const productIds = products.map(p => p._id);

    console.log(`✅ Found ${products.length} products matching filter`);
    console.log('Product IDs:', productIds.map(id => id.toString()));

    if (productIds.length === 0) {
      console.log('❌ No products found - API will return empty result');
      return;
    }

    // Get pricing records for these products
    const pricingRecords = await DealerPricing.find({
      product: { $in: productIds },
      isActive: true
    }).populate({
      path: 'product',
      select: 'itemName productCode brand category subcategory',
      populate: [
        { path: 'brand', select: 'name' },
        { path: 'category', select: 'name' },
        { path: 'subcategory', select: 'name' }
      ]
    });

    console.log(`💰 Found ${pricingRecords.length} pricing records`);

    if (pricingRecords.length === 0) {
      console.log('❌ No pricing records found - API will return empty result');
      
      // Check if products exist but don't have pricing
      const productsWithoutPricing = await Product.find(productFilter)
        .populate('brand category subcategory');
      
      console.log('\n🔍 Products without pricing:');
      productsWithoutPricing.forEach(product => {
        console.log(`- ${product.itemName} (${product.productCode})`);
        console.log(`  Rate Slabs: ${product.rateSlabs?.length || 0}`);
        if (product.rateSlabs?.length > 0) {
          console.log(`  First Rate: ₹${product.rateSlabs[0].rate}`);
        }
      });
      
      return;
    }

    // Calculate new prices (same as backend)
    const affectedProducts = pricingRecords.map(pricing => {
      const currentPrice = pricing.sellingPrice;
      let newPrice;

      switch (changeType) {
        case 'increase_amount':
          newPrice = currentPrice + parseFloat(changeValue);
          break;
        case 'decrease_amount':
          newPrice = Math.max(0, currentPrice - parseFloat(changeValue));
          break;
        case 'increase_percentage':
          newPrice = currentPrice * (1 + parseFloat(changeValue) / 100);
          break;
        case 'decrease_percentage':
          newPrice = currentPrice * (1 - parseFloat(changeValue) / 100);
          newPrice = Math.max(0, newPrice);
          break;
        default:
          newPrice = currentPrice;
      }

      return {
        productId: pricing.product._id,
        productName: pricing.product.itemName,
        productCode: pricing.product.productCode,
        brand: pricing.product.brand?.name,
        category: pricing.product.category?.name,
        subcategory: pricing.product.subcategory?.name,
        currentPrice: Math.round(currentPrice * 100) / 100,
        newPrice: Math.round(newPrice * 100) / 100,
        change: Math.round((newPrice - currentPrice) * 100) / 100,
        changePercentage: currentPrice > 0 ? Math.round(((newPrice - currentPrice) / currentPrice) * 10000) / 100 : 0
      };
    });

    // Calculate summary
    const totalCurrentValue = affectedProducts.reduce((sum, p) => sum + p.currentPrice, 0);
    const totalNewValue = affectedProducts.reduce((sum, p) => sum + p.newPrice, 0);
    const totalChange = totalNewValue - totalCurrentValue;
    const averageChange = affectedProducts.length > 0 ? totalChange / affectedProducts.length : 0;

    const previewData = {
      affectedProducts,
      totalProducts: affectedProducts.length,
      changeType,
      changeValue,
      summary: {
        totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
        totalNewValue: Math.round(totalNewValue * 100) / 100,
        totalChange: Math.round(totalChange * 100) / 100,
        averageChange: Math.round(averageChange * 100) / 100
      }
    };

    console.log('\n📊 Final Preview Data:');
    console.log('Total Products:', previewData.totalProducts);
    console.log('Total Current Value:', previewData.summary.totalCurrentValue);
    console.log('Total New Value:', previewData.summary.totalNewValue);
    console.log('Total Change:', previewData.summary.totalChange);

    console.log('\n📋 Affected Products:');
    previewData.affectedProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.productName} (${product.productCode})`);
      console.log(`   Brand: ${product.brand}, Category: ${product.category}`);
      console.log(`   Current: ₹${product.currentPrice} → New: ₹${product.newPrice} (Change: ₹${product.change})`);
    });

    console.log('\n✅ Backend logic should now work correctly!');
    console.log('🎯 Expected frontend behavior:');
    console.log('   - Preview modal should show 2 products');
    console.log('   - Total change should be around ₹79.8');
    console.log('   - Products: brook rg sink cock, vine angle cock');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testCompleteBulkPreviewFlow();