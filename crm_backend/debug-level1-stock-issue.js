import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import models
import Product from './models/Product.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import GRN from './models/GRN.js';

async function debugLevel1StockIssue() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n=== DEBUGGING LEVEL 1 STOCK ISSUE ===\n');

    // 1. Find the level1 extended subcategory
    console.log('1. FINDING LEVEL1 EXTENDED SUBCATEGORY:');
    const level1ExtSub = await ExtendedSubcategory.findOne({ name: 'level1', level: 1 })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name');

    if (!level1ExtSub) {
      console.log('❌ Level1 extended subcategory not found!');
      return;
    }

    console.log(`✅ Found level1 extended subcategory:`);
    console.log(`   ID: ${level1ExtSub._id}`);
    console.log(`   Name: ${level1ExtSub.name}`);
    console.log(`   Level: ${level1ExtSub.level}`);
    console.log(`   Brand: ${level1ExtSub.brand?.name}`);
    console.log(`   Category: ${level1ExtSub.category?.name}`);
    console.log(`   Subcategory: ${level1ExtSub.subcategory?.name}`);

    // 2. Check what field name is used in Product model for extended subcategories
    console.log('\n2. CHECKING PRODUCT MODEL FIELDS:');
    const sampleProduct = await Product.findOne({});
    if (sampleProduct) {
      console.log('Sample product fields related to extended subcategories:');
      console.log(`   extendedSubcategory: ${sampleProduct.extendedSubcategory}`);
      console.log(`   subcategory1: ${sampleProduct.subcategory1}`);
      console.log(`   subcategory2: ${sampleProduct.subcategory2}`);
      console.log(`   subcategory3: ${sampleProduct.subcategory3}`);
      console.log(`   subcategory4: ${sampleProduct.subcategory4}`);
      console.log(`   subcategory5: ${sampleProduct.subcategory5}`);
    }

    // 3. Find products that should match this extended subcategory
    console.log('\n3. SEARCHING FOR PRODUCTS WITH LEVEL1 EXTENDED SUBCATEGORY:');
    
    // Try different field names that might be used for level 1 extended subcategories
    const possibleFields = [
      'extendedSubcategory',
      'subcategory1', 
      'level1',
      'extendedLevel1'
    ];

    let matchingProducts = [];
    
    for (const field of possibleFields) {
      console.log(`   Checking field: ${field}`);
      const products = await Product.find({ [field]: level1ExtSub._id });
      console.log(`     Found ${products.length} products`);
      
      if (products.length > 0) {
        matchingProducts = products;
        console.log(`     ✅ Products found using field: ${field}`);
        products.forEach(product => {
          console.log(`       - ${product.itemName} (${product.productCode})`);
        });
        break;
      }
    }

    if (matchingProducts.length === 0) {
      console.log('❌ No products found with level1 extended subcategory!');
      
      // Check what extended subcategories the existing products have
      console.log('\n4. CHECKING WHAT EXTENDED SUBCATEGORIES EXISTING PRODUCTS HAVE:');
      const allProducts = await Product.find({});
      console.log(`   Total products: ${allProducts.length}`);
      
      allProducts.forEach(product => {
        console.log(`   Product: ${product.itemName} (${product.productCode})`);
        console.log(`     extendedSubcategory: ${product.extendedSubcategory}`);
        console.log(`     subcategory1: ${product.subcategory1}`);
        console.log(`     subcategory2: ${product.subcategory2}`);
        console.log(`     brand: ${product.brand}`);
        console.log(`     category: ${product.category}`);
        console.log(`     subcategory: ${product.subcategory}`);
      });
      
      console.log('\n5. RECOMMENDATION:');
      console.log('   To fix this issue, you need to:');
      console.log('   1. Assign the level1 extended subcategory to some products');
      console.log('   2. Or create products that belong to this extended subcategory');
      console.log(`   3. Set the appropriate field (likely 'subcategory1') to: ${level1ExtSub._id}`);
      
    } else {
      // 4. Check if these products have stock (GRNs)
      console.log('\n4. CHECKING STOCK FOR MATCHING PRODUCTS:');
      
      for (const product of matchingProducts) {
        console.log(`   Product: ${product.itemName} (${product.productCode})`);
        
        const grns = await GRN.find({ 'items.productId': product._id })
          .populate('warehouseId', 'name')
          .populate('supplierId', 'name');
        
        console.log(`     GRNs found: ${grns.length}`);
        
        if (grns.length > 0) {
          grns.forEach(grn => {
            console.log(`       GRN: ${grn.grnNo} - Warehouse: ${grn.warehouseId?.name}`);
            grn.items.forEach(item => {
              if (item.productId.toString() === product._id.toString()) {
                console.log(`         Accepted Qty: ${item.acceptedQuantity}`);
              }
            });
          });
        } else {
          console.log(`       ❌ No GRNs found for this product`);
        }
      }
    }

    // 6. Test the exact stock API query that would be used
    console.log('\n6. TESTING STOCK API QUERY:');
    console.log(`   Simulating stock API call with extendedSubcategoryId: ${level1ExtSub._id}`);
    
    // This is what the stock controller should be doing
    const productQuery = {
      // Try different field names to see which one works
    };
    
    // Test each possible field
    for (const field of possibleFields) {
      productQuery[field] = level1ExtSub._id;
      const products = await Product.find(productQuery);
      console.log(`   Query with ${field}: ${products.length} products found`);
      delete productQuery[field];
    }

    // 7. Check the stock controller field mapping
    console.log('\n7. STOCK CONTROLLER FIELD MAPPING:');
    console.log('   The stock controller is using these field names:');
    console.log('   - extendedSubcategoryId -> productQuery.extendedSubcategory');
    console.log('   - level2Id -> productQuery.level2');
    console.log('');
    console.log('   But the actual Product model might use different field names!');
    console.log('   Common field names for extended subcategories:');
    console.log('   - subcategory1 (for level 1)');
    console.log('   - subcategory2 (for level 2)');
    console.log('   - subcategory3 (for level 3)');
    console.log('   - etc.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

debugLevel1StockIssue();