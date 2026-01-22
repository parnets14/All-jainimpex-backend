import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import DiscountMapping from './models/DiscountMapping.js';
import Category from './models/Category.js';

dotenv.config();

const testDirectDiscountHierarchy = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Testing Direct Discount Hierarchy Logic...');

    // Check existing discount mappings
    const discountMappings = await DiscountMapping.find({ 
      status: 'Approved',
      isActive: true 
    }).populate('category brand subcategory', 'name');

    console.log(`\n📊 Found ${discountMappings.length} active discount mappings:`);
    discountMappings.forEach((mapping, index) => {
      console.log(`${index + 1}. ${mapping.discountName} (${mapping.targetType})`);
      console.log(`   Target: ${mapping.targetType === 'category' ? mapping.category?.name : 
                              mapping.targetType === 'brand' ? mapping.brand?.name :
                              mapping.targetType === 'subcategory' ? mapping.subcategory?.name : 'N/A'}`);
      console.log(`   Type: ${mapping.discountType}, Direct: ${mapping.directDiscountPercentage}%, Max: ${mapping.maxDiscountPercentage}%`);
    });

    // Test with "h cpvc fittings" category (from your screenshot)
    const hCpvcCategory = await Category.findOne({ 
      name: { $regex: /h.*cpvc.*fitting/i } 
    });
    
    if (hCpvcCategory) {
      console.log(`\n📦 Testing with category: ${hCpvcCategory.name} (${hCpvcCategory._id})`);
      
      // Find products in this category
      const productsInCategory = await Product.find({ 
        category: hCpvcCategory._id 
      });
      
      console.log(`📊 Found ${productsInCategory.length} products in "${hCpvcCategory.name}" category`);
      
      // Check if there's a discount mapping for this category
      const categoryDiscount = await DiscountMapping.findOne({
        targetType: 'category',
        category: hCpvcCategory._id,
        status: 'Approved',
        isActive: true
      });
      
      if (categoryDiscount) {
        console.log(`✅ Found category-level discount: ${categoryDiscount.discountName}`);
        console.log(`   Direct: ${categoryDiscount.directDiscountPercentage}%, Max: ${categoryDiscount.maxDiscountPercentage}%`);
        
        // Test findApplicableDiscounts for each product
        for (const product of productsInCategory) {
          console.log(`\n🔍 Testing product: ${product.itemName} (${product.productCode})`);
          
          const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
            product._id,
            'sales'
          );
          
          console.log(`   Found ${applicableDiscounts.length} applicable discounts`);
          if (applicableDiscounts.length > 0) {
            const discount = applicableDiscounts[0];
            console.log(`   ✅ Applicable discount: ${discount.discountName}`);
            console.log(`   Direct: ${discount.directDiscountPercentage}%, Max: ${discount.maxDiscountPercentage}%`);
            console.log(`   Should have hasDirectDiscount: ${discount.discountType === 'direct' || discount.discountType === 'both'}`);
          } else {
            console.log(`   ❌ No applicable discounts found`);
          }
          
          // Check current DealerPricing record
          const currentPricing = await DealerPricing.findOne({
            product: product._id,
            isActive: true
          });
          
          if (currentPricing) {
            console.log(`   Current DealerPricing: hasDirectDiscount=${currentPricing.hasDirectDiscount}, direct=${currentPricing.directDiscountPercentage}%`);
          } else {
            console.log(`   No DealerPricing record exists`);
          }
        }
      } else {
        console.log(`❌ No category-level discount found for "${hCpvcCategory.name}"`);
      }
    } else {
      console.log('❌ "h cpvc fittings" category not found');
    }

    // Show summary of current state
    console.log('\n📊 Current State Summary:');
    const totalProducts = await Product.countDocuments({});
    const totalPricing = await DealerPricing.countDocuments({ isActive: true });
    const productsWithDirectDiscount = await DealerPricing.countDocuments({ 
      isActive: true, 
      hasDirectDiscount: true 
    });
    
    console.log(`   Total products: ${totalProducts}`);
    console.log(`   Products with DealerPricing: ${totalPricing}`);
    console.log(`   Products with direct discount flag: ${productsWithDirectDiscount}`);
    console.log(`   Products missing from pricing: ${totalProducts - totalPricing}`);

    console.log('\n🎯 ISSUE ANALYSIS:');
    console.log('   1. Category-level discounts exist in DiscountMapping');
    console.log('   2. Products inherit discounts through hierarchy');
    console.log('   3. But only products with DealerPricing records show in filters');
    console.log('   4. Need to run "Update Discounts" to create missing DealerPricing records');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testDirectDiscountHierarchy();