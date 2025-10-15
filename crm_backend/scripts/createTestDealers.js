import mongoose from 'mongoose';
import Dealer from '../models/Dealer.js';
import Region from '../models/Region.js';
import User from '../models/User.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jaininpexcrm', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB');
  
  try {
    // Create a default region if it doesn't exist
    let region = await Region.findOne({ name: 'Default Region' });
    if (!region) {
      region = new Region({
        name: 'Default Region',
        description: 'Default region for dealers',
        code: 'DEF',
        status: 'active',
        createdBy: new mongoose.Types.ObjectId()
      });
      await region.save();
      console.log('Created default region');
    }
    
    // Get a user to use as createdBy
    let user = await User.findOne({ role: 'super_admin' });
    if (!user) {
      // Try to find any user
      user = await User.findOne();
      if (!user) {
        console.log('No users found. Please create a user first.');
        process.exit(1);
      }
    }
    console.log('Using user:', user.email, 'as createdBy');
    
    // Create sample dealers
    const dealers = [
      {
        code: 'DLR1001',
        name: 'ABC Plumbing Solutions',
        contactPerson: 'John Smith',
        phone: '9876543210',
        email: 'john@abcplumbing.com',
        address: '123 Main Street, Mumbai, Maharashtra 400001',
        dealerType: 'Retail',
        dealerCategory: ['Plumbing'],
        categoryIds: ['cat1'],
        regionId: region._id.toString(),
        salesExecutiveId: user._id.toString(),
        creditLimit: 50000,
        creditDays: 30,
        gst: '27ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        createdBy: user._id
      },
      {
        code: 'DLR1002',
        name: 'XYZ Hardware Store',
        contactPerson: 'Jane Doe',
        phone: '9876543211',
        email: 'jane@xyzhardware.com',
        address: '456 Business Park, Delhi, Delhi 110001',
        dealerType: 'Wholesale',
        dealerCategory: ['Hardware'],
        categoryIds: ['cat2'],
        regionId: region._id.toString(),
        salesExecutiveId: user._id.toString(),
        creditLimit: 100000,
        creditDays: 45,
        gst: '07FGHIJ5678K2L6',
        pan: 'FGHIJ5678K',
        createdBy: user._id
      },
      {
        code: 'DLR1003',
        name: 'PQR Construction Co.',
        contactPerson: 'Mike Johnson',
        phone: '9876543212',
        email: 'mike@pqrconstruction.com',
        address: '789 Industrial Area, Bangalore, Karnataka 560001',
        dealerType: 'Contractor',
        dealerCategory: ['Construction'],
        categoryIds: ['cat3'],
        regionId: region._id.toString(),
        salesExecutiveId: user._id.toString(),
        creditLimit: 200000,
        creditDays: 60,
        gst: '29MNOPQ9012R3S7',
        pan: 'MNOPQ9012R',
        createdBy: user._id
      },
      {
        code: 'DLR1004',
        name: 'sagar',
        contactPerson: 'Sagar Kumar',
        phone: '9837819156',
        email: 'sagar@sagar.com',
        address: '321 Commercial Street, Chennai, Tamil Nadu 600001',
        dealerType: 'Retail',
        dealerCategory: ['Plumbing'],
        categoryIds: ['cat1'],
        regionId: region._id.toString(),
        salesExecutiveId: user._id.toString(),
        creditLimit: 75000,
        creditDays: 30,
        gst: '33TUVWX3456Y4T8',
        pan: 'TUVWX3456Y',
        createdBy: user._id
      },
      {
        code: 'DLR1005',
        name: 'san',
        contactPerson: 'Sanjay Patel',
        phone: '8845347512',
        email: 'sanjay@san.com',
        address: '654 Market Road, Pune, Maharashtra 411001',
        dealerType: 'Wholesale',
        dealerCategory: ['Hardware'],
        categoryIds: ['cat2'],
        regionId: region._id.toString(),
        salesExecutiveId: user._id.toString(),
        creditLimit: 125000,
        creditDays: 45,
        gst: '27ZABCD7890E5U9',
        pan: 'ZABCD7890E',
        createdBy: user._id
      }
    ];
    
    // Clear existing test dealers
    await Dealer.deleteMany({ code: { $regex: /^DLR100/ } });
    console.log('Cleared existing test dealers');
    
    // Create new dealers
    for (const dealerData of dealers) {
      const dealer = new Dealer(dealerData);
      await dealer.save();
      console.log(`Created dealer: ${dealer.code} - ${dealer.name}`);
    }
    
    console.log('Test dealers created successfully!');
    console.log('You can now test the dealer selection in the frontend.');
    
  } catch (error) {
    console.error('Error creating test dealers:', error);
  } finally {
    mongoose.connection.close();
  }
}).catch(error => {
  console.error('MongoDB connection error:', error);
});
