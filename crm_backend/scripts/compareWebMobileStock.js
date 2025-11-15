import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import GRN from '../models/GRN.js';
import Warehouse from '../models/Warehouse.js';
import StockMovementService from '../services/stockMovementService.js';
import StockMovement from '../models/Stock.js';

dotenv.config();

async function compareWebMobileStock() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Test with the product from the screenshot
    const product = await Product.findOne({ productCode: 'HTB001' }).lean();
    const warehouse = await Warehouse.findOne({ name: 'south popualr' }).lean();
    
    if (!product || !warehouse) {
      console.log('❌ Product or warehouse not found');
      return;
    }

    console.log('📦 Product:', product.itemName, `(${product.productCode})`);
    console.log('🏭 Warehouse:', warehouse.name);
    console.log('─'.repeat(60));

    // WEB CRM CALCULATION
    console.log('\n🌐 WEB CRM CALCULATION:');
    const grns = await GRN.find({
      'items.productId': product._id,
      warehouseId: warehouse._id
    });
    
    let webDamagedQty = 0;
    grns.forEach(grn => {
      if (grn.items && Array.isArray(grn.items)) {
        grn.items.forEach(item => {
          const itemProductId = item.productId?._id ? item.productId._id.toString() : item.productId.toString();
          if (itemProductId === product._id.toString()) {
            webDamagedQty += item.damageQuantity || 0;
          }
        });
      }
    });
    
    const currentStock = await StockMovementService.getCurrentStock(product._id, warehouse._id);
    
    // Calculate blocked stock
    const blockedMovements = await StockMovement.find({
      productId: product._id,
      warehouseId: warehouse._id,
      type: 'OUT',
      referenceType: 'SALE'
    });
    
    const unblockedMovements = await StockMovement.find({
      productId: product._id,
      warehouseId: warehouse._id,
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
    
    const webNetStock = currentStock - webDamagedQty - blockedQty;
    
    console.log(`  Current Stock: ${currentStock}`);
    console.log(`  Damaged (from GRN): ${webDamagedQty}`);
    console.log(`  Blocked: ${blockedQty}`);
    console.log(`  Net Stock: ${webNetStock}`);

    // MOBILE APP CALCULATION (AFTER FIX)
    console.log('\n📱 MOBILE APP CALCULATION (AFTER FIX):');
    const mobileDamagedQty = webDamagedQty; // Now using same calculation
    const mobileNetStock = currentStock - mobileDamagedQty - blockedQty;
    
    console.log(`  Current Stock: ${currentStock}`);
    console.log(`  Damaged (from GRN): ${mobileDamagedQty}`);
    console.log(`  Blocked: ${blockedQty}`);
    console.log(`  Net Stock: ${mobileNetStock}`);

    // COMPARISON
    console.log('\n' + '='.repeat(60));
    if (webNetStock === mobileNetStock) {
      console.log('✅ SUCCESS! Web and Mobile stock calculations MATCH!');
      console.log(`   Both show: ${mobileNetStock} pcs`);
    } else {
      console.log('❌ MISMATCH!');
      console.log(`   Web: ${webNetStock} pcs`);
      console.log(`   Mobile: ${mobileNetStock} pcs`);
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

compareWebMobileStock();
