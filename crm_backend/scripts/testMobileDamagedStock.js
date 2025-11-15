import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import GRN from '../models/GRN.js';
import StockMovement from '../models/Stock.js';
import Warehouse from '../models/Warehouse.js';
import StockMovementService from '../services/stockMovementService.js';

dotenv.config();

async function testMobileDamagedStock() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Get a sample product with damaged stock
    const product = await Product.findOne({ status: 'active' }).lean();
    
    if (!product) {
      console.log('❌ No active products found');
      return;
    }

    console.log('📦 Testing Product:', product.itemName);
    console.log('Product Code:', product.productCode);

    // Get warehouses with stock
    const warehouseIds = await StockMovement.find({ productId: product._id }).distinct('warehouseId');
    
    console.log(`\n🏭 Found ${warehouseIds.length} warehouses with stock\n`);

    for (const whId of warehouseIds) {
      const warehouse = await Warehouse.findById(whId).select('name');
      if (!warehouse) continue;

      console.log(`\n📊 Warehouse: ${warehouse.name}`);
      console.log('─'.repeat(60));

      // Get current stock
      const currentStock = await StockMovementService.getCurrentStock(product._id, whId);
      console.log(`Current Stock (from movements): ${currentStock}`);

      // Calculate damaged stock from GRN items (MOBILE WAY - NEW)
      const grns = await GRN.find({
        'items.productId': product._id,
        warehouseId: whId
      });
      
      let damagedQtyFromGRN = 0;
      grns.forEach(grn => {
        if (grn.items && Array.isArray(grn.items)) {
          grn.items.forEach(item => {
            const itemProductId = item.productId?._id ? item.productId._id.toString() : item.productId.toString();
            if (itemProductId === product._id.toString()) {
              if (item.damageQuantity > 0) {
                console.log(`  - GRN ${grn.grnNo}: Damaged ${item.damageQuantity}`);
                damagedQtyFromGRN += item.damageQuantity || 0;
              }
            }
          });
        }
      });
      console.log(`Total Damaged (from GRN): ${damagedQtyFromGRN}`);

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

      // Calculate net stock (MOBILE WAY - FIXED)
      const netStock = currentStock - damagedQtyFromGRN - blockedQty;
      console.log(`\n✅ NET STOCK = ${currentStock} - ${damagedQtyFromGRN} - ${blockedQty} = ${netStock}`);
      console.log(`   (This should now match the web CRM)`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testMobileDamagedStock();
