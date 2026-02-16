import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import StockMovement from './models/Stock.js';
import GRN from './models/GRN.js';

dotenv.config();

const verifyBackendCodeVersion = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    const productCode = '15454636';
    
    console.log(`\n🔍 Verifying stock calculation for product: ${productCode}`);
    console.log('='.repeat(70));

    // Find the product
    const product = await Product.findOne({ productCode });
    if (!product) {
      console.log(`❌ Product ${productCode} not found`);
      process.exit(1);
    }

    console.log(`\n✅ Product: ${product.itemName} (${product.productCode})`);

    // Get GRN damaged quantity
    const grns = await GRN.find({ 'items.productId': product._id }).lean();
    let grnDamagedTotal = 0;
    grns.forEach(grn => {
      grn.items.forEach(item => {
        if (item.productId.toString() === product._id.toString()) {
          grnDamagedTotal += item.damageQuantity || 0;
        }
      });
    });

    console.log(`\n📦 GRN Data:`);
    console.log(`   Total Damaged in GRNs: ${grnDamagedTotal}`);

    // Get stock movements
    const movements = await StockMovement.find({
      productId: product._id
    }).sort({ date: -1 }).lean();

    // Calculate damaged from movements
    const damagedMovements = movements.filter(mov => 
      mov.type === 'OUT' && 
      mov.remarks && 
      mov.remarks.toLowerCase().includes('damaged')
    );

    const movementDamagedTotal = damagedMovements.reduce((sum, mov) => sum + mov.quantity, 0);

    console.log(`\n📊 Stock Movement Data:`);
    console.log(`   Total Damaged OUT movements: ${movementDamagedTotal}`);
    console.log(`   Current Balance: ${movements.length > 0 ? movements[0].balance : 0}`);

    console.log(`\n🔍 Damaged Quantity Breakdown:`);
    damagedMovements.forEach((mov, index) => {
      console.log(`   ${index + 1}. ${mov.quantity} units - ${mov.remarks} (${new Date(mov.date).toLocaleDateString()})`);
    });

    console.log(`\n✅ CORRECT CALCULATION:`);
    console.log(`   Total Quantity: ${movements.length > 0 ? movements[0].balance : 0}`);
    console.log(`   Damaged Quantity (from movements): ${movementDamagedTotal}`);
    console.log(`   Net Stock: ${movements.length > 0 ? movements[0].balance : 0} (damaged already reflected in balance)`);

    console.log(`\n⚠️  WHAT BACKEND SHOULD RETURN:`);
    console.log(`   - Damaged Quantity: ${movementDamagedTotal} (NOT ${grnDamagedTotal})`);
    console.log(`   - Net Stock should NOT subtract damaged quantity again`);

    console.log(`\n💡 To test if backend is using new code:`);
    console.log(`   1. Make API call to get stock for product ${productCode}`);
    console.log(`   2. Check if damagedQty = ${movementDamagedTotal}`);
    console.log(`   3. If it shows ${grnDamagedTotal} or wrong value, backend needs restart`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

verifyBackendCodeVersion();
