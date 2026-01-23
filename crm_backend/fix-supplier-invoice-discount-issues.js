import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Fix the issues found in supplier invoice discount debugging
async function fixSupplierInvoiceDiscountIssues() {
  try {
    console.log('🔧 Fixing Supplier Invoice Discount Issues...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');

    const db = mongoose.connection.db;

    // Fix 1: Update the purchase discount with proper directDiscount value
    console.log('\n🔧 Fix 1: Updating Purchase Discount with Direct Discount Value');
    const discountCollection = db.collection('purchasediscountmappings');
    
    const discountToFix = await discountCollection.findOne({ _id: new mongoose.Types.ObjectId('697323bd764817c3af4ffd40') });
    
    if (discountToFix) {
      console.log('Found discount to fix:', {
        id: discountToFix._id,
        directDiscount: discountToFix.directDiscount,
        floatingRange: `${discountToFix.floatingDiscountMin}-${discountToFix.floatingDiscountMax}%`
      });

      // Update with proper direct discount value (6% as mentioned in previous context)
      const updateResult = await discountCollection.updateOne(
        { _id: discountToFix._id },
        { 
          $set: { 
            directDiscount: 6,  // Set 6% direct discount
            updatedAt: new Date()
          } 
        }
      );

      console.log('✅ Updated discount with directDiscount: 6%');
      console.log('Update result:', updateResult);
    }

    // Fix 2: Check and display the correct GRN information
    console.log('\n📦 Fix 2: Checking Available GRNs');
    const grnCollection = db.collection('grns');
    
    const availableGrns = await grnCollection.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    console.log('Available GRNs:');
    availableGrns.forEach((grn, index) => {
      console.log(`${index + 1}. ${grn.grnNo}`);
      console.log(`   Supplier: ${grn.supplierId}`);
      console.log(`   Items: ${grn.items?.length || 0}`);
      console.log(`   Created: ${grn.createdAt}`);
      console.log('');
    });

    // Fix 3: Test the corrected discount
    console.log('\n🧪 Fix 3: Testing Corrected Purchase Discount');
    const correctedDiscount = await discountCollection.findOne({ _id: new mongoose.Types.ObjectId('697323bd764817c3af4ffd40') });
    
    if (correctedDiscount) {
      console.log('✅ Corrected discount details:');
      console.log(`   Direct Discount: ${correctedDiscount.directDiscount}%`);
      console.log(`   Floating Range: ${correctedDiscount.floatingDiscountMin}% - ${correctedDiscount.floatingDiscountMax}%`);
      console.log(`   Status: ${correctedDiscount.status}`);
      console.log(`   Active: ${correctedDiscount.isActive}`);
      console.log(`   Valid: ${correctedDiscount.validFrom} to ${correctedDiscount.validTo}`);
      console.log(`   Brand: ${correctedDiscount.brand}`);
    }

    // Fix 4: Get brand information
    console.log('\n🏷️ Fix 4: Getting Brand Information');
    const brandCollection = db.collection('brands');
    const brand = await brandCollection.findOne({ _id: new mongoose.Types.ObjectId('6968f3465eb9746eb301e6e2') });
    
    if (brand) {
      console.log(`✅ Brand found: ${brand.name}`);
      console.log(`   Brand ID: ${brand._id}`);
    }

    // Fix 5: Check products under this brand
    console.log('\n📦 Fix 5: Checking Products Under Brand');
    const productCollection = db.collection('products');
    const brandProducts = await productCollection.find({ 
      brand: new mongoose.Types.ObjectId('6968f3465eb9746eb301e6e2') 
    }).limit(10).toArray();

    console.log(`Products under brand ${brand?.name || 'Unknown'}: ${brandProducts.length}`);
    brandProducts.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.name} (ID: ${product._id})`);
    });

    // Fix 6: Create a test calculation
    console.log('\n🧮 Fix 6: Test Discount Calculation');
    const testAmount = 1000;
    const directDiscount = 6; // Now properly set
    const floatingDiscount = 5; // Example floating discount

    const directDiscountAmount = (testAmount * directDiscount) / 100;
    const afterDirectDiscount = testAmount - directDiscountAmount;
    const floatingDiscountAmount = (afterDirectDiscount * floatingDiscount) / 100;
    const totalDiscountAmount = directDiscountAmount + floatingDiscountAmount;
    const finalAmount = testAmount - totalDiscountAmount;

    console.log('Test calculation for ₹1000:');
    console.log(`   Base Amount: ₹${testAmount}`);
    console.log(`   Direct Discount (${directDiscount}%): -₹${directDiscountAmount}`);
    console.log(`   After Direct: ₹${afterDirectDiscount}`);
    console.log(`   Floating Discount (${floatingDiscount}%): -₹${floatingDiscountAmount}`);
    console.log(`   Total Discount: -₹${totalDiscountAmount}`);
    console.log(`   Final Amount: ₹${finalAmount}`);

    console.log('\n✅ All fixes completed!');
    console.log('\n📋 Instructions for testing:');
    console.log('1. Use GRN number: GRN-1769162863117 (not GRN-176916263117)');
    console.log('2. The purchase discount now has 6% direct discount');
    console.log('3. Products under Cera brand should show discounts');
    console.log('4. Check browser console for any JavaScript errors');
    console.log('5. Verify API calls in Network tab');

  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the fix
fixSupplierInvoiceDiscountIssues();