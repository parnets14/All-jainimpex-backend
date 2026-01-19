import mongoose from 'mongoose';
import Product from './models/Product.js';
import dotenv from 'dotenv';

dotenv.config();

const checkProductHierarchy = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected');

    // Get all active products and their hierarchy
    const products = await Product.find({ isActive: true })
      .select('itemName itemCode brandId categoryId subcategoryId extendedSubcategoryId')
      .lean();

    console.log(`\n📦 Found ${products.length} active products`);
    
    // Analyze hierarchy distribution
    const brandIds = new Set();
    const categoryIds = new Set();
    const subcategoryIds = new Set();
    const extendedIds = new Set();
    
    console.log('\n📊 PRODUCT HIERARCHY ANALYSIS:');
    products.forEach((product, index) => {
      console.log(`\n${index + 1}. ${product.itemName} (${product.itemCode})`);
      console.log(`   brandId: ${product.brandId || 'NULL'}`);
      console.log(`   categoryId: ${product.categoryId || 'NULL'}`);
      console.log(`   subcategoryId: ${product.subcategoryId || 'NULL'}`);
      console.log(`   extendedSubcategoryId: ${product.extendedSubcategoryId || 'NULL'}`);
      
      if (product.brandId) brandIds.add(product.brandId.toString());
      if (product.categoryId) categoryIds.add(product.categoryId.toString());
      if (product.subcategoryId) subcategoryIds.add(product.subcategoryId.toString());
      if (product.extendedSubcategoryId) extendedIds.add(product.extendedSubcategoryId.toString());
    });
    
    console.log('\n📊 UNIQUE HIERARCHY IDs IN PRODUCTS:');
    console.log('Unique Brand IDs:', Array.from(brandIds));
    console.log('Unique Category IDs:', Array.from(categoryIds));
    console.log('Unique Subcategory IDs:', Array.from(subcategoryIds));
    console.log('Unique Extended IDs:', Array.from(extendedIds));
    
    // Check against dealer's allowed IDs
    const dealerAllowedBrands = ['6968f3465eb9746eb301e6e2'];
    const dealerAllowedCategories = ['6968f3665eb9746eb301e705'];
    const dealerAllowedSubcategories = ['6969e99cb7dee0bae2983d11', '6969e94ab7dee0bae2983d03'];
    const dealerAllowedExtended = ['6969ea82b7dee0bae2983da8', '6969ebcdb7dee0bae2983dde'];
    
    console.log('\n🔍 DEALER vs PRODUCT MATCHING:');
    console.log('Dealer Brand IDs:', dealerAllowedBrands);
    console.log('Products with matching brands:', dealerAllowedBrands.filter(id => brandIds.has(id)));
    
    console.log('Dealer Category IDs:', dealerAllowedCategories);
    console.log('Products with matching categories:', dealerAllowedCategories.filter(id => categoryIds.has(id)));
    
    console.log('Dealer Subcategory IDs:', dealerAllowedSubcategories);
    console.log('Products with matching subcategories:', dealerAllowedSubcategories.filter(id => subcategoryIds.has(id)));
    
    console.log('Dealer Extended IDs:', dealerAllowedExtended);
    console.log('Products with matching extended:', dealerAllowedExtended.filter(id => extendedIds.has(id)));
    
    // Check if any products have NULL hierarchy fields
    const productsWithNullBrand = products.filter(p => !p.brandId).length;
    const productsWithNullCategory = products.filter(p => !p.categoryId).length;
    const productsWithNullSubcategory = products.filter(p => !p.subcategoryId).length;
    const productsWithNullExtended = products.filter(p => !p.extendedSubcategoryId).length;
    
    console.log('\n⚠️ PRODUCTS WITH NULL HIERARCHY:');
    console.log(`Products with NULL brandId: ${productsWithNullBrand}`);
    console.log(`Products with NULL categoryId: ${productsWithNullCategory}`);
    console.log(`Products with NULL subcategoryId: ${productsWithNullSubcategory}`);
    console.log(`Products with NULL extendedSubcategoryId: ${productsWithNullExtended}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ MongoDB disconnected');
  }
};

checkProductHierarchy();