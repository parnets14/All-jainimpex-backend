// Check and fix product names and codes in database
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';

dotenv.config();

const checkAndFixProductNames = async () => {
  try {
    console.log('🔍 Checking and fixing product names and codes...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Check all products
    console.log('📋 Checking all products in database...');
    
    const allProducts = await Product.find({});
    console.log(`Found ${allProducts.length} products in database\n`);

    // Check which products have null/undefined names
    const productsWithoutNames = allProducts.filter(product => 
      !product.itemName || product.itemName === 'undefined' || product.itemName.trim() === ''
    );

    const productsWithoutCodes = allProducts.filter(product => 
      !product.productCode || product.productCode === 'undefined' || product.productCode.trim() === ''
    );

    console.log(`Products without proper itemName: ${productsWithoutNames.length}`);
    console.log(`Products without proper productCode: ${productsWithoutCodes.length}\n`);

    // Show detailed info for first few products
    console.log('📊 First 10 products detailed info:');
    allProducts.slice(0, 10).forEach((product, index) => {
      console.log(`${index + 1}. Product ID: ${product._id}`);
      console.log(`   - itemName: "${product.itemName}" (type: ${typeof product.itemName})`);
      console.log(`   - productCode: "${product.productCode}" (type: ${typeof product.productCode})`);
      console.log(`   - HSNCode: "${product.HSNCode}"`);
      console.log(`   - unit: "${product.unit}"`);
      console.log(`   - rateSlabs: ${product.rateSlabs?.length || 0} slabs`);
      if (product.rateSlabs && product.rateSlabs.length > 0) {
        console.log(`   - First rate: ₹${product.rateSlabs[0].rate}`);
      }
      console.log('');
    });

    // Check what pricing records are referencing
    console.log('💰 Checking pricing records and their product references...');
    
    const pricingRecords = await DealerPricing.find({ isActive: true })
      .populate('product');

    console.log(`Found ${pricingRecords.length} active pricing records\n`);

    pricingRecords.forEach((pricing, index) => {
      console.log(`${index + 1}. Pricing ID: ${pricing._id}`);
      console.log(`   - Product ID: ${pricing.product?._id || 'NULL'}`);
      console.log(`   - Product itemName: "${pricing.product?.itemName || 'NULL'}"`);
      console.log(`   - Product productCode: "${pricing.product?.productCode || 'NULL'}"`);
      console.log(`   - Purchase Price: ₹${pricing.purchasePrice}`);
      console.log(`   - Selling Price: ₹${pricing.sellingPrice}`);
      console.log('');
    });

    // Try to create some sample product names if they're missing
    console.log('🔧 Attempting to fix missing product names...');
    
    let fixedCount = 0;
    
    for (const product of allProducts) {
      let needsUpdate = false;
      const updates = {};
      
      // Fix itemName if missing
      if (!product.itemName || product.itemName === 'undefined' || product.itemName.trim() === '') {
        // Generate a name based on available data
        let generatedName = '';
        
        if (product.HSNCode) {
          generatedName = `Product HSN ${product.HSNCode}`;
        } else if (product.unit) {
          generatedName = `Product ${product.unit}`;
        } else {
          generatedName = `Product ${product._id.toString().slice(-6)}`;
        }
        
        updates.itemName = generatedName;
        needsUpdate = true;
        console.log(`   - Fixing itemName for ${product._id}: "${generatedName}"`);
      }
      
      // Fix productCode if missing
      if (!product.productCode || product.productCode === 'undefined' || product.productCode.trim() === '') {
        // Generate a code based on available data
        let generatedCode = '';
        
        if (product.HSNCode) {
          generatedCode = `HSN${product.HSNCode}`;
        } else {
          generatedCode = `PRD${product._id.toString().slice(-6).toUpperCase()}`;
        }
        
        updates.productCode = generatedCode;
        needsUpdate = true;
        console.log(`   - Fixing productCode for ${product._id}: "${generatedCode}"`);
      }
      
      if (needsUpdate) {
        try {
          await Product.findByIdAndUpdate(product._id, updates);
          fixedCount++;
        } catch (error) {
          console.error(`   - Error updating product ${product._id}:`, error.message);
        }
      }
    }

    console.log(`\n✅ Fixed ${fixedCount} products with missing names/codes`);

    // Test the comprehensive API after fixes
    console.log('\n🧪 Testing comprehensive API after fixes...');
    
    const testPricing = await DealerPricing.find({ isActive: true })
      .populate({
        path: 'product',
        select: 'itemName productCode brand category subcategory',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' }
        ]
      })
      .limit(5);

    console.log(`\nTesting with ${testPricing.length} pricing records:`);
    
    testPricing.forEach((pricing, index) => {
      console.log(`${index + 1}. ${pricing.product?.itemName || 'NULL'} (${pricing.product?.productCode || 'NULL'})`);
      console.log(`   - Brand: ${pricing.product?.brand?.name || 'NULL'}`);
      console.log(`   - Category: ${pricing.product?.category?.name || 'NULL'}`);
      console.log(`   - Purchase: ₹${pricing.purchasePrice} → Selling: ₹${pricing.sellingPrice}`);
      console.log(`   - Margin: ${pricing.grossMargin?.toFixed(2)}%`);
    });

    console.log('\n✅ Product names and codes check/fix completed!');

  } catch (error) {
    console.error('❌ Check/fix failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the check and fix
checkAndFixProductNames();