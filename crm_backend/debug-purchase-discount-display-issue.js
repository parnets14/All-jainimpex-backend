import mongoose from 'mongoose';
import DealerPricing from './models/DealerPricing.js';
import PurchaseDiscountMapping from './models/PurchaseDiscountMapping.js';
import Product from './models/Product.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://jaininpex:Ravi%40123@cluster0.fq8ot.mongodb.net/jainInpexCRM?retryWrites=true&w=majority');
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

const debugPurchaseDiscountDisplayIssue = async () => {
  try {
    console.log('🔍 DEBUGGING PURCHASE DISCOUNT DISPLAY ISSUE\n');
    
    // 1. Check approved purchase discounts
    console.log('1️⃣ Checking approved purchase discounts...');
    const approvedDiscounts = await PurchaseDiscountMapping.find({ 
      status: 'Approved', 
      isActive: true 
    })
    .populate('brand', 'name')
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .populate('suppliers', 'name');
    
    console.log(`📊 Found ${approvedDiscounts.length} approved purchase discounts:`);
    approvedDiscounts.forEach(discount => {
      console.log(`   - ${discount.discountName}: ${discount.directDiscountPercentage}% direct`);
      console.log(`     Target: ${discount.brand?.name || discount.category?.name || discount.subcategory?.name || 'Direct'}`);
      console.log(`     Suppliers: ${discount.suppliers?.map(s => s.name).join(', ') || 'All'}`);
      console.log(`     Valid: ${discount.validFrom} to ${discount.validTo || 'No end date'}`);
    });
    
    // 2. Check a few products that should have discounts (like Cera products)
    console.log('\n2️⃣ Checking products that should have purchase discounts...');
    const ceraProducts = await Product.find({ 
      'brand.name': { $regex: 'cera', $options: 'i' } 
    })
    .populate('brand', 'name')
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .limit(5);
    
    console.log(`📦 Found ${ceraProducts.length} Cera products (sample):`);
    
    for (const product of ceraProducts) {
      console.log(`\n   Product: ${product.itemName} (${product.productCode})`);
      console.log(`   Brand: ${product.brand?.name}`);
      console.log(`   Category: ${product.category?.name}`);
      console.log(`   Subcategory: ${product.subcategory?.name}`);
      
      // Check applicable discounts for this product
      const applicableDiscounts = await PurchaseDiscountMapping.findApplicableDiscounts(product._id);
      console.log(`   Applicable discounts: ${applicableDiscounts.length}`);
      
      applicableDiscounts.forEach(discount => {
        console.log(`     - ${discount.discountName}: ${discount.directDiscountPercentage}%`);
      });
      
      // Check DealerPricing record for this product
      const dealerPricing = await DealerPricing.findOne({ 
        product: product._id, 
        isActive: true 
      });
      
      if (dealerPricing) {
        console.log(`   DealerPricing exists:`);
        console.log(`     Purchase discount info: ${JSON.stringify(dealerPricing.purchaseDiscountInfo, null, 2)}`);
      } else {
        console.log(`   ❌ No DealerPricing record found`);
      }
    }
    
    // 3. Update purchase discount info for all products
    console.log('\n3️⃣ Updating purchase discount info for all DealerPricing records...');
    
    const allPricingRecords = await DealerPricing.find({ isActive: true });
    console.log(`📊 Found ${allPricingRecords.length} active pricing records`);
    
    let updatedCount = 0;
    let withDiscountCount = 0;
    
    for (const pricing of allPricingRecords) {
      try {
        // Update purchase discount info
        await pricing.updatePurchaseDiscountInfo();
        await pricing.save();
        updatedCount++;
        
        if (pricing.purchaseDiscountInfo?.hasDirectDiscount) {
          withDiscountCount++;
          console.log(`   ✅ Updated ${pricing.product}: ${pricing.purchaseDiscountInfo.directDiscountPercentage}% from ${pricing.purchaseDiscountInfo.discountSourceName}`);
        }
      } catch (error) {
        console.error(`   ❌ Error updating ${pricing.product}:`, error.message);
      }
    }
    
    console.log(`\n📊 Update Summary:`);
    console.log(`   Total records updated: ${updatedCount}`);
    console.log(`   Records with purchase discounts: ${withDiscountCount}`);
    
    // 4. Verify the fix by checking a few Cera products again
    console.log('\n4️⃣ Verifying the fix...');
    
    for (const product of ceraProducts.slice(0, 2)) {
      const dealerPricing = await DealerPricing.findOne({ 
        product: product._id, 
        isActive: true 
      });
      
      if (dealerPricing) {
        console.log(`\n   ${product.itemName}:`);
        console.log(`     Has purchase discount: ${dealerPricing.purchaseDiscountInfo?.hasDirectDiscount || false}`);
        console.log(`     Discount percentage: ${dealerPricing.purchaseDiscountInfo?.directDiscountPercentage || 0}%`);
        console.log(`     Discount source: ${dealerPricing.purchaseDiscountInfo?.discountSourceName || 'None'}`);
      }
    }
    
    console.log('\n✅ Purchase discount debug completed!');
    
  } catch (error) {
    console.error('❌ Error in purchase discount debug:', error);
  } finally {
    await mongoose.connection.close();
    console.log('📝 Database connection closed');
  }
};

// Run the debug
connectDB().then(() => {
  debugPurchaseDiscountDisplayIssue();
});