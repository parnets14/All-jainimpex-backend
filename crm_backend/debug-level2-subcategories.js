import mongoose from 'mongoose';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

async function debugLevel2Subcategories() {
  try {
    await mongoose.connect('mongodb://localhost:27017/jain_impex_crm');
    console.log('✅ Connected to MongoDB');

    // Check all extended subcategories
    console.log('\n🔍 Checking all extended subcategories...');
    
    const allExtended = await ExtendedSubcategory.find({})
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name')
      .sort({ level: 1, name: 1 });

    console.log(`📊 Total extended subcategories: ${allExtended.length}`);

    // Group by level
    const byLevel = {};
    allExtended.forEach(item => {
      if (!byLevel[item.level]) byLevel[item.level] = [];
      byLevel[item.level].push(item);
    });

    Object.keys(byLevel).forEach(level => {
      console.log(`\n📋 Level ${level}: ${byLevel[level].length} items`);
      byLevel[level].forEach(item => {
        console.log(`  - ${item.name} (Category: ${item.category?.name}, Subcategory: ${item.subcategory?.name}, Parent: ${item.parentExtendedSubcategory?.name || 'None'})`);
      });
    });

    // Check specific level 2 items and their parents
    console.log('\n🔍 Detailed Level 2 Analysis...');
    const level2Items = byLevel[2] || [];
    
    if (level2Items.length === 0) {
      console.log('❌ No Level 2 extended subcategories found!');
      
      // Check if we have level 1 items
      const level1Items = byLevel[1] || [];
      console.log(`📋 Level 1 items available: ${level1Items.length}`);
      
      if (level1Items.length > 0) {
        console.log('✅ Level 1 items exist, but no Level 2 children found');
        console.log('💡 This might be why Level 2 dropdown is empty');
      }
    } else {
      console.log(`✅ Found ${level2Items.length} Level 2 items`);
      
      // Check parent relationships
      level2Items.forEach(item => {
        console.log(`\n📋 Level 2 Item: ${item.name}`);
        console.log(`   Parent ID: ${item.parentExtendedSubcategory?._id || 'None'}`);
        console.log(`   Parent Name: ${item.parentExtendedSubcategory?.name || 'None'}`);
        console.log(`   Category: ${item.category?.name}`);
        console.log(`   Subcategory: ${item.subcategory?.name}`);
      });
    }

    // Test the API filtering logic
    console.log('\n🧪 Testing API filtering logic...');
    
    if (byLevel[1] && byLevel[1].length > 0) {
      const testLevel1Id = byLevel[1][0]._id;
      console.log(`🔍 Testing with Level 1 ID: ${testLevel1Id} (${byLevel[1][0].name})`);
      
      // Simulate the filtering logic from frontend
      const filteredLevel2 = allExtended.filter(item => {
        return item.level === 2 && (
          item.parentExtendedSubcategory?._id?.toString() === testLevel1Id.toString() ||
          item.parentExtendedSubcategory?.toString() === testLevel1Id.toString()
        );
      });
      
      console.log(`📊 Filtered Level 2 items for ${byLevel[1][0].name}: ${filteredLevel2.length}`);
      filteredLevel2.forEach(item => {
        console.log(`  - ${item.name}`);
      });
    }

    // Check API endpoint response format
    console.log('\n🔍 Checking API response format...');
    
    const level2Response = await ExtendedSubcategory.find({ level: 2 })
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name')
      .limit(1000);
    
    console.log(`📊 API Level 2 response: ${level2Response.length} items`);
    console.log('📋 Sample Level 2 item structure:');
    if (level2Response.length > 0) {
      const sample = level2Response[0];
      console.log({
        _id: sample._id,
        name: sample.name,
        level: sample.level,
        parentExtendedSubcategory: sample.parentExtendedSubcategory,
        category: sample.category,
        subcategory: sample.subcategory
      });
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

debugLevel2Subcategories();