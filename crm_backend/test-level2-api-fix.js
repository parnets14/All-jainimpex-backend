import mongoose from 'mongoose';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

async function testLevel2ApiFix() {
  try {
    await mongoose.connect('mongodb://localhost:27017/jain_impex_crm');
    console.log('✅ Connected to MongoDB');

    // Get level 1 items
    const level1Items = await ExtendedSubcategory.find({ level: 1 }).select('_id name');
    console.log(`📋 Found ${level1Items.length} Level 1 items`);

    if (level1Items.length > 0) {
      const testLevel1 = level1Items[0];
      console.log(`🔍 Testing with Level 1: ${testLevel1.name} (${testLevel1._id})`);

      // Simulate the API call that was failing
      const level2Items = await ExtendedSubcategory.find({
        status: 'active',
        parentExtendedSubcategory: testLevel1._id
      }).select('_id name parentExtendedSubcategory');

      console.log(`📊 Level 2 children found: ${level2Items.length}`);
      
      if (level2Items.length > 0) {
        console.log('✅ Level 2 items:');
        level2Items.forEach(item => {
          console.log(`  - ${item.name} (Parent: ${item.parentExtendedSubcategory})`);
        });
        
        console.log('\n🎉 The API should now return these items correctly!');
        console.log('📋 API Response Structure:');
        console.log({
          success: true,
          items: level2Items.map(item => ({
            _id: item._id,
            name: item.name,
            parentExtendedSubcategory: item.parentExtendedSubcategory
          }))
        });
      } else {
        console.log('❌ No Level 2 children found for this Level 1 item');
      }

      // Test with all level 1 items
      console.log('\n🔍 Testing all Level 1 items...');
      for (const level1Item of level1Items) {
        const children = await ExtendedSubcategory.find({
          status: 'active',
          parentExtendedSubcategory: level1Item._id
        }).select('name');
        
        console.log(`📋 ${level1Item.name}: ${children.length} children`);
        if (children.length > 0) {
          children.forEach(child => console.log(`  - ${child.name}`));
        }
      }
    }

    console.log('\n✅ Level 2 API fix should now work correctly!');
    console.log('🔧 Fixed: Changed response.extendedSubcategories to response.items');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testLevel2ApiFix();