import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import User from './models/User.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

async function testAtlasDatabase() {
  try {
    console.log('🔍 Testing Atlas database...');
    
    // Connect to MongoDB Atlas
    const mongoUrl = process.env.MONGO_URL;
    console.log('🔗 Connecting to:', mongoUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
    
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected to MongoDB Atlas');
    
    // Get database name
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Database: ${dbName}`);
    
    // Check collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\n📁 Found ${collections.length} collections:`);
    
    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      console.log(`  - ${collection.name}: ${count} documents`);
    }
    
    // Check specific models
    console.log('\n🎯 Model counts:');
    const productCount = await Product.countDocuments();
    const pricingCount = await DealerPricing.countDocuments();
    const userCount = await User.countDocuments();
    const brandCount = await Brand.countDocuments();
    const categoryCount = await Category.countDocuments();
    const subcategoryCount = await Subcategory.countDocuments();
    
    console.log(`  Products: ${productCount}`);
    console.log(`  DealerPricing: ${pricingCount}`);
    console.log(`  Users: ${userCount}`);
    console.log(`  Brands: ${brandCount}`);
    console.log(`  Categories: ${categoryCount}`);
    console.log(`  Subcategories: ${subcategoryCount}`);
    
    if (productCount > 0) {
      console.log('\n📦 Sample products:');
      const sampleProducts = await Product.find({}).limit(3);
      sampleProducts.forEach((product, index) => {
        console.log(`${index + 1}. ${product.itemName} (${product.productCode})`);
        console.log(`   Rate Slabs: ${product.rateSlabs?.length || 0}`);
        if (product.rateSlabs && product.rateSlabs.length > 0) {
          console.log(`   First Rate: ₹${product.rateSlabs[0].rate}`);
        }
      });
    }
    
    if (pricingCount > 0) {
      console.log('\n💰 Sample pricing records:');
      const samplePricing = await DealerPricing.find({}).populate('product', 'itemName').limit(3);
      samplePricing.forEach((pricing, index) => {
        console.log(`${index + 1}. ${pricing.product?.itemName || 'Unknown'}: ₹${pricing.sellingPrice}`);
      });
    }
    
    // Test the controller query
    console.log('\n📊 Testing controller query...');
    try {
      const filter = { isActive: true };
      const pricingRecords = await DealerPricing.find(filter)
        .populate({
          path: 'product',
          select: 'itemName productCode brand category subcategory',
          populate: [
            { path: 'brand', select: 'name' },
            { path: 'category', select: 'name' },
            { path: 'subcategory', select: 'name' }
          ]
        })
        .populate('lastPurchaseSupplier', 'name companyName')
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort({ updatedAt: -1 })
        .limit(50);

      console.log(`✅ Controller query successful! Found ${pricingRecords.length} records`);
      
      // Filter out null products
      const validRecords = pricingRecords.filter(pricing => pricing.product != null);
      console.log(`✅ Valid records after filtering: ${validRecords.length}`);
      
      if (validRecords.length > 0) {
        console.log('\n📊 Sample valid records:');
        validRecords.slice(0, 3).forEach((record, index) => {
          console.log(`${index + 1}. ${record.product.itemName}: ₹${record.sellingPrice}`);
          console.log(`   Brand: ${record.product.brand?.name || 'N/A'}`);
          console.log(`   Category: ${record.product.category?.name || 'N/A'}`);
        });
      }
      
    } catch (error) {
      console.error('❌ Controller query failed:', error.message);
      console.error('Full error:', error);
    }
    
  } catch (error) {
    console.error('❌ Atlas test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

testAtlasDatabase();