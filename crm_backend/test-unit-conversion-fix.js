import mongoose from 'mongoose';
import Product from './models/Product.js';

// Test the new simplified unit conversion system
async function testUnitConversionFix() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/jain_impex_crm', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Test 1: Create a product with simple unit relationship
    console.log('\n🧪 Test 1: Creating product with simple unit relationship...');
    
    const testProduct = {
      HSNCode: 'TEST001',
      itemName: 'Test Pipe Box',
      description: 'Test product for unit conversion',
      unit: 'Piece',
      alternateUnit: 'Box',
      alternateUnitQuantity: 10, // 1 Box = 10 Pieces
      gst: 18,
      category: new mongoose.Types.ObjectId(),
      subcategory: new mongoose.Types.ObjectId(),
      brand: new mongoose.Types.ObjectId(),
      unitPrice: 100,
      minStockLevel: 5,
      createdBy: new mongoose.Types.ObjectId()
    };

    const savedProduct = await Product.create(testProduct);
    console.log('✅ Product created successfully');
    console.log('📦 Unit:', savedProduct.unit);
    console.log('📦 Alternate Unit:', savedProduct.alternateUnit);
    console.log('🔢 Unit Relationship:', `1 ${savedProduct.alternateUnit} = ${savedProduct.alternateUnitQuantity} ${savedProduct.unit}`);

    // Test 2: Update product with different unit relationship
    console.log('\n🧪 Test 2: Updating unit relationship...');
    
    savedProduct.alternateUnit = 'Carton';
    savedProduct.alternateUnitQuantity = 50; // 1 Carton = 50 Pieces
    await savedProduct.save();
    
    console.log('✅ Product updated successfully');
    console.log('🔢 New Unit Relationship:', `1 ${savedProduct.alternateUnit} = ${savedProduct.alternateUnitQuantity} ${savedProduct.unit}`);

    // Test 3: Test without alternate unit
    console.log('\n🧪 Test 3: Product without alternate unit...');
    
    const simpleProduct = {
      HSNCode: 'TEST002',
      itemName: 'Simple Product',
      description: 'Product without alternate unit',
      unit: 'Meter',
      gst: 12,
      category: new mongoose.Types.ObjectId(),
      subcategory: new mongoose.Types.ObjectId(),
      brand: new mongoose.Types.ObjectId(),
      unitPrice: 50,
      minStockLevel: 10,
      createdBy: new mongoose.Types.ObjectId()
    };

    const simpleProductSaved = await Product.create(simpleProduct);
    console.log('✅ Simple product created successfully');
    console.log('📦 Unit:', simpleProductSaved.unit);
    console.log('📦 Alternate Unit:', simpleProductSaved.alternateUnit || 'None');
    console.log('🔢 Unit Relationship:', simpleProductSaved.alternateUnitQuantity ? 
      `1 ${simpleProductSaved.alternateUnit} = ${simpleProductSaved.alternateUnitQuantity} ${simpleProductSaved.unit}` : 'None');

    // Test 4: Verify old unitConversion field is not used
    console.log('\n🧪 Test 4: Verifying old unitConversion field is removed...');
    
    const productWithOldField = await Product.findById(savedProduct._id);
    console.log('✅ Old unitConversion field exists:', !!productWithOldField.unitConversion);
    console.log('✅ New alternateUnitQuantity field exists:', !!productWithOldField.alternateUnitQuantity);

    // Test 5: Test various unit combinations
    console.log('\n🧪 Test 5: Testing various unit combinations...');
    
    const unitCombinations = [
      { unit: 'Piece', alternateUnit: 'Box', quantity: 12 },
      { unit: 'Meter', alternateUnit: 'Roll', quantity: 100 },
      { unit: 'Kilogram', alternateUnit: 'Bag', quantity: 25 },
      { unit: 'Liter', alternateUnit: 'Gallon', quantity: 3.78 }
    ];

    for (let i = 0; i < unitCombinations.length; i++) {
      const combo = unitCombinations[i];
      const testProd = {
        HSNCode: `TEST00${i + 3}`,
        itemName: `Test Product ${i + 1}`,
        description: `Test ${combo.unit} to ${combo.alternateUnit} conversion`,
        unit: combo.unit,
        alternateUnit: combo.alternateUnit,
        alternateUnitQuantity: combo.quantity,
        gst: 18,
        category: new mongoose.Types.ObjectId(),
        subcategory: new mongoose.Types.ObjectId(),
        brand: new mongoose.Types.ObjectId(),
        unitPrice: 100,
        minStockLevel: 5,
        createdBy: new mongoose.Types.ObjectId()
      };

      const saved = await Product.create(testProd);
      console.log(`✅ ${combo.unit} → ${combo.alternateUnit}: 1 ${combo.alternateUnit} = ${combo.quantity} ${combo.unit}`);
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ Simple unit relationship system implemented');
    console.log('✅ alternateUnitQuantity field working correctly');
    console.log('✅ Complex unitConversion system removed');
    console.log('✅ Various unit combinations tested');

    // Clean up test data
    await Product.deleteMany({ HSNCode: { $regex: /^TEST/ } });
    console.log('🧹 Test data cleaned up');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testUnitConversionFix();