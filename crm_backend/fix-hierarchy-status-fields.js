import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const fixHierarchyStatusFields = async () => {
  try {
    console.log('🔧 Starting hierarchy status field fix...\n');

    // Check current status of all hierarchy collections
    console.log('📊 Current status of hierarchy collections:');
    
    // Brands
    const totalBrands = await Brand.countDocuments();
    const activeBrands = await Brand.countDocuments({ status: 'active' });
    const brandsWithoutStatus = await Brand.countDocuments({ status: { $exists: false } });
    console.log(`🏷️  Brands: Total=${totalBrands}, Active=${activeBrands}, Without Status=${brandsWithoutStatus}`);
    
    // Categories
    const totalCategories = await Category.countDocuments();
    const activeCategories = await Category.countDocuments({ status: 'active' });
    const categoriesWithoutStatus = await Category.countDocuments({ status: { $exists: false } });
    console.log(`📁 Categories: Total=${totalCategories}, Active=${activeCategories}, Without Status=${categoriesWithoutStatus}`);
    
    // Subcategories
    const totalSubcategories = await Subcategory.countDocuments();
    const activeSubcategories = await Subcategory.countDocuments({ status: 'active' });
    const subcategoriesWithoutStatus = await Subcategory.countDocuments({ status: { $exists: false } });
    console.log(`📂 Subcategories: Total=${totalSubcategories}, Active=${activeSubcategories}, Without Status=${subcategoriesWithoutStatus}`);
    
    // Extended Subcategories
    const totalExtended = await ExtendedSubcategory.countDocuments();
    const activeExtended = await ExtendedSubcategory.countDocuments({ status: 'active' });
    const extendedWithoutStatus = await ExtendedSubcategory.countDocuments({ status: { $exists: false } });
    console.log(`📋 Extended: Total=${totalExtended}, Active=${activeExtended}, Without Status=${extendedWithoutStatus}\n`);

    // Fix missing status fields
    console.log('🔧 Fixing missing status fields...\n');

    // Fix Brands
    if (brandsWithoutStatus > 0) {
      console.log(`🏷️  Fixing ${brandsWithoutStatus} brands without status...`);
      const brandResult = await Brand.updateMany(
        { status: { $exists: false } },
        { $set: { status: 'active' } }
      );
      console.log(`   ✅ Updated ${brandResult.modifiedCount} brands`);
    }

    // Fix Categories
    if (categoriesWithoutStatus > 0) {
      console.log(`📁 Fixing ${categoriesWithoutStatus} categories without status...`);
      const categoryResult = await Category.updateMany(
        { status: { $exists: false } },
        { $set: { status: 'active' } }
      );
      console.log(`   ✅ Updated ${categoryResult.modifiedCount} categories`);
    }

    // Fix Subcategories
    if (subcategoriesWithoutStatus > 0) {
      console.log(`📂 Fixing ${subcategoriesWithoutStatus} subcategories without status...`);
      const subcategoryResult = await Subcategory.updateMany(
        { status: { $exists: false } },
        { $set: { status: 'active' } }
      );
      console.log(`   ✅ Updated ${subcategoryResult.modifiedCount} subcategories`);
    }

    // Fix Extended Subcategories
    if (extendedWithoutStatus > 0) {
      console.log(`📋 Fixing ${extendedWithoutStatus} extended subcategories without status...`);
      const extendedResult = await ExtendedSubcategory.updateMany(
        { status: { $exists: false } },
        { $set: { status: 'active' } }
      );
      console.log(`   ✅ Updated ${extendedResult.modifiedCount} extended subcategories`);
    }

    console.log('\n📊 Final status after fix:');
    
    // Check final status
    const finalActiveBrands = await Brand.countDocuments({ status: 'active' });
    const finalActiveCategories = await Category.countDocuments({ status: 'active' });
    const finalActiveSubcategories = await Subcategory.countDocuments({ status: 'active' });
    const finalActiveExtended = await ExtendedSubcategory.countDocuments({ status: 'active' });
    
    console.log(`🏷️  Active Brands: ${finalActiveBrands}`);
    console.log(`📁 Active Categories: ${finalActiveCategories}`);
    console.log(`📂 Active Subcategories: ${finalActiveSubcategories}`);
    console.log(`📋 Active Extended: ${finalActiveExtended}`);

    // Test API endpoints
    console.log('\n🧪 Testing API endpoints...');
    
    // Test brands endpoint
    const testBrands = await Brand.find({ status: 'active' }).limit(5);
    console.log(`🏷️  Sample brands (${testBrands.length}):`, testBrands.map(b => ({ id: b._id, name: b.name, status: b.status })));
    
    // Test categories endpoint
    const testCategories = await Category.find({ status: 'active' }).limit(5);
    console.log(`📁 Sample categories (${testCategories.length}):`, testCategories.map(c => ({ id: c._id, name: c.name, status: c.status })));
    
    // Test subcategories endpoint
    const testSubcategories = await Subcategory.find({ status: 'active' }).limit(5);
    console.log(`📂 Sample subcategories (${testSubcategories.length}):`, testSubcategories.map(s => ({ id: s._id, name: s.name, status: s.status })));

    console.log('\n✅ Hierarchy status field fix completed successfully!');
    console.log('🔄 Please restart your backend server to ensure the changes take effect.');

  } catch (error) {
    console.error('❌ Error fixing hierarchy status fields:', error);
  }
};

const main = async () => {
  await connectDB();
  await fixHierarchyStatusFields();
  await mongoose.disconnect();
  console.log('🔌 Database connection closed');
};

main().catch(console.error);