import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import StockMovement from '../models/Stock.js';
import Warehouse from '../models/Warehouse.js';
import StockMovementService from '../services/stockMovementService.js';

dotenv.config();

async function testDamagedStock() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Get a sample product
    const product = await Product.findOne({ status: 'active' }).lean();
    
    if (!product) {
      console.log('❌ No active products found');
      return;
    }

    console.log('📦 Testing Product:', product.itemName);

    // Get warehouses with stock
    const warehouseIds = await StockMovement.find({ productId: product._id }).distinct('warehouseId');
    
    console.log(`\n🏭 Found ${warehouseIds.length} warehouses with stock\n`);

    for (const whId of warehouseIds) {
      const warehouse = await Warehouse.findById(whId).select('name');
      if (!warehouse) continue;

      console.log(`\n📊 Warehouse: ${warehouse.name}`);
      console.log('─'.repeat(50));

      // Get current stock
      const currentStock = await StockMovementService.getCurrentStock(product._id, whId);
      console.log(`Current Stock (from movements): ${currentStock}`);

      // Calculate damaged stock
      const damagedMovements = await StockMovement.find({
        productId: product._id,
        warehouseId: whId,
        type: 'OUT',
        referenceType: 'DAMAGE'
      });

      let damagedQty = 0;
      damagedMovements.forEach(movement => {
        damagedQty += movement.quantity;
        console.log(`  - Damaged: ${movement.quantity} (${movement.date})`);
      });
      console.log(`Total Damaged: ${damagedQty}`);

      // Calculate blocked stock
      const blockedMovements = await StockMovement.find({
        productId: product._id,
        warehouseId: whId,
        type: 'OUT',
        referenceType: 'SALE'
      });

      const unblockedMovements = await StockMovement.find({
        productId: product._id,
        warehouseId: whId,
        type: 'IN',
        referenceType: 'SALE',
        remarks: { $regex: /Stock Unblocked/ }
      });

      let blockedQty = 0;
      blockedMovements.forEach(movement => {
        blockedQty += movement.quantity;
      });

      unblockedMovements.forEach(movement => {
        blockedQty -= movement.quantity;
      });

      blockedQty = Math.max(0, blockedQty);
      console.log(`Total Blocked: ${blockedQty}`);

      // Calculate net stock
      const netStock = currentStock - damagedQty - blockedQty;
      console.log(`\n✅ NET STOCK = ${currentStock} - ${damagedQty} - ${blockedQty} = ${netStock}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testDamagedStock();
