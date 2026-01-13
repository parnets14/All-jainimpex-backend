import mongoose from 'mongoose';

// Simple schema for debugging
const extendedSubcategorySchema = new mongoose.Schema({
  name: String,
  level: Number,
  parentExtendedSubcategory: mongoose.Schema.Types.ObjectId,
  category: mongoose.Schema.Types.ObjectId,
  subcategory: mongoose.Schema.Types.ObjectId
});

const ExtendedSubcategory = mongoose.model('ExtendedSubcategory', extendedSubcategorySchema);

async function debugLevel2Simple() {
  try {
    await mongoose.connect('mongodb://localhost:27017/jain_impex_crm');
    console.log('✅ Connected to MongoDB');

    // Check all extended subcategories by level
    console.log('\n🔍 Checking extended subcategories by level...');
    
    for (let level = 1; level <= 5; level++) {
      const items = await ExtendedSubcategory.find({ level }).select('name level parentExtendedSubcategory');
      console.log(`📋 Level ${level}: ${items.length} items`);
      
      if (items.length > 0 && level <= 2) {
        items.forEach(item => {
          console.log(`  - ${item.name} (Parent: ${item.parentExtendedSubcategory || 'None'})`);
        });
      }
    }

    // Specific check for level 2 parent relationships
    console.log('\n🔍 Level 2 parent relationships...');
    const level1Items = await ExtendedSubcategory.find({ level: 1 }).select('_id name');
    const level2Items = await ExtendedSubcategory.find({ level: 2 }).select('name parentExtendedSubcategory');
    
    console.log(`📊 Level 1 items: ${level1Items.length}`);
    console.log(`📊 Level 2 items: ${level2Items.length}`);
    
    if (level1Items.length > 0 && level2Items.length > 0) {
      console.log('\n🔗 Checking parent-child relationships...');
      
      level1Items.forEach(level1Item => {
        const children = level2Items.filter(level2Item => 
          level2Item.parentExtendedSubcategory?.toString() === level1Item._id.toString()
        );
        console.log(`📋 ${level1Item.name} has ${children.length} children`);
        children.forEach(child => {
          console.log(`  - ${child.name}`);
        });
      });
    }

    // Test the exact filtering logic from frontend
    console.log('\n🧪 Testing frontend filtering logic...');
    
    if (level1Items.length > 0) {
      const testLevel1Id = level1Items[0]._id.toString();
      console.log(`🔍 Testing with Level 1 ID: ${testLevel1Id} (${level1Items[0].name})`);
      
      // This is the exact logic from filteredExtendedSubcategories2
      const filtered = level2Items.filter(item => {
        return item.parentExtendedSubcategory?._id?.toString() === testLevel1Id || 
               item.parentExtendedSubcategory?.toString() === testLevel1Id;
      });
      
      console.log(`📊 Filtered results: ${filtered.length} items`);
      filtered.forEach(item => {
        console.log(`  - ${item.name}`);
      });
      
      if (filtered.length === 0) {
        console.log('❌ No Level 2 items found for this Level 1 parent');
        console.log('💡 This explains why the dropdown is empty');
      }
    }

    // Check if there are any level 2 items at all
    const totalLevel2 = await ExtendedSubcategory.countDocuments({ level: 2 });
    console.log(`\n📊 Total Level 2 items in database: ${totalLevel2}`);
    
    if (totalLevel2 === 0) {
      console.log('❌ No Level 2 extended subcategories exist in the database!');
      console.log('💡 This is why the Level 2 dropdown is empty');
      console.log('🔧 Solution: Create Level 2 extended subcategories with proper parent relationships');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

debugLevel2Simple();