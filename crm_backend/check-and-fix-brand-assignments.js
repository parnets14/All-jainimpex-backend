import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';

dotenv.config();

const checkAndFixBrandAssignments = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Checking All Brand Assignments...\n');

    // Get all brands
    const allBrands = await Brand.find({})
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subcategory1', 'name level')
      .populate('subcategory2', 'name level')
      .populate('subcategory3', 'name level')
      .populate('subcategory4', 'name level')
      .populate('subcategory5', 'name level');

    console.log(`📊 Total brands found: ${allBrands.length}\n`);

    // Group brands by category and subcategory
    const brandsBySubcategory = {};

    allBrands.forEach(brand => {
      const key = `${brand.category?.name || 'Unknown'} → ${brand.subcategory?.name || 'Unknown'}`;
      if (!brandsBySubcategory[key]) {
        brandsBySubcategory[key] = [];
      }
      brandsBySubcategory[key].push(brand);
    });

    // Display brands grouped by subcategory
    Object.keys(brandsBySubcategory).forEach(subcategoryPath => {
      console.log(`📁 ${subcategoryPath}:`);
      
      const brands = brandsBySubcategory[subcategoryPath];
      
      // Separate direct brands from extended brands
      const directBrands = brands.filter(b => 
        !b.subcategory1 && !b.subcategory2 && !b.subcategory3 && !b.subcategory4 && !b.subcategory5
      );
      
      const extendedBrands = brands.filter(b => 
        b.subcategory1 || b.subcategory2 || b.subcategory3 || b.subcategory4 || b.subcategory5
      );

      if (directBrands.length > 0) {
        console.log('   📦 Direct brands (no extended levels):');
        directBrands.forEach(b => {
          console.log(`      - ${b.name}`);
        });
      }

      if (extendedBrands.length > 0) {
        console.log('   🏗️  Extended brands:');
        extendedBrands.forEach(b => {
          const levels = [];
          if (b.subcategory1) levels.push(`L1: ${b.subcategory1.name}`);
          if (b.subcategory2) levels.push(`L2: ${b.subcategory2.name}`);
          if (b.subcategory3) levels.push(`L3: ${b.subcategory3.name}`);
          if (b.subcategory4) levels.push(`L4: ${b.subcategory4.name}`);
          if (b.subcategory5) levels.push(`L5: ${b.subcategory5.name}`);
          console.log(`      - ${b.name} (${levels.join(', ')})`);
        });
      }
      
      console.log('');
    });

    // Check for specific brands mentioned in the issue
    console.log('🔍 Checking for specific brands mentioned in the issue...\n');
    
    const problematicBrands = await Brand.find({
      name: { $in: ['good brand', 'creata'] }
    }).populate('category subcategory subcategory1 subcategory2 subcategory3 subcategory4 subcategory5', 'name');

    if (problematicBrands.length > 0) {
      console.log('🚨 Found problematic brands:');
      problematicBrands.forEach(brand => {
        console.log(`\n🏷️  Brand: ${brand.name}`);
        console.log(`   Category: ${brand.category?.name || 'None'}`);
        console.log(`   Subcategory: ${brand.subcategory?.name || 'None'}`);
        if (brand.subcategory1) console.log(`   Level 1: ${brand.subcategory1.name}`);
        if (brand.subcategory2) console.log(`   Level 2: ${brand.subcategory2.name}`);
        if (brand.subcategory3) console.log(`   Level 3: ${brand.subcategory3.name}`);
        if (brand.subcategory4) console.log(`   Level 4: ${brand.subcategory4.name}`);
        if (brand.subcategory5) console.log(`   Level 5: ${brand.subcategory5.name}`);
        
        const hasExtended = brand.subcategory1 || brand.subcategory2 || brand.subcategory3 || brand.subcategory4 || brand.subcategory5;
        console.log(`   Type: ${hasExtended ? 'Extended Brand' : 'Direct Brand'}`);
      });

      // Ask if user wants to fix these brands
      console.log('\n💡 These brands might be causing the issue in ProductMaster.');
      console.log('   If they have extended levels but should be direct brands, they need to be fixed.');
      console.log('   If they should have extended levels, make sure the ProductMaster is sending the correct parameters.');
      
    } else {
      console.log('✅ No problematic brands found with names "good brand" or "creata"');
    }

    // Test the current API behavior
    console.log('\n🧪 Testing Current API Behavior...\n');

    // Find a real subcategory to test with
    const realSubcategory = await Subcategory.findOne().populate('category');
    if (realSubcategory) {
      console.log(`📋 Testing with: ${realSubcategory.category.name} → ${realSubcategory.name}`);
      
      const { getBrands } = await import('./controllers/brandController.js');
      
      const mockReq = {
        query: {
          category: realSubcategory.category._id.toString(),
          subcategory: realSubcategory._id.toString()
        },
        user: { _id: 'test' }
      };

      const mockRes = {
        json: (data) => {
          console.log('📊 API Response:', {
            success: data.success,
            brandCount: data.brands?.length || 0,
            brands: data.brands?.map(b => ({
              name: b.name,
              hasExtended: !!(b.subcategory1 || b.subcategory2 || b.subcategory3 || b.subcategory4 || b.subcategory5)
            })) || []
          });
          return data;
        },
        status: (code) => ({
          json: (data) => {
            console.log(`❌ API Error ${code}:`, data);
            return data;
          }
        })
      };

      await getBrands(mockReq, mockRes);
    }

    console.log('\n✅ Brand Assignment Check Complete!');

  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the check
checkAndFixBrandAssignments();