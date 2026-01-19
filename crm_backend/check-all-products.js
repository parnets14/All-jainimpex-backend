import mongoose from 'mongoose';
import Product from './models/Product.js';
import dotenv from 'dotenv';

dotenv.config();

const checkAllProducts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected');

    // Get ALL products (regardless of isActive status)
    const allProducts = await Product.find({})
      .select('itemName itemCode isActive brandId categoryId subcategoryId extendedSubcategoryId')
      .lean();

    console.log(`\n📦 Found ${allProducts.length} total products`);
    
    // Check isActive distribution
    const activeProducts = allProducts.filter(p => p.isActive === true);
    const inactiveProducts = allProducts.filter(p => p.isActive === false);
    const undefinedActiveProducts = allProducts.filter(p => p.isActive === undefined);
    
    console.log(`✅ Active products (isActive: true): ${activeProducts.length}`);
    console.log(`❌ Inactive products (isActive: false): ${inactiveProducts.length}`);
    console.log(`❓ Undefined isActive: ${undefinedActiveProducts.length}`);
    
    // Show first few products with their isActive status
    console.log('\n📊 SAMPLE PRODUCTS:');
    allProducts.slice(0, 10).forEach((product, index) => {
      console.log(`${index + 1}. ${product.itemName} (${product.itemCode})`);
      console.log(`   isActive: ${product.isActive}`);
      console.log(`   brandId: ${product.brandId || 'NULL'}`);
      console.log(`   categoryId: ${product.categoryId || 'NULL'}`);
    });
    
    // If there are products but none are active, let's see what we can do
    if (allProducts.length > 0 && activeProducts.length === 0) {
      console.log('\n⚠️ ISSUE FOUND: Products exist but none are marked as active!');
      console.log('This explains why the dealer access control returns 0 products.');
      
      // Check if products have isActive field at all
      const productsWithIsActiveField = allProducts.filter(p => p.hasOwnProperty('isActive'));
      console.log(`Products with isActive field: ${productsWithIsActiveField.length}`);
      
      if (productsWithIsActiveField.length === 0) {
        console.log('💡 SOLUTION: Products don\'t have isActive field. Need to add it or modify the query.');
      } else {
        console.log('💡 SOLUTION: Products have isActive field but all are set to false. Need to activate them.');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ MongoDB disconnected');
  }
};

checkAllProducts();