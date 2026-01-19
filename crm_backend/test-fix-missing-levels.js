import fetch from 'node-fetch';

async function testFixMissingLevels() {
  try {
    console.log('🔧 Testing fix missing levels endpoint...\n');
    
    // You'll need to get a valid token first
    // For now, let's test the model method directly
    
    const mongoose = await import('mongoose');
    const DiscountMapping = (await import('./models/DiscountMapping.js')).default;
    
    // Connect to MongoDB
    await mongoose.default.connect('mongodb://localhost:27017/jain_inpex_crm');
    
    console.log('📋 Connected to database, running fix...\n');
    
    const fixedCount = await DiscountMapping.fixDiscountsWithMissingLevels();
    
    console.log(`\n✅ Fix completed! Fixed ${fixedCount} discounts.`);
    
    // Test the findApplicableDiscounts method to see if it now filters properly
    console.log('\n🧪 Testing discount filtering...');
    
    // Find a product to test with (you can replace this with a real product ID)
    const Product = mongoose.default.model('Product');
    const testProduct = await Product.findOne();
    
    if (testProduct) {
      console.log(`Testing with product: ${testProduct.itemName} (${testProduct._id})`);
      
      const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
        testProduct._id,
        'sales',
        'Retailer'
      );
      
      console.log(`Found ${applicableDiscounts.length} applicable discounts:`);
      applicableDiscounts.forEach((discount, idx) => {
        console.log(`  ${idx + 1}. ${discount.discountName} (${discount.discountType})`);
        if (discount.levels) {
          console.log(`     Levels: ${discount.levels.length}`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

testFixMissingLevels();