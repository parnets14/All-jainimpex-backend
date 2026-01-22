import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';

dotenv.config();

async function investigateProductHierarchyIssue() {
  try {
    console.log('🔍 Investigating Product Hierarchy Issue...');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB Atlas');
    
    // Find the specific product mentioned in screenshot (052151)
    console.log('\n📦 Checking specific product: 052151');
    const suspiciousProduct = await Product.findOne({ productCode: '052151' })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subcategory1', 'name')
      .populate('subcategory2', 'name')
      .populate('subcategory3', 'name')
      .populate('subcategory4', 'name')
      .populate('subcategory5', 'name');
    
    if (suspiciousProduct) {
      console.log('📊 Product Details:');
      console.log(`  Code: ${suspiciousProduct.productCode}`);
      console.log(`  Name: ${suspiciousProduct.itemName}`);
      console.log(`  Brand: ${suspiciousProduct.brand?.name || 'NULL'} (ID: ${suspiciousProduct.brand})`);
      console.log(`  Category: ${suspiciousProduct.category?.name || 'NULL'} (ID: ${suspiciousProduct.category})`);
      console.log(`  Subcategory: ${suspiciousProduct.subcategory?.name || 'NULL'} (ID: ${suspiciousProduct.subcategory})`);
      console.log(`  Level 1: ${suspiciousProduct.subcategory1?.name || 'NULL'} (ID: ${suspiciousProduct.subcategory1})`);
      console.log(`  Level 2: ${suspiciousProduct.subcategory2?.name || 'NULL'} (ID: ${suspiciousProduct.subcategory2})`);
      console.log(`  Level 3: ${suspiciousProduct.subcategory3?.name || 'NULL'} (ID: ${suspiciousProduct.subcategory3})`);
      console.log(`  Level 4: ${suspiciousProduct.subcategory4?.name || 'NULL'} (ID: ${suspiciousProduct.subcategory4})`);
      console.log(`  Level 5: ${suspiciousProduct.subcategory5?.name || 'NULL'} (ID: ${suspiciousProduct.subcategory5})`);
    } else {
      console.log('❌ Product 052151 not found');
    }
    
    // Check all products with "Test Category"
    console.log('\n📊 Checking all products with Test Category...');
    const testCategoryProducts = await Product.find({})
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subcategory1', 'name')
      .populate('subcategory2', 'name')
      .populate('subcategory3', 'name')
      .populate('subcategory4', 'name')
      .populate('subcategory5', 'name');
    
    const testProducts = testCategoryProducts.filter(p => 
      p.category?.name === 'Test Category' || 
      p.category?.name?.includes('Test')
    );
    
    console.log(`Found ${testProducts.length} products with Test Category:`);
    testProducts.forEach((product, index) => {
      console.log(`\n${index + 1}. ${product.productCode} - ${product.itemName}`);
      console.log(`   Brand: ${product.brand?.name || 'NULL'}`);
      console.log(`   Category: ${product.category?.name || 'NULL'}`);
      console.log(`   Subcategory: ${product.subcategory?.name || 'NULL'}`);
      console.log(`   Level 1: ${product.subcategory1?.name || 'NULL'}`);
      console.log(`   Level 2: ${product.subcategory2?.name || 'NULL'}`);
      console.log(`   Level 3: ${product.subcategory3?.name || 'NULL'}`);
      console.log(`   Level 4: ${product.subcategory4?.name || 'NULL'}`);
      console.log(`   Level 5: ${product.subcategory5?.name || 'NULL'}`);
    });
    
    // Check if "Test Category" exists in categories
    console.log('\n📊 Checking Category Master...');
    const testCategory = await Category.findOne({ name: 'Test Category' });
    if (testCategory) {
      console.log('✅ Test Category exists:', testCategory.name, '(ID:', testCategory._id, ')');
    } else {
      console.log('❌ Test Category NOT found in Category Master');
      
      // Check all categories
      const allCategories = await Category.find({});
      console.log(`📊 Available categories (${allCategories.length}):`);
      allCategories.forEach(cat => {
        console.log(`  - ${cat.name} (ID: ${cat._id})`);
      });
    }
    
    // Check if "Test Subcategory" exists
    console.log('\n📊 Checking Subcategory Master...');
    const testSubcategory = await Subcategory.findOne({ name: 'Test Subcategory' });
    if (testSubcategory) {
      console.log('✅ Test Subcategory exists:', testSubcategory.name, '(ID:', testSubcategory._id, ')');
      console.log('   Parent Category:', testSubcategory.category);
    } else {
      console.log('❌ Test Subcategory NOT found in Subcategory Master');
      
      // Check all subcategories
      const allSubcategories = await Subcategory.find({}).populate('category', 'name');
      console.log(`📊 Available subcategories (${allSubcategories.length}):`);
      allSubcategories.forEach(sub => {
        console.log(`  - ${sub.name} (Category: ${sub.category?.name || 'NULL'}) (ID: ${sub._id})`);
      });
    }
    
    // Check Extended Subcategories
    console.log('\n📊 Checking Extended Subcategories...');
    const luxBrooklyn = await ExtendedSubcategory.findOne({ name: 'lux brooklyn' });
    const luxRoseBrooklyn = await ExtendedSubcategory.findOne({ name: 'lux rose brooklyn' });
    
    if (luxBrooklyn) {
      console.log('✅ "lux brooklyn" exists in ExtendedSubcategory');
      console.log('   ID:', luxBrooklyn._id);
      console.log('   Parent Subcategory:', luxBrooklyn.subcategory);
      console.log('   Level:', luxBrooklyn.level);
    } else {
      console.log('❌ "lux brooklyn" NOT found in ExtendedSubcategory');
    }
    
    if (luxRoseBrooklyn) {
      console.log('✅ "lux rose brooklyn" exists in ExtendedSubcategory');
      console.log('   ID:', luxRoseBrooklyn._id);
      console.log('   Parent:', luxRoseBrooklyn.parentExtendedSubcategory || luxRoseBrooklyn.subcategory);
      console.log('   Level:', luxRoseBrooklyn.level);
    } else {
      console.log('❌ "lux rose brooklyn" NOT found in ExtendedSubcategory');
    }
    
    // Check for orphaned references
    console.log('\n🔍 Checking for orphaned references...');
    const allProducts = await Product.find({});
    let orphanedCount = 0;
    
    for (const product of allProducts) {
      let hasOrphaned = false;
      
      // Check category reference
      if (product.category) {
        const categoryExists = await Category.findById(product.category);
        if (!categoryExists) {
          console.log(`❌ Product ${product.productCode} has orphaned category: ${product.category}`);
          hasOrphaned = true;
        }
      }
      
      // Check subcategory reference
      if (product.subcategory) {
        const subcategoryExists = await Subcategory.findById(product.subcategory);
        if (!subcategoryExists) {
          console.log(`❌ Product ${product.productCode} has orphaned subcategory: ${product.subcategory}`);
          hasOrphaned = true;
        }
      }
      
      // Check extended subcategory references
      if (product.subcategory1) {
        const level1Exists = await ExtendedSubcategory.findById(product.subcategory1);
        if (!level1Exists) {
          console.log(`❌ Product ${product.productCode} has orphaned subcategory1: ${product.subcategory1}`);
          hasOrphaned = true;
        }
      }
      
      if (product.subcategory2) {
        const level2Exists = await ExtendedSubcategory.findById(product.subcategory2);
        if (!level2Exists) {
          console.log(`❌ Product ${product.productCode} has orphaned subcategory2: ${product.subcategory2}`);
          hasOrphaned = true;
        }
      }
      
      if (product.subcategory3) {
        const level3Exists = await ExtendedSubcategory.findById(product.subcategory3);
        if (!level3Exists) {
          console.log(`❌ Product ${product.productCode} has orphaned subcategory3: ${product.subcategory3}`);
          hasOrphaned = true;
        }
      }
      
      if (product.subcategory4) {
        const level4Exists = await ExtendedSubcategory.findById(product.subcategory4);
        if (!level4Exists) {
          console.log(`❌ Product ${product.productCode} has orphaned subcategory4: ${product.subcategory4}`);
          hasOrphaned = true;
        }
      }
      
      if (product.subcategory5) {
        const level5Exists = await ExtendedSubcategory.findById(product.subcategory5);
        if (!level5Exists) {
          console.log(`❌ Product ${product.productCode} has orphaned subcategory5: ${product.subcategory5}`);
          hasOrphaned = true;
        }
      }
      
      if (hasOrphaned) {
        orphanedCount++;
      }
    }
    
    console.log(`\n📊 Summary: ${orphanedCount} products have orphaned references`);
    
  } catch (error) {
    console.error('❌ Investigation failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

investigateProductHierarchyIssue();