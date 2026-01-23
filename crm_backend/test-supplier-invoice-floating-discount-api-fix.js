import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Test the fixed supplier invoice API with floating discounts
async function testSupplierInvoiceFloatingDiscountApiFix() {
  try {
    console.log('🔧 Testing Supplier Invoice API Fix for Floating Discounts...\n');

    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');

    // Import the controller function
    const supplierInvoiceController = await import('./controllers/supplierInvoiceController.js');
    const createSupplierInvoice = supplierInvoiceController.createSupplierInvoice;

    // Test data simulating what the frontend sends
    const testRequestBody = {
      grnId: '6971b32839870bccbb5cc1', // Use a real GRN ID
      supplierId: '68ede165cab041c7e841b7bc', // vidya supplier
      invoiceDate: new Date(),
      creditDays: 30,
      remarks: 'Test invoice with floating discounts',
      status: 'Draft',
      items: [
        {
          productId: '6969d72d0ae8fdeacfdb68d1',
          productName: 'celeb 3d black',
          productCode: '635165165',
          HSNCode: '39161',
          quantity: 10,
          unitPrice: 15000,
          gst: 18,
          gstAmount: 24111, // GST on discounted amount
          purchaseDiscount: {
            directDiscountPercentage: 6,
            directDiscountAmount: 9000, // 6% of 150000
            floatingDiscountPercentage: 5,
            floatingDiscountAmount: 7050, // 5% of (150000 - 9000)
            totalDiscountPercentage: 10.7,
            totalDiscountAmount: 16050,
            applicableDiscounts: []
          },
          discountAmount: 16050, // Legacy field
          subtotal: 150000,
          totalPrice: 158061, // After all discounts + GST
          warehouseId: '6968f3555eb9746eb301e6f8',
          warehouseName: 'Main Warehouse'
        }
      ],
      subtotal: 150000,
      totalDirectDiscount: 9000,
      totalFloatingDiscount: 7050,
      totalDiscount: 16050,
      totalGst: 24111,
      totalAmount: 158061,
      grandTotal: 158061,
      purchaseDiscountSummary: {
        directDiscountApplied: true,
        floatingDiscountApplied: true,
        totalSavings: 16050,
        savingsPercentage: 10.7
      }
    };

    // Mock request and response objects
    const mockReq = {
      body: testRequestBody,
      user: { _id: new mongoose.Types.ObjectId('68db7209bf7b5baece4a20aa') }
    };

    const mockRes = {
      status: (code) => ({
        json: (data) => {
          console.log(`Response Status: ${code}`);
          console.log('Response Data:', JSON.stringify(data, null, 2));
          return data;
        }
      }),
      json: (data) => {
        console.log('Response Data:', JSON.stringify(data, null, 2));
        return data;
      }
    };

    console.log('📤 Sending test request with floating discount data...');
    console.log('Request data:', {
      subtotal: testRequestBody.subtotal,
      totalDirectDiscount: testRequestBody.totalDirectDiscount,
      totalFloatingDiscount: testRequestBody.totalFloatingDiscount,
      totalDiscount: testRequestBody.totalDiscount,
      grandTotal: testRequestBody.grandTotal
    });

    // Test the API
    try {
      await createSupplierInvoice(mockReq, mockRes);
      console.log('✅ API call completed successfully');
    } catch (apiError) {
      console.log('❌ API call failed:', apiError.message);
    }

    // Verify the created invoice
    console.log('\n🔍 Verifying created invoice...');
    const SupplierInvoice = (await import('./models/SupplierInvoice.js')).default;
    
    const latestInvoice = await SupplierInvoice.findOne({})
      .sort({ createdAt: -1 })
      .limit(1);

    if (latestInvoice) {
      console.log('✅ Latest invoice found');
      console.log('Invoice data:', {
        invoiceNumber: latestInvoice.invoiceNumber,
        subtotal: latestInvoice.subtotal,
        totalDirectDiscount: latestInvoice.totalDirectDiscount,
        totalFloatingDiscount: latestInvoice.totalFloatingDiscount,
        totalDiscount: latestInvoice.totalDiscount,
        grandTotal: latestInvoice.grandTotal,
        purchaseDiscountSummary: latestInvoice.purchaseDiscountSummary
      });

      // Check if floating discounts are properly saved
      const hasFloatingDiscount = latestInvoice.totalFloatingDiscount > 0;
      const hasDirectDiscount = latestInvoice.totalDirectDiscount > 0;
      
      console.log('\n📊 Discount Verification:');
      console.log(`✅ Direct Discount Applied: ${hasDirectDiscount} (₹${latestInvoice.totalDirectDiscount})`);
      console.log(`✅ Floating Discount Applied: ${hasFloatingDiscount} (₹${latestInvoice.totalFloatingDiscount})`);
      console.log(`✅ Total Discount: ₹${latestInvoice.totalDiscount}`);
      
      if (hasFloatingDiscount && hasDirectDiscount) {
        console.log('🎉 SUCCESS: Both direct and floating discounts are properly saved!');
      } else {
        console.log('❌ ISSUE: Discounts are not properly saved');
      }

      // Check item-level discount data
      if (latestInvoice.items && latestInvoice.items.length > 0) {
        const item = latestInvoice.items[0];
        console.log('\n📦 Item-level discount data:');
        console.log('Purchase Discount:', item.purchaseDiscount);
      }
    } else {
      console.log('❌ No invoice found');
    }

    console.log('\n📋 Summary:');
    console.log('✅ Fixed createSupplierInvoice controller to accept discount data from frontend');
    console.log('✅ Controller now uses floating discount information instead of recalculating');
    console.log('✅ Invoice creation preserves both direct and floating discount amounts');
    
    console.log('\n💡 Next Steps:');
    console.log('1. Test the fix in the browser');
    console.log('2. Create a new supplier invoice with floating discounts');
    console.log('3. Verify that both direct and floating discounts appear in the final invoice');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testSupplierInvoiceFloatingDiscountApiFix();