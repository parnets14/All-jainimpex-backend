// debug-password-update.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';

dotenv.config();

async function debugPasswordUpdate() {
  try {
    console.log('🔍 Debugging Password Update...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find the nilesh user
    const user = await User.findOne({ email: 'nileshshreejainimpex@outlook.com' }).select('+password');
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('📋 Current user info:');
    console.log('- Name:', user.name);
    console.log('- Email:', user.email);
    console.log('- Current password hash:', user.password);

    // Test current password
    console.log('\n🧪 Testing current password "nilesh123"...');
    const isCurrentValid = await user.comparePassword('nilesh123');
    console.log('Current password valid:', isCurrentValid);

    // Update password using the model's save method
    console.log('\n🔄 Updating password to "newpassword123"...');
    user.password = 'newpassword123';
    await user.save();
    
    console.log('✅ Password updated');
    console.log('- New password hash:', user.password);

    // Test new password
    console.log('\n🧪 Testing new password "newpassword123"...');
    const isNewValid = await user.comparePassword('newpassword123');
    console.log('New password valid:', isNewValid);

    // Test old password (should fail)
    console.log('\n🧪 Testing old password "nilesh123" (should fail)...');
    const isOldValid = await user.comparePassword('nilesh123');
    console.log('Old password valid:', isOldValid);

    // Restore original password
    console.log('\n🔄 Restoring original password...');
    user.password = 'nilesh123';
    await user.save();
    console.log('✅ Original password restored');

  } catch (error) {
    console.error('❌ Debug Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the debug
debugPasswordUpdate();