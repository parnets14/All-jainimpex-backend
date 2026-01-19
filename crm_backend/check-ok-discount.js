import mongoose from 'mongoose';
import DiscountMapping from './models/DiscountMapping.js';

// Connect to MongoDB Atlas
mongoose.connect('mongodb+srv://parnetstech14:parnets14@jainimpexcrm.grb5bho.mongodb.net/?retryWrites=true&w=majority&appName=JainImpexCRM');

async function checkOkDiscount() {
  try {
    console.log('🔍 Checking the "ok" discount specifically...\n');
    
    // Wait for connection
    await new Promise(resolve => {
      mongoose.connection.once('open', resolve);
    });
    
    console.log('✅ Connected to database\n');
    
    // Find the "ok" discount
    const okDiscount = await DiscountMapping.findOne({ discountName: 'ok' })
      .populate('extendedSubcategory1', 'name');
    
    if (!okDiscount) {
      console.log('❌ "ok" discount not found');
      return;
    }
    
    console.log('📋 "ok" discount details:');
    console.log(`   - ID: ${okDiscount._id}`);
    console.log(`   - Name: ${okDiscount.discountName}`);
    console.log(`   - Type: ${okDiscount.discountType}`);
    console.log(`   - Target Type: ${okDiscount.targetType}`);
    console.log(`   - Status: ${okDiscount.status}`);
    console.log(`   - Active: ${okDiscount.isActive}`);
    console.log(`   - Direct Discount: ${okDiscount.directDiscountPercentage}%`);
    console.log(`   - Max Discount: ${okDiscount.maxDiscountPercentage}%`);
    console.log(`   - Extended Subcategory 1: ${okDiscount.extendedSubcategory1?.name || 'Not populated'}`);
    console.log(`   - Valid From: ${okDiscount.validFrom}`);
    console.log(`   - Valid To: ${okDiscount.validTo}`);
    console.log(`   - Levels Array:`, okDiscount.levels);
    console.log(`   - Levels Count: ${okDiscount.levels?.length || 0}`);
    console.log('');
    
    if (okDiscount.levels && okDiscount.levels.length > 0) {
      console.log('📋 Available levels:');
      okDiscount.levels.forEach((level, idx) => {
        console.log(`   ${idx + 1}. ${level.levelName} - ${level.discountPercentage}%`);
        if (level.description) {
          console.log(`      Description: ${level.description}`);
        }
      });
      console.log('');
    }
    
    // Test the findApplicableDiscounts method
    console.log('🧪 Testing findApplicableDiscounts method...\n');
    
    // We need a product that has the same extendedSubcategory1
    const Product = mongoose.model('Product');
    const testProduct = await Product.findOne({ 
      subcategory1: okDiscount.extendedSubcategory1 
    });
    
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
        console.log(`     - Target Type: ${discount.targetType}`);
        console.log(`     - Levels: ${discount.levels?.length || 0}`);
        if (discount.levels && discount.levels.length > 0) {
          console.log(`     - Level Names: ${discount.levels.map(l => l.levelName).join(', ')}`);
        }
      });
      
      if (applicableDiscounts.length === 0) {
        console.log('❌ No applicable discounts found for this product');
        console.log('This might be why the frontend is not getting the discount data');
      }
    } else {
      console.log('❌ No product found with matching extendedSubcategory1');
      console.log('This might be why the discount is not being applied');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the check
checkOkDiscount();