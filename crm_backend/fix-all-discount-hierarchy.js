import mongoose from 'mongoose';
import DiscountMapping from './models/DiscountMapping.js';
import Subcategory from './models/Subcategory.js';
import Category from './models/Category.js';
import Brand from './models/Brand.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Product from './models/Product.js';
import dotenv from 'dotenv';

dotenv.config();

const fixAllDiscountHierarchy = async () => {
  try {
    console.log('🔧 Fixing all discount hierarchy data...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Find all discount mappings
    const discounts = await DiscountMapping.find({})
      .populate('brand category subcategory extendedSubcategory1 extendedSubcategory2 product');
    
    console.log(`\n📊 Found ${discounts.length} discount mappings to check`);
    
    let fixedCount = 0;
    
    for (const discount of discounts) {
      console.log(`\n🔍 Checking discount: ${discount.discountName} (${discount.targetType})`);
      
      const updateData = {};
      let needsUpdate = false;
      
      // Fix based on target type
      if (discount.targetType === 'subcategory' && discount.subcategory) {
        // Get subcategory with its hierarchy
        const subcategory = await Subcategory.findById(discount.subcategory._id)
          .populate('category brand');
        
        if (subcategory) {
          // Set brand if missing
          if (!discount.brand && subcategory.brand) {
            updateData.brand = subcategory.brand._id;
            console.log(`   Setting brand: ${subcategory.brand.name}`);
            needsUpdate = true;
          }
          
          // Set category if missing
          if (!discount.category && subcategory.category) {
            updateData.category = subcategory.category._id;
            console.log(`   Setting category: ${subcategory.category.name}`);
            needsUpdate = true;
          }
        }
      }
      
      else if (discount.targetType === 'category' && discount.category) {
        // Get category with its brand
        const category = await Category.findById(discount.category._id)
          .populate('brand');
        
        if (category) {
          // Set brand if missing
          if (!discount.brand && category.brand) {
            updateData.brand = category.brand._id;
            console.log(`   Setting brand: ${category.brand.name}`);
            needsUpdate = true;
          }
        }
      }
      
      else if (discount.targetType === 'extendedSubcategory1' && discount.extendedSubcategory1) {
        // Get extended subcategory with its hierarchy
        const extSub = await ExtendedSubcategory.findById(discount.extendedSubcategory1._id)
          .populate('brand category subcategory');
        
        if (extSub) {
          // Set brand if missing
          if (!discount.brand && extSub.brand) {
            updateData.brand = extSub.brand._id;
            console.log(`   Setting brand: ${extSub.brand.name}`);
            needsUpdate = true;
          }
          
          // Set category if missing
          if (!discount.category && extSub.category) {
            updateData.category = extSub.category._id;
            console.log(`   Setting category: ${extSub.category.name}`);
            needsUpdate = true;
          }
          
          // Set subcategory if missing
          if (!discount.subcategory && extSub.subcategory) {
            updateData.subcategory = extSub.subcategory._id;
            console.log(`   Setting subcategory: ${extSub.subcategory.name}`);
            needsUpdate = true;
          }
        }
      }
      
      else if (discount.targetType === 'extendedSubcategory2' && discount.extendedSubcategory2) {
        // Get extended subcategory level 2 with its hierarchy
        const extSub2 = await ExtendedSubcategory.findById(discount.extendedSubcategory2._id)
          .populate('brand category subcategory parentExtendedSubcategory');
        
        if (extSub2) {
          // Set brand if missing
          if (!discount.brand && extSub2.brand) {
            updateData.brand = extSub2.brand._id;
            console.log(`   Setting brand: ${extSub2.brand.name}`);
            needsUpdate = true;
          }
          
          // Set category if missing
          if (!discount.category && extSub2.category) {
            updateData.category = extSub2.category._id;
            console.log(`   Setting category: ${extSub2.category.name}`);
            needsUpdate = true;
          }
          
          // Set subcategory if missing
          if (!discount.subcategory && extSub2.subcategory) {
            updateData.subcategory = extSub2.subcategory._id;
            console.log(`   Setting subcategory: ${extSub2.subcategory.name}`);
            needsUpdate = true;
          }
          
          // Set extended subcategory 1 if missing
          if (!discount.extendedSubcategory1 && extSub2.parentExtendedSubcategory) {
            updateData.extendedSubcategory1 = extSub2.parentExtendedSubcategory._id;
            console.log(`   Setting extended subcategory 1: ${extSub2.parentExtendedSubcategory.name}`);
            needsUpdate = true;
          }
        }
      }
      
      else if (discount.targetType === 'product' && discount.product) {
        // Get product with its hierarchy
        const product = await Product.findById(discount.product._id)
          .populate('brand category subcategory');
        
        if (product) {
          // Set brand if missing
          if (!discount.brand && product.brand) {
            updateData.brand = product.brand._id;
            console.log(`   Setting brand: ${product.brand.name}`);
            needsUpdate = true;
          }
          
          // Set category if missing
          if (!discount.category && product.category) {
            updateData.category = product.category._id;
            console.log(`   Setting category: ${product.category.name}`);
            needsUpdate = true;
          }
          
          // Set subcategory if missing
          if (!discount.subcategory && product.subcategory) {
            updateData.subcategory = product.subcategory._id;
            console.log(`   Setting subcategory: ${product.subcategory.name}`);
            needsUpdate = true;
          }
        }
      }
      
      // Apply updates if needed
      if (needsUpdate) {
        await DiscountMapping.findByIdAndUpdate(discount._id, updateData);
        console.log(`   ✅ Updated discount: ${discount.discountName}`);
        fixedCount++;
      } else {
        console.log(`   ✅ Hierarchy already complete`);
      }
    }
    
    console.log(`\n🎯 Summary:`);
    console.log(`   Total discounts checked: ${discounts.length}`);
    console.log(`   Discounts fixed: ${fixedCount}`);
    console.log(`   Discounts already correct: ${discounts.length - fixedCount}`);
    
    if (fixedCount > 0) {
      console.log(`\n✅ Fixed ${fixedCount} discount mappings with incomplete hierarchy data`);
      console.log(`   The edit form should now work properly for all discounts`);
    } else {
      console.log(`\n✅ All discount mappings already have complete hierarchy data`);
    }
    
  } catch (error) {
    console.error('❌ Error fixing discount hierarchy:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

fixAllDiscountHierarchy();