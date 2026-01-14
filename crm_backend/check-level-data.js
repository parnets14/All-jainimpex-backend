import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const checkLevelData = async () => {
  try {
    console.log('🔍 Checking Extended Subcategory Level Data\n');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Check each level
    for (let level = 1; level <= 5; level++) {
      console.log(`\n📋 LEVEL ${level} ITEMS:`);
      console.log('='.repeat(80));
      
      const items = await ExtendedSubcategory.find({ level, status: 'active' })
        .populate('subcategory', 'name')
        .populate('parentExtendedSubcategory', 'name level')
        .sort({ name: 1 })
        .limit(10);
      
      console.log(`Total items with level=${level}: ${items.length}`);
      
      items.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.name}`);
        console.log(`   Level: ${item.level}`);
        console.log(`   Subcategory: ${item.subcategory?.name || 'N/A'}`);
        console.log(`   Parent: ${item.parentExtendedSubcategory?.name || 'None (Level 1)'}`);
        console.log(`   Parent Level: ${item.parentExtendedSubcategory?.level || 'N/A'}`);
        
        // Check if name matches level
        const nameHasLevel2 = item.name.toLowerCase().includes('level 2') || item.name.includes('-L2-');
        const nameHasLevel3 = item.name.toLowerCase().includes('level 3') || item.name.includes('-L3-');
        
        if (level === 3 && (nameHasLevel2 || item.name.includes('subcategory level 2'))) {
          console.log(`   ⚠️  WARNING: Name suggests Level 2 but database says Level 3!`);
        }
        if (level === 2 && nameHasLevel3) {
          console.log(`   ⚠️  WARNING: Name suggests Level 3 but database says Level 2!`);
        }
      });
    }

    // Check for mismatches
    console.log('\n\n🔍 CHECKING FOR MISMATCHES:');
    console.log('='.repeat(80));
    
    const allItems = await ExtendedSubcategory.find({ status: 'active' })
      .populate('parentExtendedSubcategory', 'name level');
    
    let mismatches = 0;
    allItems.forEach(item => {
      if (item.parentExtendedSubcategory) {
        const expectedLevel = item.parentExtendedSubcategory.level + 1;
        if (item.level !== expectedLevel) {
          console.log(`\n❌ MISMATCH: ${item.name}`);
          console.log(`   Current Level: ${item.level}`);
          console.log(`   Parent Level: ${item.parentExtendedSubcategory.level}`);
          console.log(`   Expected Level: ${expectedLevel}`);
          mismatches++;
        }
      } else {
        // No parent, should be level 1
        if (item.level !== 1) {
          console.log(`\n❌ MISMATCH: ${item.name}`);
          console.log(`   Current Level: ${item.level}`);
          console.log(`   Parent: None`);
          console.log(`   Expected Level: 1`);
          mismatches++;
        }
      }
    });
    
    if (mismatches === 0) {
      console.log('\n✅ No mismatches found! All levels are correct.');
    } else {
      console.log(`\n⚠️  Found ${mismatches} mismatches!`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

checkLevelData();
