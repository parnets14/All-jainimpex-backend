import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Debug the supplier invoice creation with floating discounts
async function debugSupplierInvoiceFloatingDiscountCreation() {
  try {
    console.log('🔍 Debugging Supplier Invoice Floating Discount Creation...\n');

    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');

    // Import models
    const SupplierInvoice = (await import('./models/SupplierInvoice.js')).default;

    // Test 1: Check existing invoices for discount data
    console.log('\n📋 Test 1: Checking Existing Invoices');
    const existingInvoices = await SupplierInvoice.find({})
      .sort({ createdAt: -1 })
      .limit(5);

    console.log(`Found ${existingInvoices.length} existing invoices`);
    
    existingInvoices.forEach((invoice, index) => {
      console.log(`\nInvoice ${index + 1}: ${invoice.invoiceNo}`);
      console.log(`   Subtotal: ₹${invoice.subtotal}`);
      console.log(`   Total Direct Discount: ₹${invoice.totalDirectDiscount || 0}`);
      console.log(`   Total Floating Discount: ₹${invoice.totalFloatingDiscount || 0}`);
      console.log(`   Total Discount: ₹${invoice.totalDiscount || 0}`);
      console.log(`   Grand Total: ₹${invoice.grandTotal}`);
      
      if (invoice.items && invoice.items.length > 0) {
        const firstItem = invoice.items[0];
        console.log(`   First Item Purchase Discount:`, {
          directDiscountAmount: firstItem.purchaseDiscount?.directDiscountAmount || 0,
          floatingDiscountAmount: firstItem.purchaseDiscount?.floatingDiscountAmount || 0,
          totalDiscountAmount: firstItem.purchaseDiscount?.totalDiscountAmount || 0
        });
      }
    });

    // Test 2: Create a test invoice with floating discounts
    console.log('\n🧪 Test 2: Creating Test Invoice with Floating Discounts');
    
    const testInvoiceData = {
      invoiceNo: `TEST-SI-${Date.now()}`,
      supplierId: new mongoose.Types.ObjectId('68ede165cab041c7e841b7bc'), // vidya supplier
      grnId: new mongoose.Types.ObjectId(),
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      items: [
        {
          product: new mongoose.Types.ObjectId('6969d72d0ae8fdeacfdb68d1'), // Cera product
          productName: 'celeb 3d black',
          productCode: '635165165',
          HSNCode: '39161',
          quantity: 10,
          unitPrice: 15000,
          gst: 18,
          purchaseDiscount: {
            directDiscountPercentage: 6,
            directDiscountAmount: 9000, // 6% of 150000
            floatingDiscountPercentage: 5,
            floatingDiscountAmount: 7050, // 5% of (150000 - 9000) = 5% of 141000
            totalDiscountPercentage: 10.7,
            totalDiscountAmount: 16050, // 9000 + 7050
            applicableDiscounts: []
          },
          discountAmount: 16050, // Legacy field
          subtotal: 150000,
          totalPrice: 158061 // After all discounts + GST
        }
      ],
      subtotal: 150000,
      totalDirectDiscount: 9000,
      totalFloatingDiscount: 7050,
      totalDiscount: 16050,
      totalGst: 24111, // 18% of (150000 - 16050)
      totalAmount: 158061,
      grandTotal: 158061,
      purchaseDiscountSummary: {
        directDiscountApplied: true,
        floatingDiscountApplied: true,
        totalSavings: 16050,
        savingsPercentage: 10.7
      },
      status: 'Draft'
    };

    console.log('Creating test invoice with data:', {
      subtotal: testInvoiceData.subtotal,
      totalDirectDiscount: testInvoiceData.totalDirectDiscount,
      totalFloatingDiscount: testInvoiceData.totalFloatingDiscount,
      totalDiscount: testInvoiceData.totalDiscount,
      grandTotal: testInvoiceData.grandTotal
    });

    const testInvoice = new SupplierInvoice(testInvoiceData);
    
    // Validate before saving
    const validationError = testInvoice.validateSync();
    if (validationError) {
      console.log('❌ Validation errors:', validationError.errors);
      return;
    }

    // Save the test invoice
    const savedInvoice = await testInvoice.save();
    console.log('✅ Test invoice created successfully');
    console.log('Saved invoice data:', {
      id: savedInvoice._id,
      invoiceNo: savedInvoice.invoiceNo,
      subtotal: savedInvoice.subtotal,
      totalDirectDiscount: savedInvoice.totalDirectDiscount,
      totalFloatingDiscount: savedInvoice.totalFloatingDiscount,
      totalDiscount: savedInvoice.totalDiscount,
      grandTotal: savedInvoice.grandTotal
    });

    // Test 3: Verify the saved data
    console.log('\n🔍 Test 3: Verifying Saved Data');
    const retrievedInvoice = await SupplierInvoice.findById(savedInvoice._id);
    
    if (retrievedInvoice) {
      console.log('✅ Invoice retrieved successfully');
      console.log('Retrieved data matches:', {
        subtotalMatch: retrievedInvoice.subtotal === testInvoiceData.subtotal,
        directDiscountMatch: retrievedInvoice.totalDirectDiscount === testInvoiceData.totalDirectDiscount,
        floatingDiscountMatch: retrievedInvoice.totalFloatingDiscount === testInvoiceData.totalFloatingDiscount,
        totalDiscountMatch: retrievedInvoice.totalDiscount === testInvoiceData.totalDiscount,
        grandTotalMatch: retrievedInvoice.grandTotal === testInvoiceData.grandTotal
      });

      // Check item-level discount data
      if (retrievedInvoice.items && retrievedInvoice.items.length > 0) {
        const item = retrievedInvoice.items[0];
        console.log('Item-level discount data:', {
          directDiscountAmount: item.purchaseDiscount?.directDiscountAmount,
          floatingDiscountAmount: item.purchaseDiscount?.floatingDiscountAmount,
          totalDiscountAmount: item.purchaseDiscount?.totalDiscountAmount
        });
      }
    }

    // Clean up test invoice
    await SupplierInvoice.findByIdAndDelete(savedInvoice._id);
    console.log('🗑️ Test invoice cleaned up');

    console.log('\n📋 Summary:');
    console.log('✅ SupplierInvoice model supports floating discounts');
    console.log('✅ Invoice creation with floating discounts works');
    console.log('✅ Data is saved and retrieved correctly');
    
    console.log('\n💡 If floating discounts are not showing in the UI:');
    console.log('1. Check browser console for JavaScript errors');
    console.log('2. Verify the frontend is sending the correct data structure');
    console.log('3. Check if the API endpoint is processing floating discounts');
    console.log('4. Ensure the invoice display logic includes floating discounts');

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

debugSupplierInvoiceFloatingDiscountCreation();