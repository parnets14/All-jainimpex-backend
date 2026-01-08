// test-login.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

// User Schema (copied from models/User.js)
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    required: true,
    enum: [
      'super_admin',
      'admin', 
      'sub_admin',
      'sales_manager',
      'purchase_manager',
      'finance_manager',
      'hr_manager',
      'sales_executive',
      'delivery_executive',
      'warehouse_manager',
      'inventory_manager',
      'dealer'
    ],
    default: 'sales_executive'
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  },
  permissions: [{
    type: String
  }],
  assignedRegions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Region'
  }],
  lastLogin: {
    type: Date,
    default: null
  },
  joinDate: {
    type: Date,
    default: Date.now
  },
  location: {
    type: String,
    default: 'Default Location'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);

async function testSpecificUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find the specific user
    const targetEmail = 'nileshshreejainimpex@outlook.com';
    const user = await User.findOne({ email: targetEmail });
    
    if (!user) {
      console.log(`❌ User with email ${targetEmail} not found`);
      
      // Search for similar emails
      const similarUsers = await User.find({ 
        email: { $regex: 'nilesh', $options: 'i' } 
      });
      
      console.log(`\n🔍 Found ${similarUsers.length} users with 'nilesh' in email:`);
      similarUsers.forEach((u, index) => {
        console.log(`${index + 1}. ${u.email} (${u.username}) - ${u.role} - ${u.status}`);
      });
      
      return;
    }

    console.log(`\n📊 User Details for ${targetEmail}:`);
    console.log(`   ID: ${user._id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Phone: ${user.phone}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Permissions: ${user.permissions}`);
    console.log(`   Last Login: ${user.lastLogin || 'Never'}`);
    console.log(`   Created: ${user.createdAt}`);
    console.log(`   Password Hash: ${user.password.substring(0, 20)}...`);

    // Test password verification
    console.log('\n🔐 Testing password verification:');
    
    const testPasswords = [
      'nilesh123',
      'Nilesh123',
      'NILESH123',
      'nilesh@123',
      'password',
      '123456',
      'admin123'
    ];

    let passwordFound = false;
    for (const testPassword of testPasswords) {
      try {
        const isMatch = await bcrypt.compare(testPassword, user.password);
        if (isMatch) {
          console.log(`   ✅ Password "${testPassword}" - MATCH!`);
          console.log(`   📧 Email: ${user.email}`);
          console.log(`   🔑 Password: ${testPassword}`);
          passwordFound = true;
        } else {
          console.log(`   ❌ Password "${testPassword}" - No match`);
        }
      } catch (error) {
        console.log(`   ⚠️  Error testing password "${testPassword}": ${error.message}`);
      }
    }

    if (!passwordFound) {
      console.log('\n⚠️  No matching password found. Let me update it to "nilesh123"');
      
      // Update password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash('nilesh123', salt);
      
      await User.findByIdAndUpdate(user._id, {
        password: hashedPassword,
        status: 'Active' // Ensure user is active
      });
      
      console.log('✅ Password updated to: nilesh123');
      console.log('✅ Status set to: Active');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run the script
testSpecificUser();