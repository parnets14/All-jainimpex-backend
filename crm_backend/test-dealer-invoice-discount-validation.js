import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerInvoice from './models/DealerInvoice.js';
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';
import DiscountMapping from './models/DiscountMapping.js';
import { createDealerInvoice } from './controllers/dealerInvoiceController.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testDiscountValidation = async () => {
  try {
    console.log('🧪 Testing Dealer Invoice Discount Validation...\n');
    
    // Find a dealer and product for testing
    const dealer = await Dealer.findOne({ dealerType: 'Retailer' });
    const product = await Product.findOne().populate('brand category subcategory');
    
    if (!dealer || !product) {
      console.log('❌ No dealer or product found for testing');
      return;
    }
    
    console.log(`📋 Testing with dealer: ${dealer.name} (${dealer.dealerType})`);
    console.log(`📦 Testing with product: ${product.itemName}`);
    
    // Find applicable discount for this product
    const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
      product._id,
      'sales',
      dealer.dealerType
    );
    
    if (applicableDiscounts.length === 0) {
      console.log('❌ No applicable discounts found for testing');
      return;
    }
    
    const discount = applicableDiscounts[0];
    console.log(`🎯 Found discount: ${discount.discountName} (Max: ${discount.maxDiscountPercentage}%)`);
    
    // Test 1: Valid discount within limit
    console.log('\n📋 Test 1: Valid discount within limit');
    const validDiscountPercentage = discount.maxDiscountPercentage - 5; // 5% below max
    
    const validInvoiceData = {
      dealerId: dealer._id,
      items: [{
        product: product._id,
        productName: product.itemName,
        quantity: 10,
        unitPrice: 100,
        discountPercentage: validDiscountPercentage,
        gst: 18
      }],
      subtotal: 1000,
      totalDiscount: (1000 * validDiscountPercentage) / 100,
      totalGst: 180,
      totalAmount: 1000 - (1000 * validDiscountPercentage) / 100 + 180
    };
    
    // Mock request and response objects
    const mockReq = {
      body: validInvoiceData,
      user: { id: 'test-user-id' }
    };
    
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          console.log(`   Response Status: ${code}`);
          console.log(`   Response Data:`, data);
          return data;
        }
      }),
      json: (data) => {
        console.log(`   Response Data:`, data);
        return data;
      }
    };
    
    console.log(`   Attempting to create invoice with ${validDiscountPercentage}% discount...`);
    
    try {
      await createDealerInvoice(mockReq, mockRes);
      console.log('   ✅ Valid discount accepted');
    } catch (error) {
      console.log('   ❌ Valid discount rejected:', error.message);
    }
    
    // Test 2: Invalid discount exceeding limit
    console.log('\n📋 Test 2: Invalid discount exceeding limit');
    const invalidDiscountPercentage = discount.maxDiscountPercentage + 10; // 10% above max
    
    const invalidInvoiceData = {
      ...validInvoiceData,
      items: [{
        ...validInvoiceData.items[0],
        discountPercentage: invalidDiscountPercentage
      }]
    };
    
    const mockReq2 = {
      body: invalidInvoiceData,
      user: { id: 'test-user-id' }
    };
    
    console.log(`   Attempting to create invoice with ${invalidDiscountPercentage}% discount (exceeds ${discount.maxDiscountPercentage}% limit)...`);
    
    try {
      await createDealerInvoice(mockReq2, mockRes);
      console.log('   ❌ Invalid discount was accepted (should have been rejected)');
    } catch (error) {
      console.log('   ✅ Invalid discount correctly rejected:', error.message);
    }
    
    // Test 3: Level-based discount validation
    if (discount.discountType === 'level_based' || discount.discountType === 'both') {
      console.log('\n📋 Test 3: Level-based discount validation');
      
      if (discount.levels && discount.levels.length > 0) {
        const level = discount.levels[0];
        console.log(`   Testing with level: ${level.levelName} (${level.discountPercentage}%)`);
        
        const levelBasedInvoiceData = {
          ...validInvoiceData,
          items: [{
            ...validInvoiceData.items[0],
            discountPercentage: level.discountPercentage,
            selectedDiscountLevels: [level.levelName]
          }]
        };
        
        const mockReq3 = {
          body: levelBasedInvoiceData,
          user: { id: 'test-user-id' }
        };
        
        try {
          await createDealerInvoice(mockReq3, mockRes);
          console.log('   ✅ Level-based discount accepted');
        } catch (error) {
          console.log('   ❌ Level-based discount rejected:', error.message);
        }
      }
    }
    
    console.log('\n✅ Discount validation tests completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
};

const main = async () => {
  await connectDB();
  await testDiscountValidation();
  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
};

main().catch(console.error);