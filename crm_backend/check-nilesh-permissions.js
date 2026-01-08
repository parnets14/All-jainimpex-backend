import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const checkNileshPermissions = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    const nilesh = await User.findOne({ email: 'nilesh123@gmail.com' });
    
    if (!nilesh) {
      console.log('Nilesh not found');
      process.exit(1);
    }

    console.log('\n=== NILESH USER INFO ===');
    console.log('Name:', nilesh.name);
    console.log('Email:', nilesh.email);
    console.log('Role:', nilesh.role);
    console.log('\n=== PERMISSIONS ===');
    console.log('Total permissions:', nilesh.permissions?.length || 0);
    console.log('Permissions:', JSON.stringify(nilesh.permissions, null, 2));
    
    console.log('\n=== PRODUCT PERMISSIONS CHECK ===');
    console.log('Has product.master?', nilesh.permissions?.includes('product.master'));
    console.log('Has products.update?', nilesh.permissions?.includes('products.update'));
    console.log('Has products.delete?', nilesh.permissions?.includes('products.delete'));
    console.log('Has product.management?', nilesh.permissions?.includes('product.management'));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkNileshPermissions();
