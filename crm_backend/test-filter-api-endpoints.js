import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

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

const testFilterEndpoints = async () => {
  try {
    console.log('🧪 Testing filter API endpoints...\n');

    // Test getBrands with active status
    console.log('🏷️  Testing getBrands with status=active...');
    const brandsFilter = { status: 'active' };
    const brands = await Brand.find(brandsFilter)
      .sort({ createdAt: -1 })
      .limit(10);

    console.log(`   Found ${brands.length} active brands:`);
    brands.forEach((brand, index) => {
      console.log(`   ${index + 1}. ${brand.name} (ID: ${brand._id}, Status: ${brand.status})`);
    });

    // Simulate API response format
    const brandsResponse = {
      success: true,
      data: brands,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: brands.length,
        itemsPerPage: 10,
      },
    };
    console.log('   API Response format:', {
      success: brandsResponse.success,
      dataLength: brandsResponse.data.length,
      pagination: brandsResponse.pagination
    });

    console.log('\n📁 Testing getCategories with status=active...');
    const categoriesFilter = { status: 'active' };
    const categories = await Category.find(categoriesFilter)
      .sort({ createdAt: -1 })
      .limit(10);

    console.log(`   Found ${categories.length} active categories:`);
    categories.forEach((category, index) => {
      console.log(`   ${index + 1}. ${category.name} (ID: ${category._id}, Status: ${category.status})`);
    });

    // Simulate API response format
    const categoriesResponse = {
      success: true,
      data: categories,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: categories.length,
        itemsPerPage: 10,
      },
    };
    console.log('   API Response format:', {
      success: categoriesResponse.success,
      dataLength: categoriesResponse.data.length,
      pagination: categoriesResponse.pagination
    });

    console.log('\n📂 Testing getSubcategories with status=active...');
    const subcategoriesFilter = { status: 'active' };
    const subcategories = await Subcategory.find(subcategoriesFilter)
      .sort({ createdAt: -1 })
      .limit(10);

    console.log(`   Found ${subcategories.length} active subcategories:`);
    subcategories.forEach((subcategory, index) => {
      console.log(`   ${index + 1}. ${subcategory.name} (ID: ${subcategory._id}, Status: ${subcategory.status})`);
    });

    // Simulate API response format
    const subcategoriesResponse = {
      success: true,
      data: subcategories,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: subcategories.length,
        itemsPerPage: 10,
      },
    };
    console.log('   API Response format:', {
      success: subcategoriesResponse.success,
      dataLength: subcategoriesResponse.data.length,
      pagination: subcategoriesResponse.pagination
    });

    console.log('\n✅ All filter endpoints tested successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Brands: ${brands.length} active records`);
    console.log(`   - Categories: ${categories.length} active records`);
    console.log(`   - Subcategories: ${subcategories.length} active records`);

    if (brands.length === 0 || categories.length === 0 || subcategories.length === 0) {
      console.log('\n⚠️  Some collections have no active records. This explains why the frontend filters are empty.');
      console.log('   Consider creating some test data or checking if existing records have the correct status.');
    } else {
      console.log('\n✅ All collections have active records. The API should return data correctly.');
    }

  } catch (error) {
    console.error('❌ Error testing filter endpoints:', error);
  }
};

const main = async () => {
  await connectDB();
  await testFilterEndpoints();
  await mongoose.disconnect();
  console.log('🔌 Database connection closed');
};

main().catch(console.error);