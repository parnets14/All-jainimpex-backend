import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Subcategory from './models/Subcategory.js';
import Category from './models/Category.js';

dotenv.config();

const testLevel2DropdownIssue = async () => {
  try {
    console.log('🧪 Testing Level 2 Dropdown Issue\n');
    
    const mongoUri = process.env.MONGO_URL;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find Test Subcategory 1
    const testSubcategory = await Subcategory.findOne({ name: 'Test Subcategory 1' });
    console.log(`📁 Test Subcategory 1 ID: ${testSubcategory._id}\n`);

    // Step 1: Get Level 1 items (what user sees first)
    console.log('📋 STEP 1: User selects subcategory, sees Level 1 items');
    const level1Items = await ExtendedSubcategory.find({
      subcategory: testSubcategory._id,
      parentExtendedSubcategory: null,
      status: 'active'
    }).sort({ name: 1 });
    
    console.log(`Found ${level1Items.length} Level 1 items:`);
    level1Items.forEach(item => {
      console.log(`  - ${item.name} (ID: ${item._id})`);
    });
    console.log('');

    // Step 2: User selects first Level 1 item
    const selectedLevel1 = level1Items[0];
    console.log(`📋 STEP 2: User selects "${selectedLevel1.name}"`);
    console.log(`Selected Level 1 ID: ${selectedLevel1._id}\n`);

    // Step 3: Frontend calls getExtendedSubcategoriesByParent
    console.log('📋 STEP 3: Frontend calls API to get Level 2 items');
    console.log(`API Call: GET /api/extended-subcategories/by-parent/${selectedLevel1._id}\n`);

    const level2Items = await ExtendedSubcategory.find({
      parentExtendedSubcategory: selectedLevel1._id,
      status: 'active'
    })
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .populate('parentExtendedSubcategory', 'name level')
    .sort({ name: 1 });

    console.log(`✅ API Returns ${level2Items.length} Level 2 items:`);
    level2Items.forEach(item => {
      console.log(`  - ${item.name} (ID: ${item._id})`);
      console.log(`    Parent: ${item.parentExtendedSubcategory?.name} (${item.parentExtendedSubcategory?._id})`);
      console.log(`    Level: ${item.level}`);
    });
    console.log('');

    // Step 4: Check if filtering would work
    console.log('📋 STEP 4: Frontend filters items');
    console.log(`selectedSubcategory1Id: ${selectedLevel1._id}`);
    console.log(`extendedSubcategories2.length: ${level2Items.length}`);
    
    const filtered = level2Items.filter(item => {
      const parentId = item.parentExtendedSubcategory?._id || item.parentExtendedSubcategory;
      const matches = parentId.toString() === selectedLevel1._id.toString();
      console.log(`  - ${item.name}: parentId=${parentId}, matches=${matches}`);
      return matches;
    });
    
    console.log(`\n✅ Filtered result: ${filtered.length} items`);
    console.log('');

    // Step 5: Check what happens if we fetch ALL Level 2 items first
    console.log('📋 STEP 5: Check if fetchAllExtendedSubcategories would have these items');
    const allLevel2Items = await ExtendedSubcategory.find({
      level: 2,
      status: 'active'
    }).sort({ name: 1 });
    
    console.log(`Total Level 2 items in database: ${allLevel2Items.length}`);
    console.log('Items for Test Subcategory 1:');
    const testSub1Level2 = allLevel2Items.filter(item => 
      item.subcategory.toString() === testSubcategory._id.toString()
    );
    console.log(`  ${testSub1Level2.length} items belong to Test Subcategory 1`);
    
    // Check if our specific items are in the all items list
    const ourItemIds = level2Items.map(item => item._id.toString());
    const foundInAll = testSub1Level2.filter(item => 
      ourItemIds.includes(item._id.toString())
    );
    console.log(`  ${foundInAll.length} of our items are in the "all items" list`);
    console.log('');

    // Summary
    console.log('🎯 DIAGNOSIS:');
    if (level2Items.length > 0 && filtered.length > 0) {
      console.log('✅ API is returning correct data');
      console.log('✅ Filtering logic would work');
      console.log('');
      console.log('💡 LIKELY ISSUE:');
      console.log('   The frontend might not be waiting for the API response');
      console.log('   or the state update is not triggering a re-render');
      console.log('');
      console.log('🔧 SOLUTION:');
      console.log('   1. Check if setExtendedSubcategories2() is being called');
      console.log('   2. Check if the useMemo is re-running after state update');
      console.log('   3. Add console.logs to track state changes');
    } else {
      console.log('❌ No Level 2 items found - data issue');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testLevel2DropdownIssue();
