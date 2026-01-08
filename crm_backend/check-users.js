import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const checkUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');
    
    const users = await User.find({}, 'name email role').limit(5);
    console.log('Available users:');
    users.forEach(user => {
      console.log(`- ${user.email} (${user.name}) - Role: ${user.role}`);
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
};

checkUsers();