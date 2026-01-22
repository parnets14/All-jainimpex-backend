import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';

dotenv.config();

async function fixProductHierarchyIntegrity() {
  try {
    console.log('🔧 Fixing Product Hierarchy Integrity Issues...');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB Atlas');
    
    // Find all products with extended subcategories
    const productsWithExtended = await Product.find({
      $or: [
        { subcategory1: { $exists: true, $ne: null } },
        { subcategory2: { $exists: true, $ne: null } },
        { subcategory3: { $exists: true, $ne: null } },
        { subcategory4: { $exists: true, $ne: null } },
        { subcategory5: { $exists: true, $ne: null } }
      ]
    }).populate('category', 'name').populate('subcategory', 'name');
    
    console.log(`\n📊 Found ${productsWithExtended.length} products with extended subcategories`);
    
    let fixedCount = 0;
    let issuesFound = 0;
    
    for (const product of productsWithExtended) {
      console.log(`\n🔍 Checking product: ${product.productCode} - ${product.itemName}`);
      console.log(`   Category: ${product.category?.name}`);
      console.log(`   Subcategory: ${product.subcategory?.name} (ID: ${product.subcategory})`);
      
      let hasIssues = false;
      const updates = {};
      
      // Check each extended subcategory level
      for (let level = 1; level <= 5; level++) {
        const fieldName = `subcategory${level}`;
        const extendedSubcategoryId = product[fieldName];
        
        if (extendedSubcategoryId) {
          console.log(`   Checking Level ${level}: ${extendedSubcategoryId}`);
          
          try {
            const extendedSubcategory = await ExtendedSubcategory.findById(extendedSubcategoryId);
            
            if (!extendedSubcategory) {
              console.log(`   ❌ Level ${level}: Extended subcategory not found - REMOVING`);
              updates[fieldName] = null;
              hasIssues = true;
            } else {
              console.log(`   ✅ Level ${level}: ${extendedSubcategory.name} (Level: ${extendedSubcategory.level})`);
              
              // Check if it belongs to the correct hierarchy
              let parentSubcategoryId = null;
              
              if (extendedSubcategory.level === 1) {
                // Level 1 should reference the product's subcategory
                parentSubcategoryId = extendedSubcategory.subcategory;
              } else {
                // Level 2+ should reference the parent extended subcategory
                const parentExtended = await ExtendedSubcategory.findById(extendedSubcategory.parentExtendedSubcategory);
                if (parentExtended) {
                  // Trace back to the root subcategory
                  let current = parentExtended;
                  while (current.parentExtendedSubcategory) {
                    current = await ExtendedSubcategory.findById(current.parentExtendedSubcategory);
                    if (!current) break;
                  }
                  parentSubcategoryId = current?.subcategory;
                }
              }
              
              if (parentSubcategoryId && parentSubcategoryId.toString() !== product.subcategory.toString()) {
                console.log(`   ❌ Level ${level}: Belongs to different subcategory (${parentSubcategoryId} vs ${product.subcategory}) - REMOVING`);
                updates[fieldName] = null;
                hasIssues = true;
              } else {
                console.log(`   ✅ Level ${level}: Hierarchy is correct`);
              }
            }
          } catch (error) {
            console.log(`   ❌ Level ${level}: Error checking - REMOVING`);
            updates[fieldName] = null;
            hasIssues = true;
          }
        }
      }
      
      if (hasIssues) {
        issuesFound++;
        console.log(`   🔧 Applying fixes...`);
        
        // Apply the updates
        await Product.findByIdAndUpdate(product._id, updates);
        fixedCount++;
        
        console.log(`   ✅ Fixed product ${product.productCode}`);
      } else {
        console.log(`   ✅ Product ${product.productCode} hierarchy is correct`);
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Products checked: ${productsWithExtended.length}`);
    console.log(`   Issues found: ${issuesFound}`);
    console.log(`   Products fixed: ${fixedCount}`);
    
    // Show the current state of Test Category products
    console.log(`\n📦 Current state of Test Category products:`);
    const testProducts = await Product.find({})
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subcategory1', 'name')
      .populate('subcategory2', 'name');
    
    const testCategoryProducts = testProducts.filter(p => 
      p.category?.name === 'Test Category'
    );
    
    testCategoryProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.productCode} - ${product.itemName}`);
      console.log(`   Category: ${product.category?.name}`);
      console.log(`   Subcategory: ${product.subcategory?.name}`);
      console.log(`   Level 1: ${product.subcategory1?.name || 'NULL'}`);
      console.log(`   Level 2: ${product.subcategory2?.name || 'NULL'}`);
    });
    
  } catch (error) {
    console.error('❌ Fix script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

fixProductHierarchyIntegrity();