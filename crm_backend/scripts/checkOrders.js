import mongoose from 'mongoose';
import SalesOrder from '../models/SalesOrder.js';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_backend');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkOrders = async () => {
  try {
    const orders = await SalesOrder.find({}).select('orderNumber').sort({orderNumber: -1});
    console.log(`Found ${orders.length} orders:`);
    orders.forEach((order, index) => {
      console.log(`${index + 1}. ${order.orderNumber}`);
    });
  } catch (error) {
    console.error('Error checking orders:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

connectDB().then(() => {
  checkOrders();
});
