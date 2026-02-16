import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';
import Product from './models/Product.js';
import GRN from './models/GRN.js';
import Warehouse from './models/Warehouse.js';
import Supplier from './models/Supplier.js';

dotenv.config();

const checkRecentStockIssue = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Check the product from the screenshot: 15454636
    const productCode = '15454636';
    
    console.log(`\n🔍 Checking stock issue for product: ${productCode}`);
    console.log('='.repeat(60));

    // Find the product
    const product = await Product.findOne({ productCode });
    if (!product) {
      console.log(`❌ Product ${productCode} not found`);
      process.exit(1);
    }

    console.log(`\n✅ Found product: ${product.itemName} (${product.productCode})`);

    // Find all GRNs for this product
    const grns = await GRN.find({ 'items.productId': product._id })
      .populate('warehouseId', 'name')
      .populate('supplierId', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    console.log(`\n📦 Found ${grns.length} recent GRN(s):`);
    
    grns.forEach((grn, index) => {
      const item = grn.items.find(i => i.productId.toString() === product._id.toString());
      if (item) {
        console.log(`\n${index + 1}. GRN: ${grn.grnNo}`);
        console.log(`   Date: ${new Date(grn.createdAt).toLocaleString()}`);
        console.log(`   Warehouse: ${grn.warehouseId?.name || 'Unknown'}`);
        console.log(`   Supplier: ${grn.supplierId?.name || 'Unknown'}`);
        console.log(`   Received: ${item.receivedQuantity}`);
        console.log(`   Accepted: ${item.acceptedQuantity}`);
        console.log(`   Damaged (in GRN): ${item.damageQuantity || 0}`);
      }
    });

    // Check stock movements
    const movements = await StockMovement.find({
      productId: product._id
    })
    .populate('warehouseId', 'name')
    .sort({ date: -1 })
    .limit(10)
    .lean();

    console.log(`\n📊 Recent Stock Movements (${movements.length}):`);
    movements.forEach((mov, index) => {
      console.log(`\n${index + 1}. ${mov.type} ${mov.quantity}`);
      console.log(`   Date: ${new Date(mov.date).toLocaleString()}`);
      console.log(`   Warehouse: ${mov.warehouseId?.name || 'Unknown'}`);
      console.log(`   Reference: ${mov.referenceType} - ${mov.referenceNo}`);
      console.log(`   Remarks: ${mov.remarks || 'No remarks'}`);
      console.log(`   Balance: ${mov.balance}`);
    });

    // Calculate damaged quantity from movements
    const warehouseGroups = {};
    movements.forEach(mov => {
      const whId = mov.warehouseId?._id?.toString() || 'unknown';
      if (!warehouseGroups[whId]) {
        warehouseGroups[whId] = {
          name: mov.warehouseId?.name || 'Unknown',
          damaged: 0,
          total: 0
        };
      }
      
      if (mov.type === 'OUT' && mov.remarks && mov.remarks.toLowerCase().includes('damaged')) {
        warehouseGroups[whId].damaged += mov.quantity;
      }
    });

    console.log(`\n📈 Damaged Quantity by Warehouse:`);
    Object.values(warehouseGroups).forEach(wh => {
      console.log(`   ${wh.name}: ${wh.damaged} damaged`);
    });

    // Get current stock from movements
    const currentBalance = movements.length > 0 ? movements[0].balance : 0;
    console.log(`\n📊 Current Stock Summary:`);
    console.log(`   Current Balance: ${currentBalance}`);
    console.log(`   Total Damaged: ${Object.values(warehouseGroups).reduce((sum, wh) => sum + wh.damaged, 0)}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

checkRecentStockIssue();
