import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricing from './models/DealerPricing.js';
import Product from './models/Product.js';

dotenv.config();

async function debugDealerPricing500Error() {
  try {
    console.log('🔍 Debugging Dealer Pricing 500 Error...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_backend');
    console.log('✅ Connected to MongoDB');
    
    // Test 1: Basic query without populate
    console.log('\n📊 Test 1: Basic query without populate');
    try {
      const basicRecords = await DealerPricing.find({ isActive: true }).limit(5);
      console.log(`✅ Found ${basicRecords.length} basic records`);
      
      // Check for any invalid product references
      const invalidRefs = basicRecords.filter(record => !mongoose.Types.ObjectId.isValid(record.product));
      console.log(`❌ Invalid product references: ${invalidRefs.length}`);
      
      if (invalidRefs.length > 0) {
        console.log('Invalid references:', invalidRefs.map(r => ({ id: r._id, product: r.product })));
      }
    } catch (error) {
      console.error('❌ Basic query failed:', error.message);
    }
    
    // Test 2: Query with product populate only
    console.log('\n📊 Test 2: Query with product populate only');
    try {
      const productPopulateRecords = await DealerPricing.find({ isActive: true })
        .populate('product', 'itemName productCode brand category subcategory')
        .limit(5);
      console.log(`✅ Found ${productPopulateRecords.length} records with product populate`);
      
      // Check for null products
      const nullProducts = productPopulateRecords.filter(p => !p.product);
      console.log(`❌ Records with null products: ${nullProducts.length}`);
      
      if (nullProducts.length > 0) {
        console.log('Null product records:', nullProducts.map(r => ({ id: r._id, productId: r.product })));
      }
    } catch (error) {
      console.error('❌ Product populate failed:', error.message);
    }
    
    // Test 3: Full query with nested populate (the one causing issues)
    console.log('\n📊 Test 3: Full query with nested populate');
    try {
      const fullRecords = await DealerPricing.find({ isActive: true })
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
        .limit(5);
        
      console.log(`✅ Found ${fullRecords.length} records with full populate`);
      
      // Analyze the records
      fullRecords.forEach((record, index) => {
        console.log(`Record ${index + 1}:`);
        console.log(`  Product: ${record.product ? record.product.itemName : 'NULL'}`);
        console.log(`  Brand: ${record.product?.brand?.name || 'NULL'}`);
        console.log(`  Category: ${record.product?.category?.name || 'NULL'}`);
        console.log(`  Subcategory: ${record.product?.subcategory?.name || 'NULL'}`);
      });
      
    } catch (error) {
      console.error('❌ Full populate failed:', error.message);
      console.error('Full error:', error);
    }
    
    // Test 4: Check for orphaned records
    console.log('\n📊 Test 4: Check for orphaned records');
    try {
      const allPricingRecords = await DealerPricing.find({ isActive: true }).select('product');
      const productIds = allPricingRecords.map(r => r.product);
      
      console.log(`Found ${productIds.length} pricing records`);
      
      // Check which products exist
      const existingProducts = await Product.find({ _id: { $in: productIds } }).select('_id');
      const existingProductIds = existingProducts.map(p => p._id.toString());
      
      console.log(`Found ${existingProducts.length} existing products`);
      
      // Find orphaned records
      const orphanedRecords = allPricingRecords.filter(record => 
        !existingProductIds.includes(record.product.toString())
      );
      
      console.log(`❌ Orphaned records (product doesn't exist): ${orphanedRecords.length}`);
      
      if (orphanedRecords.length > 0) {
        console.log('Orphaned record IDs:', orphanedRecords.map(r => r._id));
        
        // Deactivate orphaned records
        console.log('🔧 Deactivating orphaned records...');
        const deactivateResult = await DealerPricing.updateMany(
          { _id: { $in: orphanedRecords.map(r => r._id) } },
          { isActive: false }
        );
        console.log(`✅ Deactivated ${deactivateResult.modifiedCount} orphaned records`);
      }
      
    } catch (error) {
      console.error('❌ Orphaned records check failed:', error.message);
    }
    
    // Test 5: Try the exact controller query again
    console.log('\n📊 Test 5: Retry exact controller query');
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
      
    } catch (error) {
      console.error('❌ Controller query failed:', error.message);
      console.error('Full error:', error);
    }
    
    console.log('\n✅ Debug complete');
    
  } catch (error) {
    console.error('❌ Debug script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

debugDealerPricing500Error();