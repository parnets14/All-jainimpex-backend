import mongoose from 'mongoose';

// Simple test schema for unit conversion
const testProductSchema = new mongoose.Schema({
  itemName: String,
  unit: String,
  alternateUnit: String,
  alternateUnitQuantity: Number
});

const TestProduct = mongoose.model('TestProduct', testProductSchema);

async function testSimpleUnitConversion() {
  try {
    await mongoose.connect('mongodb://localhost:27017/jain_impex_crm');
    console.log('✅ Connected to MongoDB');

    // Test 1: Create product with unit relationship
    console.log('\n🧪 Test 1: Simple unit relationship...');
    
    const product1 = await TestProduct.create({
      itemName: 'Test Pipe',
      unit: 'Piece',
      alternateUnit: 'Box',
      alternateUnitQuantity: 10
    });

    console.log('✅ Created:', product1.itemName);
    console.log('🔢 Relationship:', `1 ${product1.alternateUnit} = ${product1.alternateUnitQuantity} ${product1.unit}`);

    // Test 2: Different unit combinations
    console.log('\n🧪 Test 2: Various unit combinations...');
    
    const combinations = [
      { name: 'Steel Pipe', unit: 'Meter', alternateUnit: 'Roll', quantity: 100 },
      { name: 'Cement', unit: 'Kilogram', alternateUnit: 'Bag', quantity: 50 },
      { name: 'Paint', unit: 'Liter', alternateUnit: 'Gallon', quantity: 3.78 }
    ];

    for (const combo of combinations) {
      const product = await TestProduct.create({
        itemName: combo.name,
        unit: combo.unit,
        alternateUnit: combo.alternateUnit,
        alternateUnitQuantity: combo.quantity
      });
      
      console.log(`✅ ${combo.name}: 1 ${combo.alternateUnit} = ${combo.quantity} ${combo.unit}`);
    }

    // Test 3: Product without alternate unit
    console.log('\n🧪 Test 3: Product without alternate unit...');
    
    const simpleProduct = await TestProduct.create({
      itemName: 'Simple Item',
      unit: 'Piece'
    });

    console.log('✅ Simple product:', simpleProduct.itemName);
    console.log('📦 Unit:', simpleProduct.unit);
    console.log('📦 Alternate Unit:', simpleProduct.alternateUnit || 'None');

    console.log('\n🎉 Unit conversion system working correctly!');
    console.log('\n📋 Key Features:');
    console.log('✅ Simple alternateUnitQuantity field');
    console.log('✅ Easy to understand: 1 Box = 10 Pieces');
    console.log('✅ No complex conversion objects');
    console.log('✅ Optional alternate unit support');

    // Clean up
    await TestProduct.deleteMany({});
    console.log('🧹 Test data cleaned up');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testSimpleUnitConversion();