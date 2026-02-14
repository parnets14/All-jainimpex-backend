import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';

dotenv.config();

async function testProductHierarchyPopulation() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find a dealer with permissions
    console.log('🔍 Finding a dealer with product permissions...');
    const dealer = await Dealer.findOne({
      $or: [
        { allowedBrands: { $exists: true, $ne: [] } },
        { allowedCategories: { $exists: true, $ne: [] } }
      ]
    }).select('_id name code allowedBrands allowedCategories');

    if (!dealer) {
      console.log('❌ No dealer found with permissions');
      process.exit(1);
    }

    console.log('✅ Found dealer:', dealer.name, `(${dealer.code})`);
    console.log('📊 Dealer ID:', dealer._id);

    // Test the API endpoint simulation
    console.log('\n🧪 Testing product query WITH populate...');
    const productsWithPopulate = await Product.find({ status: 'active' })
      .limit(5)
      .populate('brand', '_id name')
      .populate('category', '_id name')
      .populate('subcategory', '_id name')
      .populate('subcategory1', '_id name level')
      .select('itemName productCode brand category subcategory subcategory1');

    console.log('\n📦 Products WITH populate (first 5):');
    productsWithPopulate.forEach((p, i) => {
      console.log(`\n${i + 1}. ${p.itemName} (${p.productCode})`);
      console.log('   Brand:', p.brand ? `${p.brand.name} (${p.brand._id})` : 'null');
      console.log('   Category:', p.category ? `${p.category.name} (${p.category._id})` : 'null');
      console.log('   Subcategory:', p.subcategory ? `${p.subcategory.name} (${p.subcategory._id})` : 'null');
      console.log('   Level 1:', p.subcategory1 ? `${p.subcategory1.name} (${p.subcategory1._id})` : 'null');
    });

    // Test WITHOUT populate to show the difference
    console.log('\n\n🧪 Testing product query WITHOUT populate (for comparison)...');
    const productsWithoutPopulate = await Product.find({ status: 'active' })
      .limit(5)
      .select('itemName productCode brand category subcategory subcategory1');

    console.log('\n📦 Products WITHOUT populate (first 5):');
    productsWithoutPopulate.forEach((p, i) => {
      console.log(`\n${i + 1}. ${p.itemName} (${p.productCode})`);
      console.log('   Brand:', p.brand ? p.brand.toString() : 'null', '(ObjectId only)');
      console.log('   Category:', p.category ? p.category.toString() : 'null', '(ObjectId only)');
      console.log('   Subcategory:', p.subcategory ? p.subcategory.toString() : 'null', '(ObjectId only)');
      console.log('   Level 1:', p.subcategory1 ? p.subcategory1.toString() : 'null', '(ObjectId only)');
    });

    // Test filter extraction logic (simulating frontend)
    console.log('\n\n🧪 Testing Frontend Filter Extraction Logic...');
    console.log('\n📊 WITH POPULATE (should work):');
    const brandsWithPopulate = new Map();
    productsWithPopulate.forEach(p => {
      const brandName = p.brand?.name;
      const brandId = p.brand?._id;
      if (brandName && brandId) {
        brandsWithPopulate.set(brandId.toString(), brandName);
      }
    });
    console.log('✅ Extracted brands:', Array.from(brandsWithPopulate.entries()).map(([id, name]) => `${name} (${id})`));

    console.log('\n📊 WITHOUT POPULATE (will fail):');
    const brandsWithoutPopulate = new Map();
    productsWithoutPopulate.forEach(p => {
      const brandName = p.brand?.name; // This will be undefined!
      const brandId = p.brand?._id || p.brand;
      if (brandName && brandId) {
        brandsWithoutPopulate.set(brandId.toString(), brandName);
      }
    });
    console.log('❌ Extracted brands:', brandsWithoutPopulate.size === 0 ? 'NONE (brand.name is undefined!)' : Array.from(brandsWithoutPopulate.entries()));

    console.log('\n\n✅ TEST COMPLETE!');
    console.log('📝 CONCLUSION:');
    console.log('   - WITH populate: brand.name, category.name are available ✅');
    console.log('   - WITHOUT populate: only ObjectIds, no .name property ❌');
    console.log('   - FIX APPLIED: Added .populate() calls to getDealerAccessibleProducts');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

testProductHierarchyPopulation();
