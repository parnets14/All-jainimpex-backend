import mongoose from 'mongoose';
import SalesOrder from '../models/SalesOrder.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_backend');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Generate unique order number (same function as in controller)
const generateOrderNumber = async () => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `SO-${currentYear}-`;
    
    // Find the highest order number for this year
    const lastOrder = await SalesOrder.findOne({
      orderNumber: { $regex: `^${prefix}` }
    }).sort({ orderNumber: -1 });
    
    let nextNumber = 1;
    if (lastOrder) {
      // Extract the number from the last order
      const lastNumber = parseInt(lastOrder.orderNumber.split('-')[2]);
      nextNumber = lastNumber + 1;
    }
    
    // Format with leading zeros (4 digits)
    const orderNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
    
    // Double-check uniqueness (in case of race conditions)
    const existingOrder = await SalesOrder.findOne({ orderNumber });
    if (existingOrder) {
      // If somehow it exists, try the next number
      return `${prefix}${(nextNumber + 1).toString().padStart(4, '0')}`;
    }
    
    return orderNumber;
  } catch (error) {
    console.error('Error generating order number:', error);
    // Fallback to timestamp-based number
    const timestamp = Date.now().toString().slice(-6);
    return `SO-${new Date().getFullYear()}-${timestamp}`;
  }
};

const testOrderNumberGeneration = async () => {
  try {
    console.log('🔍 Testing order number generation...');
    
    // Check existing orders
    const existingOrders = await SalesOrder.find({})
      .select('orderNumber')
      .sort({ orderNumber: -1 })
      .limit(5);
    
    console.log('📊 Existing orders:');
    existingOrders.forEach((order, index) => {
      console.log(`${index + 1}. ${order.orderNumber}`);
    });
    
    // Generate new order number
    const newOrderNumber = await generateOrderNumber();
    console.log(`✅ Generated new order number: ${newOrderNumber}`);
    
    // Test uniqueness by generating multiple numbers
    console.log('\n🔍 Testing uniqueness:');
    const generatedNumbers = new Set();
    for (let i = 0; i < 5; i++) {
      const testNumber = await generateOrderNumber();
      if (generatedNumbers.has(testNumber)) {
        console.log(`❌ Duplicate found: ${testNumber}`);
      } else {
        console.log(`✅ Unique: ${testNumber}`);
        generatedNumbers.add(testNumber);
      }
    }
    
    console.log(`\n📊 Generated ${generatedNumbers.size} unique numbers`);
    
  } catch (error) {
    console.error('❌ Error testing order number generation:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run the test
connectDB().then(() => {
  testOrderNumberGeneration();
});