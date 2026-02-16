import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import StockMovement from './models/Stock.js';
import GRN from './models/GRN.js';
import Warehouse from './models/Warehouse.js';
import Supplier from './models/Supplier.js';
import StockMovementService from './services/stockMovementService.js';

dotenv.config();

const debugStockCalculation = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    const productCode = '15454636';
    
    console.log(`\n🔍 Debugging Stock Calculation for: ${productCode}`);
    console.log('='.repeat(70));

    // Find the product
    const product = await Product.findOne({ productCode });
    if (!product) {
      console.log(`❌ Product ${productCode} not found`);
      process.exit(1);
    }

    console.log(`\n✅ Product: ${product.itemName}`);

    // Get all GRNs
    const grns = await GRN.find({ 'items.productId': product._id })
      .populate('warehouseId', 'name')
      .lean();

    console.log(`\n📦 GRN Analysis:`);
    let totalAcceptedFromGRN = 0;
    let totalDamagedFromGRN = 0;

    grns.forEach(grn => {
      grn.items.forEach(item => {
        if (item.productId.toString() === product._id.toString()) {
          totalAcceptedFromGRN += item.acceptedQuantity || 0;
          totalDamagedFromGRN += item.damageQuantity || 0;
          console.log(`   GRN ${grn.grnNo}: Accepted=${item.acceptedQuantity}, Damaged=${item.damageQuantity}`);
        }
      });
    });

    console.log(`   Total Accepted from GRNs: ${totalAcceptedFromGRN}`);
    console.log(`   Total Damaged from GRNs: ${totalDamagedFromGRN}`);

    // Get stock movements
    const movements = await StockMovement.find({
      productId: product._id
    }).sort({ date: -1 }).lean();

    console.log(`\n📊 Stock Movement Analysis:`);
    console.log(`   Total movements: ${movements.length}`);

    // Get current stock from service
    const warehouseIds = [...new Set(movements.map(m => m.warehouseId?.toString()).filter(Boolean))];
    
    for (const warehouseId of warehouseIds) {
      console.log(`\n   Warehouse ID: ${warehouseId}`);
      
      const currentStock = await StockMovementService.getCurrentStock(product._id, warehouseId);
      console.log(`   Current Stock (from service): ${currentStock}`);

      // Calculate damaged from movements
      const damagedMovements = await StockMovement.find({
        productId: product._id,
        warehouseId: warehouseId,
        type: 'OUT',
        remarks: { $regex: 'Damaged', $options: 'i' }
      }).lean();

      const damagedQty = damagedMovements.reduce((sum, mov) => sum + mov.quantity, 0);
      console.log(`   Damaged Quantity (from movements): ${damagedQty}`);

      // Calculate blocked quantity
      const blockedResult = await StockMovement.aggregate([
        {
          $match: {
            productId: product._id,
            warehouseId: mongoose.Types.ObjectId(warehouseId),
            referenceType: 'SALE'
          }
        },
        {
          $group: {
            _id: '$type',
            totalQuantity: { $sum: '$quantity' }
          }
        }
      ]);

      let blockedQty = 0;
      blockedResult.forEach(result => {
        if (result._id === 'OUT') {
          blockedQty += result.totalQuantity;
        } else if (result._id === 'IN') {
          blockedQty -= result.totalQuantity;
        }
      });
      blockedQty = Math.max(0, blockedQty);

      console.log(`   Blocked Quantity: ${blockedQty}`);

      // Calculate net stock
      const netStock = currentStock - blockedQty;
      console.log(`   Net Stock: ${netStock}`);

      console.log(`\n   ✅ CORRECT VALUES FOR API:`);
      console.log(`      totalQty: ${currentStock}`);
      console.log(`      damagedQty: ${damagedQty}`);
      console.log(`      blockedQty: ${blockedQty}`);
      console.log(`      netStock: ${netStock}`);
    }

    // Show recent movements
    console.log(`\n📋 Recent Movements:`);
    movements.slice(0, 5).forEach((mov, i) => {
      console.log(`   ${i + 1}. ${mov.type} ${mov.quantity} - Balance: ${mov.balance} - ${mov.remarks || 'No remarks'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

debugStockCalculation();
