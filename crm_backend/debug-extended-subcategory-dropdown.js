import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

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

const debugExtendedSubcategoryDropdown = async () => {
  try {
    console.log('\n🔍 Debugging Extended Subcategory Dropdown Issue...\n');

    // Get the specific hierarchy from the screenshot
    const brand = await Brand.findOne({ name: 'Cera' });
    if (!brand) {
      console.log('❌ Brand "Cera" not found');
      return;
    }
    console.log(`✅ Found Brand: ${brand.name} (ID: ${brand._id})`);

    const category = await Category.findOne({ 
      name: { $regex: /aa/i },
      $or: [
        { brand: brand._id },
        { brand: brand._id.toString() }
      ]
    });
    if (!category) {
      console.log('❌ Category with "aa" not found for Cera brand');
      return;
    }
    console.log(`✅ Found Category: ${category.name} (ID: ${category._id})`);
    console.log(`   Category Brand: ${category.brand} (Type: ${typeof category.brand})`);

    const subcategory = await Subcategory.findOne({ 
      name: { $regex: /aaa/i },
      $or: [
        { brand: brand._id },
        { brand: brand._id.toString() }
      ],
      $or: [
        { category: category._id },
        { category: category._id.toString() }
      ]
    });
    if (!subcategory) {
      console.log('❌ Subcategory with "aaa" not found for the selected hierarchy');
      return;
    }
    console.log(`✅ Found Subcategory: ${subcategory.name} (ID: ${subcategory._id})`);
    console.log(`   Subcategory Brand: ${subcategory.brand} (Type: ${typeof subcategory.brand})`);
    console.log(`   Subcategory Category: ${subcategory.category} (Type: ${typeof subcategory.category})`);

    // Now check for extended subcategories
    console.log('\n🔍 Checking Extended Subcategories...');
    
    // Get all extended subcategories for debugging
    const allExtended = await ExtendedSubcategory.find({})
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .limit(10);
    
    console.log(`\n📊 Total Extended Subcategories in DB: ${allExtended.length}`);
    allExtended.forEach((ext, index) => {
      console.log(`\n   Extended ${index + 1}:`);
      console.log(`   - Name: ${ext.name}`);
      console.log(`   - Level: ${ext.level}`);
      console.log(`   - Brand: ${ext.brand?.name || 'Not populated'} (ID: ${ext.brand})`);
      console.log(`   - Category: ${ext.category?.name || 'Not populated'} (ID: ${ext.category})`);
      console.log(`   - Subcategory: ${ext.subcategory?.name || 'Not populated'} (ID: ${ext.subcategory})`);
    });

    // Check for extended subcategories matching our hierarchy
    console.log('\n🔍 Searching for Extended Level 1 matching our hierarchy...');
    
    const extendedLevel1Options = await ExtendedSubcategory.find({
      level: 1,
      $or: [
        { brand: brand._id },
        { brand: brand._id.toString() }
      ],
      $or: [
        { category: category._id },
        { category: category._id.toString() }
      ],
      $or: [
        { subcategory: subcategory._id },
        { subcategory: subcategory._id.toString() }
      ]
    }).populate('brand category subcategory', 'name');

    console.log(`\n📋 Extended Level 1 Options Found: ${extendedLevel1Options.length}`);
    
    if (extendedLevel1Options.length === 0) {
      console.log('\n❌ No Extended Level 1 options found for this hierarchy!');
      
      // Let's check what extended subcategories exist for this brand
      const brandExtended = await ExtendedSubcategory.find({
        $or: [
          { brand: brand._id },
          { brand: brand._id.toString() }
        ]
      }).populate('brand category subcategory', 'name');
      
      console.log(`\n🔍 Extended subcategories for brand "${brand.name}": ${brandExtended.length}`);
      brandExtended.forEach((ext, index) => {
        console.log(`\n   Brand Extended ${index + 1}:`);
        console.log(`   - Name: ${ext.name}`);
        console.log(`   - Level: ${ext.level}`);
        console.log(`   - Brand Match: ${ext.brand?.name} (${ext.brand}) vs ${brand.name} (${brand._id})`);
        console.log(`   - Category: ${ext.category?.name} (${ext.category}) vs ${category.name} (${category._id})`);
        console.log(`   - Subcategory: ${ext.subcategory?.name} (${ext.subcategory}) vs ${subcategory.name} (${subcategory._id})`);
      });
      
    } else {
      extendedLevel1Options.forEach((ext, index) => {
        console.log(`\n   Level 1 Option ${index + 1}:`);
        console.log(`   - Name: ${ext.name}`);
        console.log(`   - Level: ${ext.level}`);
        console.log(`   - Brand: ${ext.brand?.name}`);
        console.log(`   - Category: ${ext.category?.name}`);
        console.log(`   - Subcategory: ${ext.subcategory?.name}`);
      });
    }

    // Test the exact filtering logic from the frontend
    console.log('\n🧪 Testing Frontend Filtering Logic...');
    
    const allExtendedSubcategories = await ExtendedSubcategory.find({});
    
    const frontendFiltered = allExtendedSubcategories.filter((ext) => {
      const brandMatch = (ext.brand?.toString() === brand._id.toString()) || (ext.brand?.toString() === brand._id.toString());
      const categoryMatch = (ext.category?.toString() === category._id.toString()) || (ext.category?.toString() === category._id.toString());
      const subcategoryMatch = (ext.subcategory?.toString() === subcategory._id.toString()) || (ext.subcategory?.toString() === subcategory._id.toString());
      const levelMatch = ext.level === 1;
      
      console.log(`\n   Testing Extended: ${ext.name}`);
      console.log(`   - Brand Match: ${brandMatch} (${ext.brand} vs ${brand._id})`);
      console.log(`   - Category Match: ${categoryMatch} (${ext.category} vs ${category._id})`);
      console.log(`   - Subcategory Match: ${subcategoryMatch} (${ext.subcategory} vs ${subcategory._id})`);
      console.log(`   - Level Match: ${levelMatch} (${ext.level} vs 1)`);
      console.log(`   - Overall Match: ${brandMatch && categoryMatch && subcategoryMatch && levelMatch}`);
      
      return brandMatch && categoryMatch && subcategoryMatch && levelMatch;
    });
    
    console.log(`\n📊 Frontend Logic Result: ${frontendFiltered.length} matches`);
    frontendFiltered.forEach((ext, index) => {
      console.log(`   Match ${index + 1}: ${ext.name}`);
    });

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
};

const main = async () => {
  await connectDB();
  await debugExtendedSubcategoryDropdown();
  await mongoose.disconnect();
  console.log('\n👋 Disconnected from MongoDB');
};

main().catch(console.error);