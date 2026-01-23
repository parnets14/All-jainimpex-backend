import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Simple debug script to check purchase discounts
async function debugSupplierInvoiceSimple() {
  try {
    console.log('🔍 Debugging Supplier Invoice Discount Issue (Simple)...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');

    // Direct database queries without model imports
    const db = mongoose.connection.db;

    // Step 1: Check purchase discount mappings collection
    console.log('\n📊 Step 1: Checking Purchase Discount Mappings Collection');
    const discountCollection = db.collection('purchasediscountmappings');
    const totalDiscounts = await discountCollection.countDocuments();
    console.log(`Total purchase discounts in database: ${totalDiscounts}`);

    if (totalDiscounts === 0) {
      console.log('❌ No purchase discount mappings found in database!');
      console.log('💡 Solution: Create purchase discounts in Dealer Discount Management > Purchase Discount tab');
      return;
    }

    // Get all discounts
    const allDiscounts = await discountCollection.find({}).toArray();
    console.log('\nAll Purchase Discounts:');
    allDiscounts.forEach((discount, index) => {
      console.log(`\n${index + 1}. Discount ID: ${discount._id}`);
      console.log(`   Status: ${discount.status}`);
      console.log(`   Active: ${discount.isActive}`);
      console.log(`   Valid From: ${discount.validFrom}`);
      console.log(`   Valid To: ${discount.validTo}`);
      console.log(`   Direct Discount: ${discount.directDiscount}%`);
      console.log(`   Floating Range: ${discount.floatingDiscountMin}% - ${discount.floatingDiscountMax}%`);
      console.log(`   Brand: ${discount.brand || 'All'}`);
      console.log(`   Category: ${discount.category || 'All'}`);
    });

    // Step 2: Check active and approved discounts
    console.log('\n📋 Step 2: Checking Active & Approved Discounts');
    const now = new Date();
    const activeDiscounts = await discountCollection.find({
      status: 'Approved',
      isActive: true,
      validFrom: { $lte: now },
      validTo: { $gte: now }
    }).toArray();

    console.log(`Active & Approved discounts: ${activeDiscounts.length}`);
    
    if (activeDiscounts.length === 0) {
      console.log('❌ No active and approved purchase discounts found!');
      console.log('💡 Issues found:');
      
      // Check specific issues
      const pendingDiscounts = await discountCollection.find({ status: { $ne: 'Approved' } }).toArray();
      const inactiveDiscounts = await discountCollection.find({ isActive: false }).toArray();
      const expiredDiscounts = await discountCollection.find({
        $or: [
          { validFrom: { $gt: now } },
          { validTo: { $lt: now } }
        ]
      }).toArray();

      console.log(`   - Pending approval: ${pendingDiscounts.length}`);
      if (pendingDiscounts.length > 0) {
        pendingDiscounts.forEach(d => {
          console.log(`     * ${d._id}: Status = ${d.status}`);
        });
      }

      console.log(`   - Inactive: ${inactiveDiscounts.length}`);
      if (inactiveDiscounts.length > 0) {
        inactiveDiscounts.forEach(d => {
          console.log(`     * ${d._id}: isActive = ${d.isActive}`);
        });
      }

      console.log(`   - Expired/Future: ${expiredDiscounts.length}`);
      if (expiredDiscounts.length > 0) {
        expiredDiscounts.forEach(d => {
          console.log(`     * ${d._id}: ${d.validFrom} to ${d.validTo} (Today: ${now})`);
        });
      }
    } else {
      console.log('✅ Found active discounts:');
      activeDiscounts.forEach((discount, index) => {
        console.log(`   ${index + 1}. ${discount.directDiscount}% direct + ${discount.floatingDiscountMin}-${discount.floatingDiscountMax}% floating`);
        console.log(`      Brand: ${discount.brand || 'All'}, Category: ${discount.category || 'All'}`);
      });
    }

    // Step 3: Check GRN
    console.log('\n📦 Step 3: Checking GRN');
    const grnCollection = db.collection('grns');
    const grn = await grnCollection.findOne({ grnNo: 'GRN-176916263117' });

    if (!grn) {
      console.log('❌ GRN not found: GRN-176916263117');
      
      // Find any recent GRNs
      const recentGrns = await grnCollection.find({}).sort({ createdAt: -1 }).limit(5).toArray();
      console.log(`\nRecent GRNs (${recentGrns.length}):`);
      recentGrns.forEach(g => {
        console.log(`   - ${g.grnNo} (${g.items?.length || 0} items)`);
      });
    } else {
      console.log(`✅ Found GRN: ${grn.grnNo}`);
      console.log(`   Supplier: ${grn.supplierId}`);
      console.log(`   Items: ${grn.items?.length || 0}`);
      
      if (grn.items && grn.items.length > 0) {
        console.log('   Products:');
        grn.items.forEach((item, index) => {
          console.log(`     ${index + 1}. Product ID: ${item.productId}`);
        });
      }
    }

    // Step 4: Check products
    console.log('\n🔍 Step 4: Checking Products');
    const productCollection = db.collection('products');
    
    if (grn && grn.items && grn.items.length > 0) {
      for (let i = 0; i < Math.min(grn.items.length, 3); i++) {
        const item = grn.items[i];
        const product = await productCollection.findOne({ _id: item.productId });
        
        if (product) {
          console.log(`\n   Product ${i + 1}: ${product.name}`);
          console.log(`     Brand: ${product.brand || 'None'}`);
          console.log(`     Category: ${product.category || 'None'}`);
          console.log(`     Subcategory: ${product.subcategory || 'None'}`);
        } else {
          console.log(`\n   Product ${i + 1}: Not found (ID: ${item.productId})`);
        }
      }
    }

    // Step 5: Test API endpoint directly
    console.log('\n🌐 Step 5: Testing Purchase Discount API');
    
    try {
      // Simulate the API call that frontend makes
      const apiQuery = {
        status: 'Approved',
        isActive: true,
        validFrom: { $lte: now },
        validTo: { $gte: now }
      };
      
      const apiResult = await discountCollection.find(apiQuery).toArray();
      console.log(`API simulation result: ${apiResult.length} discounts`);
      
      if (apiResult.length > 0) {
        console.log('✅ API would return discounts');
      } else {
        console.log('❌ API would return no discounts');
      }
    } catch (error) {
      console.log(`❌ API simulation error: ${error.message}`);
    }

    console.log('\n📋 Summary & Next Steps:');
    if (activeDiscounts.length === 0) {
      console.log('🔧 ISSUE FOUND: No active purchase discounts available');
      console.log('💡 SOLUTIONS:');
      console.log('   1. Go to Dealer Discount Management > Purchase Discount tab');
      console.log('   2. Create new purchase discount or edit existing ones');
      console.log('   3. Ensure status is "Approved"');
      console.log('   4. Ensure isActive is true');
      console.log('   5. Check validity dates include today');
    } else {
      console.log('✅ Purchase discounts are available');
      console.log('💡 Check frontend integration:');
      console.log('   1. Verify API calls in browser network tab');
      console.log('   2. Check console for JavaScript errors');
      console.log('   3. Ensure supplier and product matching logic');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the debug
debugSupplierInvoiceSimple();