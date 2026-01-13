import mongoose from 'mongoose';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jain_impex_crm');

async function createExtendedSubcategoryTestData() {
  try {
    console.log('🏗️ Creating Extended Subcategory Test Data...\n');

    // Use a dummy ObjectId for createdBy field
    const dummyUserId = new mongoose.Types.ObjectId();
    console.log(`✅ Using dummy user ID: ${dummyUserId} for createdBy field`);

    // Step 1: Find or create a category
    let category = await Category.findOne({ name: 'Pipes' });
    if (!category) {
      category = await Category.create({
        name: 'Pipes',
        description: 'All types of pipes',
        status: 'active',
        createdBy: dummyUserId
      });
      console.log('✅ Created category: Pipes');
    } else {
      console.log('✅ Found existing category: Pipes');
    }

    // Step 2: Find or create a subcategory
    let subcategory = await Subcategory.findOne({ name: 'PVC Pipes', category: category._id });
    if (!subcategory) {
      subcategory = await Subcategory.create({
        name: 'PVC Pipes',
        description: 'PVC pipes for plumbing',
        category: category._id,
        status: 'active',
        createdBy: dummyUserId
      });
      console.log('✅ Created subcategory: PVC Pipes');
    } else {
      console.log('✅ Found existing subcategory: PVC Pipes');
    }

    // Step 3: Create Extended Subcategory Level 1
    const level1Items = [
      { name: 'Standard Grade', description: 'Standard quality PVC pipes' },
      { name: 'Premium Grade', description: 'Premium quality PVC pipes' },
      { name: 'Heavy Duty', description: 'Heavy duty PVC pipes' }
    ];

    const createdLevel1 = [];
    for (const item of level1Items) {
      let existing = await ExtendedSubcategory.findOne({ 
        name: item.name, 
        level: 1, 
        category: category._id,
        subcategory: subcategory._id 
      });
      
      if (!existing) {
        const created = await ExtendedSubcategory.create({
          name: item.name,
          description: item.description,
          level: 1,
          category: category._id,
          subcategory: subcategory._id,
          status: 'active',
          createdBy: dummyUserId
        });
        createdLevel1.push(created);
        console.log(`✅ Created Level 1: ${item.name}`);
      } else {
        createdLevel1.push(existing);
        console.log(`✅ Found existing Level 1: ${item.name}`);
      }
    }

    // Step 4: Create Extended Subcategory Level 2
    const level2Items = [
      { name: '1/2 Inch', description: '1/2 inch diameter', parentExtendedSubcategory: createdLevel1[0]._id },
      { name: '3/4 Inch', description: '3/4 inch diameter', parentExtendedSubcategory: createdLevel1[0]._id },
      { name: '1 Inch', description: '1 inch diameter', parentExtendedSubcategory: createdLevel1[1]._id },
      { name: '1.5 Inch', description: '1.5 inch diameter', parentExtendedSubcategory: createdLevel1[1]._id },
      { name: '2 Inch', description: '2 inch diameter', parentExtendedSubcategory: createdLevel1[2]._id }
    ];

    const createdLevel2 = [];
    for (const item of level2Items) {
      let existing = await ExtendedSubcategory.findOne({ 
        name: item.name, 
        level: 2, 
        category: category._id,
        subcategory: subcategory._id,
        parentExtendedSubcategory: item.parentExtendedSubcategory
      });
      
      if (!existing) {
        const created = await ExtendedSubcategory.create({
          name: item.name,
          description: item.description,
          level: 2,
          category: category._id,
          subcategory: subcategory._id,
          parentExtendedSubcategory: item.parentExtendedSubcategory,
          status: 'active',
          createdBy: dummyUserId
        });
        createdLevel2.push(created);
        console.log(`✅ Created Level 2: ${item.name}`);
      } else {
        createdLevel2.push(existing);
        console.log(`✅ Found existing Level 2: ${item.name}`);
      }
    }

    // Step 5: Create Extended Subcategory Level 3
    const level3Items = [
      { name: '10 Feet', description: '10 feet length', parentExtendedSubcategory: createdLevel2[0]._id },
      { name: '20 Feet', description: '20 feet length', parentExtendedSubcategory: createdLevel2[0]._id },
      { name: '15 Feet', description: '15 feet length', parentExtendedSubcategory: createdLevel2[1]._id },
      { name: '25 Feet', description: '25 feet length', parentExtendedSubcategory: createdLevel2[2]._id }
    ];

    for (const item of level3Items) {
      let existing = await ExtendedSubcategory.findOne({ 
        name: item.name, 
        level: 3, 
        category: category._id,
        subcategory: subcategory._id,
        parentExtendedSubcategory: item.parentExtendedSubcategory
      });
      
      if (!existing) {
        await ExtendedSubcategory.create({
          name: item.name,
          description: item.description,
          level: 3,
          category: category._id,
          subcategory: subcategory._id,
          parentExtendedSubcategory: item.parentExtendedSubcategory,
          status: 'active',
          createdBy: dummyUserId
        });
        console.log(`✅ Created Level 3: ${item.name}`);
      } else {
        console.log(`✅ Found existing Level 3: ${item.name}`);
      }
    }

    // Step 6: Create some brands
    const brands = [
      { name: 'Supreme', description: 'Supreme brand PVC pipes' },
      { name: 'Astral', description: 'Astral brand PVC pipes' },
      { name: 'Finolex', description: 'Finolex brand PVC pipes' }
    ];

    for (const brandData of brands) {
      let existing = await Brand.findOne({ 
        name: brandData.name,
        category: category._id,
        subcategory: subcategory._id
      });
      
      if (!existing) {
        await Brand.create({
          name: brandData.name,
          description: brandData.description,
          category: category._id,
          subcategory: subcategory._id,
          subcategory1: createdLevel1[0]._id, // Standard Grade
          subcategory2: createdLevel2[0]._id, // 1/2 Inch
          status: 'active',
          createdBy: dummyUserId
        });
        console.log(`✅ Created Brand: ${brandData.name}`);
      } else {
        console.log(`✅ Found existing Brand: ${brandData.name}`);
      }
    }

    console.log('\n🎉 Extended Subcategory Test Data Creation Complete!');
    console.log('\n📊 Summary:');
    console.log('- Category: Pipes');
    console.log('- Subcategory: PVC Pipes');
    console.log('- Level 1: Standard Grade, Premium Grade, Heavy Duty');
    console.log('- Level 2: Various inch sizes (1/2", 3/4", 1", 1.5", 2")');
    console.log('- Level 3: Various lengths (10ft, 15ft, 20ft, 25ft)');
    console.log('- Brands: Supreme, Astral, Finolex');

  } catch (error) {
    console.error('❌ Error creating test data:', error);
  } finally {
    mongoose.connection.close();
  }
}

createExtendedSubcategoryTestData();