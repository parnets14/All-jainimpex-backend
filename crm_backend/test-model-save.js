// test-model-save.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';

dotenv.config();

async function testModelSave() {
  try {
    console.log('🧪 Testing User Model Save...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find the nilesh user with password
    console.log('\n1. Finding user with password...');
    const user = await User.findOne({ email: 'nileshshreejainimpex@outlook.com' }).select('+password');
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('✅ User found');
    console.log('- Name:', user.name);
    console.log('- Email:', user.email);
    console.log('- Current password hash:', user.password);

    // Test current password
    console.log('\n2. Testing current password...');
    const isCurrentValid = await user.comparePassword('nilesh123');
    console.log('Current password "nilesh123" valid:', isCurrentValid);

    // Update password using save method (simulating controller logic)
    console.log('\n3. Updating password using save method...');
    console.log('Before update - password hash:', user.password);
    console.log('Before update - isModified(password):', user.isModified('password'));
    
    user.password = 'newpassword123';
    
    console.log('After setting password - password field:', user.password);
    console.log('After setting password - isModified(password):', user.isModified('password'));
    
    await user.save();
    
    console.log('After save - password hash:', user.password);

    // Test new password
    console.log('\n4. Testing new password...');
    const isNewValid = await user.comparePassword('newpassword123');
    console.log('New password "newpassword123" valid:', isNewValid);

    // Test old password (should fail)
    console.log('\n5. Testing old password...');
    const isOldValid = await user.comparePassword('nilesh123');
    console.log('Old password "nilesh123" valid:', isOldValid);

    // Restore original password
    console.log('\n6. Restoring original password...');
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
testModelSave();