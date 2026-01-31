import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DiscountMapping from './models/DiscountMapping.js';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

async function checkDealerSpecificDiscountLocations() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 CHECKING DEALER-SPECIFIC DISCOUNT LOCATIONS');
    console.log('='.repeat(60));

    // 1. Check DiscountMapping collection
    console.log('\n📊 DISCOUNT MAPPINGS:');
    const dealerDiscountCount = await DiscountMapping.countDocuments();
    console.log(`Total discount mappings: ${dealerDiscountCount}`);

    if (dealerDiscountCount > 0) {
      const sampleDiscounts = await DiscountMapping.find()
        .populate('product', 'productName productCode')
        .populate('brand', 'name')
        .populate('category', 'name')
        .populate('subcategory', 'name')
        .limit(5);
      
      console.log('\nSample discount mappings:');
      sampleDiscounts.forEach(discount => {
        console.log(`  - Target Type: ${discount.targetType}`);
        console.log(`    Discount Name: ${discount.discountName}`);
        console.log(`    Discount Type: ${discount.discountType}`);
        console.log(`    Mapping Type: ${discount.mappingType}`);
        if (discount.product) console.log(`    Product: ${discount.product.productName} (${discount.product.productCode})`);
        if (discount.brand) console.log(`    Brand: ${discount.brand.name}`);
        if (discount.category) console.log(`    Category: ${discount.category.name}`);
        if (discount.subcategory) console.log(`    Subcategory: ${discount.subcategory.name}`);
        if (discount.directDiscountPercentage) console.log(`    Direct Discount: ${discount.directDiscountPercentage}%`);
        console.log(`    Status: ${discount.status}`);
        console.log('    ---');
      });
    }

    // 2. Check Products with dealer-specific pricing
    console.log('\n📊 PRODUCTS WITH DEALER-SPECIFIC DATA:');
    const productCount = await Product.countDocuments();
    console.log(`Total products: ${productCount}`);

    // Check if products have dealer-specific fields
    const productsWithDealerFields = await Product.find({
      $or: [
        { dealerPrice: { $exists: true, $ne: null } },
        { dealerDiscount: { $exists: true, $ne: null } },
        { 'pricing.dealer': { $exists: true } }
      ]
    }).limit(5);

    console.log(`Products with dealer-specific fields: ${productsWithDealerFields.length}`);
    if (productsWithDealerFields.length > 0) {
      productsWithDealerFields.forEach(product => {
        console.log(`  - ${product.productName} (${product.productCode})`);
        if (product.dealerPrice) console.log(`    Dealer Price: ${product.dealerPrice}`);
        if (product.dealerDiscount) console.log(`    Dealer Discount: ${product.dealerDiscount}%`);
        if (product.pricing?.dealer) console.log(`    Dealer Pricing: ${JSON.stringify(product.pricing.dealer)}`);
      });
    }

    // 3. Check Dealers with discount information
    console.log('\n📊 DEALERS WITH DISCOUNT DATA:');
    const dealerCount = await Dealer.countDocuments();
    console.log(`Total dealers: ${dealerCount}`);

    const dealersWithDiscounts = await Dealer.find({
      $or: [
        { defaultDiscount: { $exists: true, $ne: null } },
        { discountPercentage: { $exists: true, $ne: null } },
        { 'discounts': { $exists: true, $ne: [] } }
      ]
    }).limit(5);

    console.log(`Dealers with discount fields: ${dealersWithDiscounts.length}`);
    if (dealersWithDiscounts.length > 0) {
      dealersWithDiscounts.forEach(dealer => {
        console.log(`  - ${dealer.name} (${dealer.email})`);
        if (dealer.defaultDiscount) console.log(`    Default Discount: ${dealer.defaultDiscount}%`);
        if (dealer.discountPercentage) console.log(`    Discount Percentage: ${dealer.discountPercentage}%`);
        if (dealer.discounts) console.log(`    Discounts Array: ${dealer.discounts.length} items`);
      });
    }

    // 4. Check for discount-related collections
    console.log('\n📊 DISCOUNT-RELATED COLLECTIONS:');
    
    // Check all collections that might contain discount data
    const collections = await mongoose.connection.db.listCollections().toArray();
    const discountCollections = collections.filter(col => 
      col.name.toLowerCase().includes('discount') || 
      col.name.toLowerCase().includes('pricing')
    );

    console.log('Discount-related collections:');
    for (const col of discountCollections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`  - ${col.name}: ${count} documents`);
    }

    // 5. Check specific discount types
    console.log('\n📊 DISCOUNT TYPES ANALYSIS:');
    if (dealerDiscountCount > 0) {
      const discountTypes = await DiscountMapping.aggregate([
        { $group: { _id: '$discountType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      console.log('Discount types:');
      discountTypes.forEach(type => {
        console.log(`  - ${type._id}: ${type.count} mappings`);
      });

      // Check mapping types (sales vs purchase)
      const mappingTypes = await DiscountMapping.aggregate([
        { $group: { _id: '$mappingType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      console.log('\nMapping types:');
      mappingTypes.forEach(type => {
        console.log(`  - ${type._id}: ${type.count} mappings`);
      });

      // Check target types
      const targetTypes = await DiscountMapping.aggregate([
        { $group: { _id: '$targetType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      console.log('\nTarget types:');
      targetTypes.forEach(type => {
        console.log(`  - ${type._id}: ${type.count} mappings`);
      });

      // Check discount status
      const discountStatuses = await DiscountMapping.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      console.log('\nDiscount statuses:');
      discountStatuses.forEach(status => {
        console.log(`  - ${status._id}: ${status.count} mappings`);
      });
    }

    console.log('\n🔍 EXPECTED LOCATIONS FOR DEALER DISCOUNTS:');
    console.log('1. Product Master - Should show dealer-specific pricing/discounts');
    console.log('2. Dealer Master - Should show discount configuration for dealers');
    console.log('3. Dealer Discount Management - Main discount management interface');
    console.log('4. Sales Order - Should apply dealer discounts during order creation');
    console.log('5. Dealer Invoice - Should show applied discounts');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDealerSpecificDiscountLocations();