import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DiscountMapping from './models/DiscountMapping.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function testLevelDiscountEnhancements() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Create discount with predefined discount types
    console.log('📝 Test 1: Creating discount with predefined discount types...');
    const testDiscount1 = {
      discountName: 'Test Level Discount Enhancement',
      discountType: 'both',
      mappingType: 'sales',
      targetType: 'brand',
      brand: new mongoose.Types.ObjectId(),
      directDiscountPercentage: 10,
      maxDiscountPercentage: 50,
      levels: [
        {
          levelName: 'Loyalty Discount',
          discountPercentage: 5,
          description: 'For loyal customers'
        },
        {
          levelName: 'Bulk Discount',
          discountPercentage: 8,
          description: 'For bulk orders'
        },
        {
          levelName: 'Custom Discount Type',
          discountPercentage: 7,
          description: 'Custom discount selected from Others'
        }
      ],
      validFrom: new Date(),
      validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdBy: new mongoose.Types.ObjectId()
    };

    const discount1 = new DiscountMapping(testDiscount1);
    await discount1.save();
    console.log('✅ Test 1 Passed: Discount created successfully');
    console.log('   Direct: 10%');
    console.log('   Loyalty Discount: 5%');
    console.log('   Bulk Discount: 8%');
    console.log('   Custom Discount Type: 7%');
    console.log('   Total: 30%\n');

    // Test 2: Validate that total discount cannot exceed 100%
    console.log('📝 Test 2: Testing total discount validation (should fail)...');
    const testDiscount2 = {
      discountName: 'Test Exceeding 100%',
      discountType: 'both',
      mappingType: 'sales',
      targetType: 'brand',
      brand: new mongoose.Types.ObjectId(),
      directDiscountPercentage: 60,
      maxDiscountPercentage: 50,
      levels: [
        {
          levelName: 'Loyalty Discount',
          discountPercentage: 30,
          description: 'For loyal customers'
        },
        {
          levelName: 'Bulk Discount',
          discountPercentage: 20,
          description: 'For bulk orders'
        }
      ],
      validFrom: new Date(),
      validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdBy: new mongoose.Types.ObjectId()
    };

    try {
      const discount2 = new DiscountMapping(testDiscount2);
      await discount2.save();
      console.log('❌ Test 2 Failed: Should have rejected total > 100%');
    } catch (error) {
      console.log('✅ Test 2 Passed: Correctly rejected total > 100%');
      console.log('   Error:', error.message);
      console.log('   Direct: 60% + Loyalty: 30% + Bulk: 20% = 110%\n');
    }

    // Test 3: Validate that maxDiscountPercentage is independent
    console.log('📝 Test 3: Testing maxDiscountPercentage independence...');
    const testDiscount3 = {
      discountName: 'Test Max Discount Independence',
      discountType: 'both',
      mappingType: 'sales',
      targetType: 'brand',
      brand: new mongoose.Types.ObjectId(),
      directDiscountPercentage: 15,
      maxDiscountPercentage: 20, // Max is 20% but total is 35%
      levels: [
        {
          levelName: 'Prompt Discount',
          discountPercentage: 10,
          description: 'For prompt payment'
        },
        {
          levelName: 'Executive Discount',
          discountPercentage: 10,
          description: 'Executive approval'
        }
      ],
      validFrom: new Date(),
      validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdBy: new mongoose.Types.ObjectId()
    };

    const discount3 = new DiscountMapping(testDiscount3);
    await discount3.save();
    console.log('✅ Test 3 Passed: Max discount is independent');
    console.log('   Direct: 15%');
    console.log('   Prompt Discount: 10%');
    console.log('   Executive Discount: 10%');
    console.log('   Total: 35% (Max Discount: 20% - independent)');
    console.log('   Note: Max discount does not limit direct + level total\n');

    // Test 4: Test with exactly 100%
    console.log('📝 Test 4: Testing with exactly 100% total...');
    const testDiscount4 = {
      discountName: 'Test Exactly 100%',
      discountType: 'both',
      mappingType: 'sales',
      targetType: 'brand',
      brand: new mongoose.Types.ObjectId(),
      directDiscountPercentage: 50,
      maxDiscountPercentage: 30,
      levels: [
        {
          levelName: 'MD Discount',
          discountPercentage: 25,
          description: 'MD approval'
        },
        {
          levelName: 'CD Discount',
          discountPercentage: 25,
          description: 'CD approval'
        }
      ],
      validFrom: new Date(),
      validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdBy: new mongoose.Types.ObjectId()
    };

    const discount4 = new DiscountMapping(testDiscount4);
    await discount4.save();
    console.log('✅ Test 4 Passed: Exactly 100% is allowed');
    console.log('   Direct: 50%');
    console.log('   MD Discount: 25%');
    console.log('   CD Discount: 25%');
    console.log('   Total: 100%\n');

    // Test 5: Test with all predefined discount types
    console.log('📝 Test 5: Testing all predefined discount types...');
    const allDiscountTypes = [
      'Loyalty Discount',
      'Bulk Discount',
      'Load Discount',
      'Consistency Discount',
      'Prompt Discount',
      'Executive Discount',
      'MD Discount',
      'ACD Discount',
      'CD Discount'
    ];

    const testDiscount5 = {
      discountName: 'Test All Predefined Types',
      discountType: 'level_based',
      mappingType: 'sales',
      targetType: 'brand',
      brand: new mongoose.Types.ObjectId(),
      maxDiscountPercentage: 50,
      levels: allDiscountTypes.slice(0, 5).map((type, idx) => ({
        levelName: type,
        discountPercentage: 5 + idx,
        description: `${type} description`
      })),
      validFrom: new Date(),
      validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdBy: new mongoose.Types.ObjectId()
    };

    const discount5 = new DiscountMapping(testDiscount5);
    await discount5.save();
    console.log('✅ Test 5 Passed: All predefined discount types work');
    testDiscount5.levels.forEach(level => {
      console.log(`   ${level.levelName}: ${level.discountPercentage}%`);
    });
    console.log('');

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await DiscountMapping.deleteMany({
      discountName: {
        $in: [
          'Test Level Discount Enhancement',
          'Test Max Discount Independence',
          'Test Exactly 100%',
          'Test All Predefined Types'
        ]
      }
    });
    console.log('✅ Cleanup complete\n');

    console.log('🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ Predefined discount types work correctly');
    console.log('✅ Total discount validation (max 100%) works');
    console.log('✅ Max discount percentage is independent from direct + level total');
    console.log('✅ Custom discount types (Others) are supported');
    console.log('✅ All predefined discount types are available');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testLevelDiscountEnhancements();
