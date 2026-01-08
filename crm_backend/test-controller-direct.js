// test-controller-direct.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';

dotenv.config();

async function testControllerLogicDirect() {
  try {
    console.log('🧪 Testing Controller Logic Directly...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Simulate the controller logic
    const userId = '6950f6ff1843e5838b60b9e0'; // nilesh user ID
    const password = 'newpassword123';
    
    console.log('\n1. Finding user with password...');
    // Check if user exists (with password field)
    const user = await User.findById(userId).select('+password');
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('✅ User found');
    console.log('- Name:', user.name);
    console.log('- Email:', user.email);
    console.log('- Current password hash:', user.password);

    // Simulate the controller update logic
    console.log('\n2. Simulating controller update logic...');
    
    const name = user.name;
    const username = user.username;
    const email = user.email;
    const phone = user.phone;
    const role = user.role;
    const status = user.status;
    const permissions = user.permissions;
    const assignedRegions = user.assignedRegions;
    const location = user.location;

    // Handle password update if provided
    if (password && password.trim()) {
      // Validate password length
      if (password.length < 6) {
        console.log('❌ Password too short');
        return;
      }
      
      console.log(`Updating password for user: ${email}`);
      console.log(`Old password hash: ${user.password}`);
      console.log(`New password (plain): ${password}`);
      
      // Update all fields including password using save() to trigger pre('save') middleware
      user.name = name;
      user.username = username;
      user.email = email;
      user.phone = phone;
      user.role = role;
      user.status = status;
      user.permissions = permissions;
      user.assignedRegions = assignedRegions;
      user.location = location;
      user.password = password; // This will trigger the pre('save') middleware to hash it
      
      console.log(`Password field set to: ${user.password}`);
      console.log(`Is password modified: ${user.isModified('password')}`);
      
      await user.save();
      
      console.log(`After save - password hash: ${user.password}`);
      console.log(`Password updated for user: ${email}`);
    }

    // Test the new password
    console.log('\n3. Testing new password...');
    const isNewValid = await user.comparePassword(password);
    console.log('New password valid:', isNewValid);

    // Restore original password
    console.log('\n4. Restoring original password...');
    user.password = 'nilesh123';
    await user.save();
    console.log('✅ Original password restored');

  } catch (error) {
    console.error('❌ Test Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testControllerLogicDirect();