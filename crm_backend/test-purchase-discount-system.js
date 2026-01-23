import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PurchaseDiscountMapping from './models/PurchaseDiscountMapping.js';
import User from './models/User.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Supplier from './models/Supplier.js';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

const testPurchaseDiscountSystem = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get a user for creating discounts
    const user = await User.findOne();
    if (!user) {
      console.log('❌ No users found');
      return;
    }

    console.log(`👤 Using user: ${user.name}`);

    // Get some test data
    const brand = await Brand.findOne();
    const category = await Category.findOne();
    const supplier = await Supplier.findOne();

    console.log('\n🧪 Testing Purchase Discount System...\n');

    // Test 1: Create a simple direct discount
    console.log('📝 Test 1: Creating direct purchase discount...');
    const directDiscount = new PurchaseDiscountMapping({
      discountName: 'Bulk Purchase Discount - TRUFLO',
      description: 'Direct discount for TRUFLO brand bulk purchases',
      brand: brand?._id,
      suppliers: supplier ? [supplier._id] : [],
      directDiscountPercentage: 5,
      floatingDiscountEnabled: false,
      validFrom: new Date(),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      createdBy: user._id
    });

    await directDiscount.save();
    console.log('✅ Direct discount created:', directDiscount.discountName);

    // Test 2: Create a floating discount
    console.log('\n📝 Test 2: Creating floating purchase discount...');
    const floatingDiscount = new PurchaseDiscountMapping({
      discountName: 'Negotiable Purchase Discount - Category Wide',
      description: 'Floating discount for category-wide purchases',
      category: category?._id,
      directDiscountPercentage: 2, // Base discount
      floatingDiscountEnabled: true,
      floatingDiscountMin: 1,
      floatingDiscountMax: 15,
      validFrom: new Date(),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      createdBy: user._id
    });

    await floatingDiscount.save();
    console.log('✅ Floating discount created:', floatingDiscount.discountName);

    // Test 3: Test the static method to find applicable discounts
    console.log('\n📝 Test 3: Testing findApplicableDiscounts method...');
    
    // We need a product ID to test this - let's find one
    const testProduct = await Product.findOne().populate('brand category');
    
    if (testProduct) {
      console.log(`🔍 Testing with product: ${testProduct.itemName}`);
      console.log(`   Brand: ${testProduct.brand?.name || 'None'}`);
      console.log(`   Category: ${testProduct.category?.name || 'None'}`);
      
      const applicableDiscounts = await PurchaseDiscountMapping.findApplicableDiscounts(
        testProduct._id, 
        supplier?._id
      );
      
      console.log(`📊 Found ${applicableDiscounts.length} applicable discounts:`);
      applicableDiscounts.forEach((discount, index) => {
        console.log(`  ${index + 1}. ${discount.discountName}`);
        console.log(`     Direct: ${discount.directDiscountPercentage}%`);
        if (discount.floatingDiscountEnabled) {
          console.log(`     Floating: ${discount.floatingDiscountMin}%-${discount.floatingDiscountMax}%`);
        }
        console.log(`     Valid: ${discount.isCurrentlyValid() ? 'Yes' : 'No'}`);
      });
    }

    // Test 4: Test virtual field
    console.log('\n📝 Test 4: Testing virtual fields...');
    const allDiscounts = await PurchaseDiscountMapping.find({})
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('suppliers', 'name');
    
    console.log(`📊 All purchase discounts (${allDiscounts.length}):`);
    allDiscounts.forEach((discount, index) => {
      console.log(`  ${index + 1}. ${discount.discountName}`);
      console.log(`     Summary: ${discount.discountSummary}`);
      console.log(`     Target: ${discount.brand?.name || discount.category?.name || 'General'}`);
      console.log(`     Suppliers: ${discount.suppliers.map(s => s.name).join(', ') || 'All'}`);
    });

    // Test 5: Test API endpoint simulation
    console.log('\n📝 Test 5: Simulating API endpoints...');
    
    // Simulate GET /api/purchase-discounts
    const allDiscountsAPI = await PurchaseDiscountMapping.find({})
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('suppliers', 'name code')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    console.log(`📡 GET /api/purchase-discounts - ${allDiscountsAPI.length} records`);
    
    // Simulate filter options
    const [brands, categories, suppliers] = await Promise.all([
      Brand.find({ isActive: true }).select('name').sort({ name: 1 }),
      Category.find({ isActive: true }).select('name').sort({ name: 1 }),
      Supplier.find({ isActive: true }).select('name code').sort({ name: 1 })
    ]);
    
    console.log(`📡 GET /api/purchase-discounts/filter-options:`);
    console.log(`   Brands: ${brands.length}`);
    console.log(`   Categories: ${categories.length}`);
    console.log(`   Suppliers: ${suppliers.length}`);

    console.log('\n✅ Purchase Discount System Test Complete!');
    console.log('\n💡 Next Steps:');
    console.log('  1. Frontend form now supports purchase discounts');
    console.log('  2. API endpoints are ready');
    console.log('  3. Can integrate with Purchase Order Management');
    console.log('  4. Can integrate with Supplier Invoice creation');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the test
testPurchaseDiscountSystem();