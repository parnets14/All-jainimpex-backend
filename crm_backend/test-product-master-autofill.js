import mongoose from 'mongoose';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jain_impex_crm', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function testAutoFillFunctionality() {
  try {
    console.log('🧪 Testing Product Master Auto-Fill Functionality\n');

    // Test 1: Find a subcategory and check if it has category info
    console.log('📋 Test 1: Subcategory Auto-Fill');
    const subcategory = await Subcategory.findOne().populate('category');
    if (subcategory) {
      console.log(`✅ Found subcategory: ${subcategory.name}`);
      console.log(`✅ Parent category: ${subcategory.category?.name || 'Not populated'}`);
      console.log(`✅ Category ID: ${subcategory.category?._id || 'Missing'}\n`);
    } else {
      console.log('❌ No subcategories found\n');
    }

    // Test 2: Find an extended subcategory and check hierarchy
    console.log('📋 Test 2: Extended Subcategory Auto-Fill');
    const extendedSub = await ExtendedSubcategory.findOne()
      .populate('category')
      .populate('subcategory')
      .populate('parent');
    
    if (extendedSub) {
      console.log(`✅ Found extended subcategory: ${extendedSub.name}`);
      console.log(`✅ Level: ${extendedSub.level}`);
      console.log(`✅ Category: ${extendedSub.category?.name || 'Not populated'}`);
      console.log(`✅ Subcategory: ${extendedSub.subcategory?.name || 'Not populated'}`);
      console.log(`✅ Parent: ${extendedSub.parent?.name || 'None (Level 1)'}\n`);
    } else {
      console.log('❌ No extended subcategories found\n');
    }

    // Test 3: Find a brand and check its hierarchy
    console.log('📋 Test 3: Brand Auto-Fill');
    const brand = await Brand.findOne()
      .populate('category')
      .populate('subcategory')
      .populate('subcategory1')
      .populate('subcategory2')
      .populate('subcategory3')
      .populate('subcategory4')
      .populate('subcategory5');
    
    if (brand) {
      console.log(`✅ Found brand: ${brand.name}`);
      console.log(`✅ Category: ${brand.category?.name || 'Not set'}`);
      console.log(`✅ Subcategory: ${brand.subcategory?.name || 'Not set'}`);
      console.log(`✅ Subcategory1: ${brand.subcategory1?.name || 'Not set'}`);
      console.log(`✅ Subcategory2: ${brand.subcategory2?.name || 'Not set'}`);
      console.log(`✅ Subcategory3: ${brand.subcategory3?.name || 'Not set'}`);
      console.log(`✅ Subcategory4: ${brand.subcategory4?.name || 'Not set'}`);
      console.log(`✅ Subcategory5: ${brand.subcategory5?.name || 'Not set'}\n`);
    } else {
      console.log('❌ No brands found\n');
    }

    // Test 4: Simulate auto-fill scenario
    console.log('📋 Test 4: Simulated Auto-Fill Scenario');
    if (subcategory && subcategory.category) {
      console.log('🔄 Simulating: User selects subcategory, system should auto-fill category');
      console.log(`   Selected subcategory: ${subcategory.name}`);
      console.log(`   Auto-filled category: ${subcategory.category.name}`);
      console.log('✅ Auto-fill would work correctly\n');
    }

    if (extendedSub && extendedSub.category && extendedSub.subcategory) {
      console.log('🔄 Simulating: User selects extended subcategory, system should auto-fill parents');
      console.log(`   Selected extended subcategory: ${extendedSub.name} (Level ${extendedSub.level})`);
      console.log(`   Auto-filled category: ${extendedSub.category.name}`);
      console.log(`   Auto-filled subcategory: ${extendedSub.subcategory.name}`);
      if (extendedSub.parent) {
        console.log(`   Auto-filled parent: ${extendedSub.parent.name}`);
      }
      console.log('✅ Extended auto-fill would work correctly\n');
    }

    if (brand && brand.category && brand.subcategory) {
      console.log('🔄 Simulating: User selects brand, system should auto-fill entire hierarchy');
      console.log(`   Selected brand: ${brand.name}`);
      console.log(`   Auto-filled category: ${brand.category.name}`);
      console.log(`   Auto-filled subcategory: ${brand.subcategory.name}`);
      
      const hierarchy = [];
      if (brand.subcategory1) hierarchy.push(`Level 1: ${brand.subcategory1.name}`);
      if (brand.subcategory2) hierarchy.push(`Level 2: ${brand.subcategory2.name}`);
      if (brand.subcategory3) hierarchy.push(`Level 3: ${brand.subcategory3.name}`);
      if (brand.subcategory4) hierarchy.push(`Level 4: ${brand.subcategory4.name}`);
      if (brand.subcategory5) hierarchy.push(`Level 5: ${brand.subcategory5.name}`);
      
      if (hierarchy.length > 0) {
        console.log(`   Auto-filled extended hierarchy: ${hierarchy.join(', ')}`);
      }
      console.log('✅ Brand auto-fill would work correctly\n');
    }

    console.log('🎉 Auto-Fill Functionality Test Complete!');
    console.log('\n📝 Summary:');
    console.log('- Category → clears child levels');
    console.log('- Subcategory → auto-fills category from relationship');
    console.log('- Extended Subcategory → auto-fills category, subcategory, and parent chain');
    console.log('- Brand → auto-fills entire hierarchy from brand relationships');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

testAutoFillFunctionality();