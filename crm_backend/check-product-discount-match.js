import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const ProductSchema = new mongoose.Schema({}, { strict: false, collection: 'products' });
const Product = mongoose.model('Product', ProductSchema);

const DiscountMappingSchema = new mongoose.Schema({}, { strict: false, collection: 'discountmappings' });
const DiscountMapping = mongoose.model('DiscountMapping', DiscountMappingSchema);

async function checkProductDiscountMatch() {
  try {
    const mongoUri = process.env.MONGO_URL;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get the product from SO-2026-0002
    const productId = '69673b5ec4463d5f9e75299d';
    const product = await Product.findById(productId);
    
    if (!product) {
      console.log('❌ Product not found');
      return;
    }

    console.log('\n📦 Product Details:');
    console.log('Product Name:', product.itemName);
    console.log('Product Code:', product.productCode);
    console.log('Category ID:', product.category);
    console.log('Subcategory ID:', product.subcategory);
    console.log('Brand ID:', product.brand);

    // Get all approved discount mappings
    const discounts = await DiscountMapping.find({ 
      status: 'Approved',
      isActive: true,
      mappingType: 'sales'
    });
    
    console.log(`\n🔍 Checking ${discounts.length} discount mappings for matches...\n`);
    
    let matchFound = false;
    
    for (const discount of discounts) {
      let matches = false;
      let matchType = '';
      
      // Check product match
      if (discount.targetType === 'product' && discount.product) {
        if (discount.product.toString() === productId) {
          matches = true;
          matchType = 'Product-specific';
        }
      }
      
      // Check brand match
      if (discount.targetType === 'brand' && discount.brand && product.brand) {
        if (discount.brand.toString() === product.brand.toString()) {
          matches = true;
          matchType = 'Brand-based';
        }
      }
      
      // Check subcategory match
      if (discount.targetType === 'subcategory' && discount.subcategory && product.subcategory) {
        if (discount.subcategory.toString() === product.subcategory.toString()) {
          matches = true;
          matchType = 'Subcategory-based';
        }
      }
      
      // Check category match
      if (discount.targetType === 'category' && discount.category && product.category) {
        if (discount.category.toString() === product.category.toString()) {
          matches = true;
          matchType = 'Category-based';
        }
      }
      
      if (matches) {
        matchFound = true;
        console.log(`✅ MATCH FOUND: ${discount.discountName}`);
        console.log(`   Match Type: ${matchType}`);
        console.log(`   Discount Type: ${discount.discountType}`);
        console.log(`   Direct Discount: ${discount.directDiscountPercentage}%`);
        if (discount.levels && discount.levels.length > 0) {
          console.log(`   Levels:`, discount.levels.map(l => `${l.levelName}=${l.discountPercentage}%`).join(', '));
        }
        console.log(`   Valid: ${discount.validFrom} to ${discount.validTo}`);
        console.log('');
      }
    }
    
    if (!matchFound) {
      console.log('❌ No matching discount found for this product');
      console.log('\n💡 Possible reasons:');
      console.log('   1. Product category/subcategory/brand doesn\'t match any discount mapping');
      console.log('   2. Discount mapping exists but is not Approved');
      console.log('   3. Discount mapping is expired or not yet valid');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkProductDiscountMatch();
