import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Debug script to find why purchase discounts are not showing in Supplier Invoice
async function debugSupplierInvoiceDiscountIssue() {
  try {
    console.log('🔍 Debugging Supplier Invoice Discount Issue...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');

    // Import models
    const PurchaseDiscountMapping = (await import('./models/PurchaseDiscountMapping.js')).default;
    const Product = (await import('./models/Product.js')).default;
    const Supplier = (await import('./models/Supplier.js')).default;
    const GRN = (await import('./models/GRN.js')).default;

    // Step 1: Check all purchase discount mappings
    console.log('\n📊 Step 1: Checking Purchase Discount Mappings');
    const allDiscounts = await PurchaseDiscountMapping.find({})
      .populate('brand category subcategory extendedSubcategory')
      .sort({ createdAt: -1 });

    console.log(`Total purchase discounts in database: ${allDiscounts.length}`);
    
    if (allDiscounts.length === 0) {
      console.log('❌ No purchase discount mappings found in database!');
      console.log('💡 Solution: Create purchase discounts in Dealer Discount Management > Purchase Discount tab');
      return;
    }

    allDiscounts.forEach((discount, index) => {
      console.log(`\n${index + 1}. Discount ID: ${discount._id}`);
      console.log(`   Status: ${discount.status}`);
      console.log(`   Active: ${discount.isActive}`);
      console.log(`   Valid From: ${discount.validFrom}`);
      console.log(`   Valid To: ${discount.validTo}`);
      console.log(`   Direct Discount: ${discount.directDiscount}%`);
      console.log(`   Floating Range: ${discount.floatingDiscountMin}% - ${discount.floatingDiscountMax}%`);
      console.log(`   Brand: ${discount.brand?.name || 'All'}`);
      console.log(`   Category: ${discount.category?.name || 'All'}`);
      console.log(`   Subcategory: ${discount.subcategory?.name || 'All'}`);
    });

    // Step 2: Check active and approved discounts
    console.log('\n📋 Step 2: Checking Active & Approved Discounts');
    const activeDiscounts = await PurchaseDiscountMapping.find({
      status: 'Approved',
      isActive: true,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() }
    }).populate('brand category subcategory');

    console.log(`Active & Approved discounts: ${activeDiscounts.length}`);
    
    if (activeDiscounts.length === 0) {
      console.log('❌ No active and approved purchase discounts found!');
      console.log('💡 Possible issues:');
      console.log('   - Discounts are not approved (status should be "Approved")');
      console.log('   - Discounts are not active (isActive should be true)');
      console.log('   - Discounts are expired (check validFrom and validTo dates)');
      
      // Check what's wrong with existing discounts
      const pendingDiscounts = await PurchaseDiscountMapping.find({ status: { $ne: 'Approved' } });
      const inactiveDiscounts = await PurchaseDiscountMapping.find({ isActive: false });
      const expiredDiscounts = await PurchaseDiscountMapping.find({
        $or: [
          { validFrom: { $gt: new Date() } },
          { validTo: { $lt: new Date() } }
        ]
      });

      console.log(`   - Pending approval: ${pendingDiscounts.length}`);
      console.log(`   - Inactive: ${inactiveDiscounts.length}`);
      console.log(`   - Expired/Future: ${expiredDiscounts.length}`);
      
      return;
    }

    // Step 3: Check specific GRN and products
    console.log('\n📦 Step 3: Checking GRN and Products');
    
    // Find the GRN from the screenshot
    const grn = await GRN.findOne({ grnNo: 'GRN-176916263117' })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'brand category subcategory'
        }
      })
      .populate('supplierId');

    if (!grn) {
      console.log('❌ GRN not found: GRN-176916263117');
      return;
    }

    console.log(`✅ Found GRN: ${grn.grnNo}`);
    console.log(`   Supplier: ${grn.supplierId?.name || grn.supplierId?.companyName || 'Unknown'}`);
    console.log(`   Items: ${grn.items.length}`);

    // Step 4: Check each product for applicable discounts
    console.log('\n🔍 Step 4: Checking Product Discount Matching');
    
    for (let i = 0; i < grn.items.length; i++) {
      const item = grn.items[i];
      const product = item.productId;
      
      if (!product) {
        console.log(`   Item ${i + 1}: Product not found`);
        continue;
      }

      console.log(`\n   Item ${i + 1}: ${product.name}`);
      console.log(`     Product ID: ${product._id}`);
      console.log(`     Brand: ${product.brand?.name || 'None'} (ID: ${product.brand?._id || 'None'})`);
      console.log(`     Category: ${product.category?.name || 'None'} (ID: ${product.category?._id || 'None'})`);
      console.log(`     Subcategory: ${product.subcategory?.name || 'None'} (ID: ${product.subcategory?._id || 'None'})`);

      // Check which discounts apply to this product
      const applicableDiscounts = [];
      
      for (const discount of activeDiscounts) {
        let matches = true;
        let matchReason = [];

        // Brand matching
        if (discount.brand) {
          const discountBrandId = discount.brand._id.toString();
          const productBrandId = product.brand?._id?.toString();
          if (discountBrandId !== productBrandId) {
            matches = false;
          } else {
            matchReason.push(`Brand: ${discount.brand.name}`);
          }
        }

        // Category matching
        if (discount.category && matches) {
          const discountCategoryId = discount.category._id.toString();
          const productCategoryId = product.category?._id?.toString();
          if (discountCategoryId !== productCategoryId) {
            matches = false;
          } else {
            matchReason.push(`Category: ${discount.category.name}`);
          }
        }

        // Subcategory matching
        if (discount.subcategory && matches) {
          const discountSubcategoryId = discount.subcategory._id.toString();
          const productSubcategoryId = product.subcategory?._id?.toString();
          if (discountSubcategoryId !== productSubcategoryId) {
            matches = false;
          } else {
            matchReason.push(`Subcategory: ${discount.subcategory.name}`);
          }
        }

        // Global discount (no hierarchy specified)
        if (!discount.brand && !discount.category && !discount.subcategory && !discount.extendedSubcategory) {
          matches = true;
          matchReason.push('Global discount');
        }

        if (matches) {
          applicableDiscounts.push({
            discount,
            reason: matchReason.join(', ')
          });
        }
      }

      console.log(`     Applicable Discounts: ${applicableDiscounts.length}`);
      applicableDiscounts.forEach((item, idx) => {
        console.log(`       ${idx + 1}. ${item.discount.directDiscount}% direct + ${item.discount.floatingDiscountMin}-${item.discount.floatingDiscountMax}% floating`);
        console.log(`          Match: ${item.reason}`);
      });

      if (applicableDiscounts.length === 0) {
        console.log('     ❌ No applicable discounts found for this product');
      }
    }

    // Step 5: Check API endpoint
    console.log('\n🌐 Step 5: Testing API Endpoint');
    const PurchaseDiscountController = (await import('./controllers/purchaseDiscountController.js')).default;
    
    // Simulate API call
    const mockReq = {
      query: {
        status: 'Approved',
        isActive: 'true',
        limit: '1000'
      }
    };
    
    const mockRes = {
      json: (data) => {
        console.log(`API Response: ${data.success ? 'Success' : 'Failed'}`);
        if (data.success) {
          console.log(`   Returned ${data.data.length} discounts`);
          console.log(`   Total count: ${data.totalCount}`);
        } else {
          console.log(`   Error: ${data.message}`);
        }
      },
      status: (code) => ({
        json: (data) => {
          console.log(`API Error ${code}: ${data.message}`);
        }
      })
    };

    try {
      await PurchaseDiscountController.getAllPurchaseDiscounts(mockReq, mockRes);
    } catch (error) {
      console.log(`❌ API Error: ${error.message}`);
    }

    console.log('\n📋 Summary & Recommendations:');
    console.log('1. Check if purchase discounts are created and approved');
    console.log('2. Verify discount validity dates (should include today)');
    console.log('3. Ensure discounts are marked as active');
    console.log('4. Check product hierarchy matching (brand/category/subcategory)');
    console.log('5. Verify API endpoint is working correctly');

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the debug
debugSupplierInvoiceDiscountIssue();