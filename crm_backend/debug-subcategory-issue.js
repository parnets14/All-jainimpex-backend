import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Subcategory from './models/Subcategory.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import User from './models/User.js';
import { generateToken } from './utils/jwtUtils.js';

dotenv.config();

async function debugSubcategoryIssue() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 DEBUGGING SUBCATEGORY ISSUE');
    console.log('='.repeat(60));

    // 1. Check subcategory data
    console.log('\n📊 SUBCATEGORY DATA CHECK:');
    const totalSubcategories = await Subcategory.countDocuments();
    const activeSubcategories = await Subcategory.countDocuments({ status: 'active' });
    
    console.log(`Total subcategories: ${totalSubcategories}`);
    console.log(`Active subcategories: ${activeSubcategories}`);

    if (activeSubcategories > 0) {
      const sampleSubcategory = await Subcategory.findOne({ status: 'active' })
        .populate('brand', 'name')
        .populate('category', 'name');
      
      console.log(`Sample subcategory: ${sampleSubcategory.name}`);
      console.log(`  Brand: ${sampleSubcategory.brand?.name || 'N/A'}`);
      console.log(`  Category: ${sampleSubcategory.category?.name || 'N/A'}`);
    }

    // 2. Check user permissions
    console.log('\n📊 USER PERMISSIONS CHECK:');
    const superAdmin = await User.findOne({ role: 'super_admin' });
    
    if (superAdmin) {
      console.log(`Super admin: ${superAdmin.name}`);
      console.log(`Has categories.view permission: ${superAdmin.permissions?.includes('categories.view') || false}`);
      console.log(`Total permissions: ${superAdmin.permissions?.length || 0}`);
      
      // Generate token for testing
      const token = generateToken(superAdmin._id);
      console.log(`Token generated: ${token.length} characters`);
      
      // 3. Test subcategory API endpoint
      console.log('\n🔍 TESTING SUBCATEGORY API:');
      try {
        const response = await fetch('http://localhost:5000/api/subcategories', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`API Response Status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Subcategories API success - ${data.data?.length || 0} subcategories returned`);
          if (data.data?.length > 0) {
            console.log(`   Sample: ${data.data[0].name}`);
          }
        } else {
          const errorText = await response.text();
          console.log(`❌ Subcategories API failed: ${errorText}`);
        }
      } catch (error) {
        console.log(`❌ API call error: ${error.message}`);
        console.log('   Make sure backend server is running on port 5000');
      }
    } else {
      console.log('❌ No super admin found');
    }

    // 4. Check if there are any specific issues with subcategory model
    console.log('\n🔍 SUBCATEGORY MODEL VALIDATION:');
    try {
      const subcategories = await Subcategory.find({ status: 'active' })
        .populate('brand', 'name')
        .populate('category', 'name')
        .limit(3);
      
      console.log('Sample subcategories with populated data:');
      subcategories.forEach((sub, index) => {
        console.log(`  ${index + 1}. ${sub.name}`);
        console.log(`     Brand: ${sub.brand?.name || 'Missing'}`);
        console.log(`     Category: ${sub.category?.name || 'Missing'}`);
        console.log(`     Status: ${sub.status}`);
      });
    } catch (error) {
      console.log(`❌ Error fetching subcategories: ${error.message}`);
    }

    // 5. Check for any database connection issues
    console.log('\n🔍 DATABASE CONNECTION STATUS:');
    console.log(`MongoDB connection state: ${mongoose.connection.readyState}`);
    console.log(`Database name: ${mongoose.connection.db?.databaseName}`);

    console.log('\n🔧 RECOMMENDATIONS:');
    console.log('1. Ensure backend server is running');
    console.log('2. Check if super admin has categories.view permission');
    console.log('3. Verify subcategory API route is properly configured');
    console.log('4. Test frontend API call with proper authentication');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugSubcategoryIssue();