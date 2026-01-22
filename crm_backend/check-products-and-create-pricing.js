import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import User from './models/User.js';

dotenv.config();

async function checkProductsAndCreatePricing() {
  try {
    console.log('🔍 Checking products and creating pricing data...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_backend');
    console.log('✅ Connected to MongoDB');
    
    // Check products
    const products = await Product.find({}).limit(10);
    console.log(`📦 Found ${products.length} products in database`);
    
    if (products.length === 0) {
      console.log('❌ No products found in database');
      return;
    }
    
    // Show sample products
    console.log('\n📊 Sample products:');
    products.slice(0, 3).forEach((product, index) => {
      console.log(`${index + 1}. ${product.itemName} (${product.productCode})`);
      console.log(`   Rate Slabs: ${product.rateSlabs?.length || 0}`);
      if (product.rateSlabs && product.rateSlabs.length > 0) {
        console.log(`   First Rate: ₹${product.rateSlabs[0].rate}`);
      }
    });
    
    // Check existing pricing records
    const existingPricing = await DealerPricing.find({});
    console.log(`\n💰 Found ${existingPricing.length} existing pricing records`);
    
    // Get a user for createdBy field
    const user = await User.findOne({});
    if (!user) {
      console.log('❌ No users found in database');
      return;
    }
    console.log(`👤 Using user: ${user.name} (${user.email})`);
    
    // Create pricing records for products with rate slabs
    const productsWithRateSlabs = products.filter(p => 
      p.rateSlabs && p.rateSlabs.length > 0 && p.rateSlabs[0].rate > 0
    );
    
    console.log(`\n🎯 Found ${productsWithRateSlabs.length} products with rate slabs`);
    
    let createdCount = 0;
    for (const product of productsWithRateSlabs) {
      try {
        // Check if pricing already exists
        const existingRecord = await DealerPricing.findOne({ product: product._id });
        if (existingRecord) {
          console.log(`⏭️  Pricing already exists for ${product.itemName}`);
          continue;
        }
        
        // Create new pricing record
        const pricingData = {
          product: product._id,
          sellingPrice: product.rateSlabs[0].rate,
          purchasePrice: Math.round(product.rateSlabs[0].rate * 0.8), // 80% of selling price as purchase price
          isActive: true,
          createdBy: user._id
        };
        
        const newPricing = await DealerPricing.create(pricingData);
        console.log(`✅ Created pricing for ${product.itemName}: ₹${newPricing.sellingPrice}`);
        createdCount++;
        
      } catch (error) {
        console.error(`❌ Error creating pricing for ${product.itemName}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Created ${createdCount} new pricing records`);
    
    // Test the controller query again
    console.log('\n📊 Testing controller query with new data...');
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
      
      // Show sample records
      validRecords.slice(0, 3).forEach((record, index) => {
        console.log(`${index + 1}. ${record.product.itemName}: ₹${record.sellingPrice}`);
      });
      
    } catch (error) {
      console.error('❌ Controller query failed:', error.message);
      console.error('Full error:', error);
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

checkProductsAndCreatePricing();