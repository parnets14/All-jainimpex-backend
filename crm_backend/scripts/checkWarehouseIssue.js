import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Warehouse from '../models/Warehouse.js';
import StockMovement from '../models/Stock.js';

dotenv.config();

async function checkWarehouseIssue() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Get all warehouses (including inactive)
    const allWarehouses = await Warehouse.find({})
      .select('name code isActive status')
      .lean();

    console.log('🏭 ALL Warehouses in Database:');
    allWarehouses.forEach((wh, i) => {
      console.log(`${i + 1}. ${wh.name} (${wh.code}) - Active: ${wh.isActive}, Status: ${wh.status}`);
    });

    // Get warehouses that have stock movements
    const warehousesWithStock = await StockMovement.distinct('warehouseId');
    console.log(`\n📦 Warehouses with Stock Movements: ${warehousesWithStock.length}`);

    // Check each warehouse with stock
    for (const whId of warehousesWithStock) {
      const warehouse = await Warehouse.findById(whId).select('name code isActive status');
      if (warehouse) {
        const movementCount = await StockMovement.countDocuments({ warehouseId: whId });
        console.log(`  - ${warehouse.name} (${warehouse.code}): ${movementCount} movements, Active: ${warehouse.isActive}, Status: ${warehouse.status}`);
      } else {
        const movementCount = await StockMovement.countDocuments({ warehouseId: whId });
        console.log(`  - ⚠️  WAREHOUSE NOT FOUND (ID: ${whId}): ${movementCount} movements`);
      }
    }

    // Find inactive warehouses with stock
    console.log('\n⚠️  Inactive Warehouses with Stock:');
    for (const whId of warehousesWithStock) {
      const warehouse = await Warehouse.findById(whId);
      if (warehouse && (!warehouse.isActive || warehouse.status !== 'active')) {
        const movementCount = await StockMovement.countDocuments({ warehouseId: whId });
        console.log(`  - ${warehouse.name} (${warehouse.code}): ${movementCount} movements`);
        console.log(`    isActive: ${warehouse.isActive}, status: ${warehouse.status}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkWarehouseIssue();
