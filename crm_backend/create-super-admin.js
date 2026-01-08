// create-super-admin.js
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

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

const User = mongoose.model('User', userSchema);

async function createSuperAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ 
      $or: [
        { email: 'superadmin@jainimpex.com' },
        { username: 'superadmin' },
        { role: 'super_admin' }
      ]
    });

    if (existingSuperAdmin) {
      console.log('⚠️  Super admin already exists:');
      console.log('   Email:', existingSuperAdmin.email);
      console.log('   Username:', existingSuperAdmin.username);
      console.log('   Role:', existingSuperAdmin.role);
      console.log('   Status:', existingSuperAdmin.status);
      
      // Update password if needed
      const newPassword = 'superadmin123';
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      await User.findByIdAndUpdate(existingSuperAdmin._id, {
        password: hashedPassword,
        status: 'Active',
        permissions: ['*']
      });
      
      console.log('✅ Super admin password updated to: superadmin123');
      return;
    }

    // Create new super admin
    const superAdmin = new User({
      name: 'Super Administrator',
      username: 'superadmin',
      email: 'superadmin@jainimpex.com',
      password: 'superadmin123', // Will be hashed by pre-save hook
      phone: '+91-9999999999',
      role: 'super_admin',
      status: 'Active',
      permissions: ['*'], // Full access
      location: 'Head Office'
    });

    await superAdmin.save();
    
    console.log('✅ Super admin created successfully!');
    console.log('   Email: superadmin@jainimpex.com');
    console.log('   Password: superadmin123');
    console.log('   Role: super_admin');
    console.log('   Status: Active');

  } catch (error) {
    console.error('❌ Error creating super admin:', error.message);
    if (error.code === 11000) {
      console.log('   Duplicate key error - user might already exist');
    }
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

// Run the script
createSuperAdmin();