import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';
import Product from './models/Product.js';
import GRN from './models/GRN.js';
import Warehouse from './models/Warehouse.js';

dotenv.config();

const testDamagedQuantityFix = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test with product 154154658 from GRN-1771234629393
    const productCode = '154154658';
    
    console.log(`\n🔍 Testing damaged quantity fix for product: ${productCode}`);
    console.log('='.repeat(60));

    // Find the product
    const product = await Product.findOne({ productCode });
    if (!product) {
      console.log(`❌ Product ${productCode} not found`);
      process.exit(1);
    }

    console.log(`\n✅ Found product: ${product.itemName} (${product.productCode})`);

    // Find GRN
    const grn = await GRN.findOne({ grnNo: 'GRN-1771234629393' })
      .populate('warehouseId', 'name');

    if (!grn) {
      console.log(`❌ GRN-1771234629393 not found`);
      process.exit(1);
    }

    console.log(`\n✅ Found GRN: ${grn.grnNo}`);
    console.log(`   Warehouse: ${grn.warehouseId.name}`);

    // Check GRN damage quantity
    const grnItem = grn.items.find(item => 
      item.productId.toString() === product._id.toString()
    );

    if (grnItem) {
      console.log(`\n📦 GRN Item Details:`);
      console.log(`   Received: ${grnItem.receivedQuantity}`);
      console.log(`   Accepted: ${grnItem.acceptedQuantity}`);
      console.log(`   Damaged (in GRN): ${grnItem.damageQuantity}`);
    }

    // Check stock movements for damaged items
    const damagedMovements = await StockMovement.find({
      productId: product._id,
      warehouseId: grn.warehouseId._id,
      type: 'OUT',
      remarks: { $regex: 'Damaged', $options: 'i' }
    }).lean();

    console.log(`\n📊 Stock Movements (Damaged):`);
    console.log(`   Found ${damagedMovements.length} damaged movement(s)`);
    
    let totalDamagedFromMovements = 0;
    damagedMovements.forEach((mov, index) => {
      console.log(`   ${index + 1}. Quantity: ${mov.quantity}, Remarks: ${mov.remarks}`);
      totalDamagedFromMovements += mov.quantity;
    });

    console.log(`\n✅ Total Damaged Quantity (from movements): ${totalDamagedFromMovements}`);

    // Check all stock movements for this product-warehouse
    const allMovements = await StockMovement.find({
      productId: product._id,
      warehouseId: grn.warehouseId._id
    }).sort({ date: 1 }).lean();

    console.log(`\n📈 All Stock Movements:`);
    allMovements.forEach((mov, index) => {
      console.log(`   ${index + 1}. ${mov.type} ${mov.quantity} - ${mov.referenceType} (${mov.referenceNo}) - ${mov.remarks || 'No remarks'}`);
    });

    // Calculate current stock
    let currentStock = 0;
    allMovements.forEach(mov => {
      if (mov.type === 'IN') {
        currentStock += mov.quantity;
      } else {
        currentStock -= mov.quantity;
      }
    });

    console.log(`\n📊 Stock Summary:`);
    console.log(`   Current Stock: ${currentStock}`);
    console.log(`   Damaged Quantity: ${totalDamagedFromMovements}`);
    console.log(`   Net Available: ${currentStock - totalDamagedFromMovements}`);

    console.log(`\n✅ Fix Verification:`);
    console.log(`   GRN shows: ${grnItem?.damageQuantity || 0} damaged (historical data)`);
    console.log(`   Stock movements show: ${totalDamagedFromMovements} damaged (source of truth)`);
    console.log(`   Expected display: ${totalDamagedFromMovements} damaged`);

    if (totalDamagedFromMovements === 1) {
      console.log(`\n✅ SUCCESS: Damaged quantity is correct (1 unit)`);
    } else {
      console.log(`\n⚠️  WARNING: Expected 1 damaged unit, found ${totalDamagedFromMovements}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testDamagedQuantityFix();
