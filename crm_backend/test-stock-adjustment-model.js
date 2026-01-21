import mongoose from 'mongoose';
import StockAdjustment from './models/StockAdjustment.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testStockAdjustmentModel() {
  try {
    console.log('🧪 Testing StockAdjustment Model...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_impex_crm');
    console.log('✅ Connected to MongoDB');
    
    // Test creating a stock adjustment
    const testAdjustment = new StockAdjustment({
      warehouseId: new mongoose.Types.ObjectId(),
      adjustmentType: "ADD",
      reason: "Opening Stock",
      remarks: "Test adjustment for debugging",
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          productCode: "TEST001",
          itemName: "Test Product",
          currentStock: 0,
          quantity: 10,
          unitPrice: 100,
          remarks: "Test item"
        }
      ],
      createdBy: new mongoose.Types.ObjectId()
    });
    
    console.log('\n📋 Before save:');
    console.log('adjustmentNo:', testAdjustment.adjustmentNo);
    console.log('totalItems:', testAdjustment.totalItems);
    console.log('totalQuantity:', testAdjustment.totalQuantity);
    console.log('totalValue:', testAdjustment.totalValue);
    
    // Save the adjustment
    const savedAdjustment = await testAdjustment.save();
    
    console.log('\n✅ StockAdjustment saved successfully!');
    console.log('📋 After save:');
    console.log('adjustmentNo:', savedAdjustment.adjustmentNo);
    console.log('totalItems:', savedAdjustment.totalItems);
    console.log('totalQuantity:', savedAdjustment.totalQuantity);
    console.log('totalValue:', savedAdjustment.totalValue);
    console.log('items[0].totalValue:', savedAdjustment.items[0].totalValue);
    
    // Clean up - delete the test record
    await StockAdjustment.findByIdAndDelete(savedAdjustment._id);
    console.log('🧹 Test record cleaned up');
    
  } catch (error) {
    console.error('❌ Error testing StockAdjustment model:', error.message);
    if (error.errors) {
      console.log('\n📋 Validation errors:');
      Object.keys(error.errors).forEach(key => {
        console.log(`- ${key}: ${error.errors[key].message}`);
      });
    }
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testStockAdjustmentModel();