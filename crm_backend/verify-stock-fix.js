import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';
import GRN from './models/GRN.js';
import Product from './models/Product.js';

dotenv.config();

const verifyStockFix = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check the specific product mentioned by user: 15454636
    const productCode = '15454636';
    
    console.log(`\n🔍 Checking product: ${productCode}`);
    
    const product = await Product.findOne({ productCode }).lean();
    if (!product) {
      console.log(`❌ Product ${productCode} not found`);
      return;
    }
    
    console.log(`✅ Found product: ${product.itemName} (${product._id})`);
    
    // Get all GRNs for this product
    const grns = await GRN.find({ 'items.productId': product._id })
      .populate('warehouseId', 'name')
      .sort({ grnDate: -1 })
      .lean();
    
    console.log(`\n📦 Found ${grns.length} GRNs for this product:`);
    
    let totalAccepted = 0;
    let totalDamaged = 0;
    
    grns.forEach((grn, index) => {
      const item = grn.items.find(i => i.productId.toString() === product._id.toString());
      if (item) {
        console.log(`\n  GRN ${index + 1}: ${grn.grnNo}`);
        console.log(`    Date: ${grn.grnDate}`);
        console.log(`    Warehouse: ${grn.warehouseId?.name || 'Unknown'}`);
        console.log(`    Accepted Qty: ${item.acceptedQuantity}`);
        console.log(`    Damaged Qty: ${item.damageQuantity}`);
        
        totalAccepted += item.acceptedQuantity || 0;
        totalDamaged += item.damageQuantity || 0;
      }
    });
    
    console.log(`\n📊 GRN Summary:`);
    console.log(`  Total Accepted: ${totalAccepted}`);
    console.log(`  Total Damaged: ${totalDamaged}`);
    
    // Get all stock movements for this product
    const movements = await StockMovement.find({ productId: product._id })
      .populate('warehouseId', 'name')
      .sort({ date: 1, createdAt: 1 })
      .lean();
    
    console.log(`\n📈 Found ${movements.length} stock movements:`);
    
    let runningBalance = 0;
    movements.forEach((movement, index) => {
      if (movement.type === 'IN') {
        runningBalance += movement.quantity;
      } else if (movement.type === 'OUT') {
        runningBalance -= movement.quantity;
      }
      
      console.log(`\n  Movement ${index + 1}:`);
      console.log(`    Type: ${movement.type}`);
      console.log(`    Quantity: ${movement.quantity}`);
      console.log(`    Balance (stored): ${movement.balance}`);
      console.log(`    Balance (calculated): ${runningBalance}`);
      console.log(`    Reference: ${movement.referenceType} - ${movement.referenceNo}`);
      console.log(`    Date: ${movement.date}`);
      console.log(`    Warehouse: ${movement.warehouseId?.name || 'Unknown'}`);
      console.log(`    Remarks: ${movement.remarks}`);
      
      if (movement.balance !== runningBalance) {
        console.log(`    ⚠️ BALANCE MISMATCH!`);
      }
    });
    
    console.log(`\n✅ Final Stock Balance: ${runningBalance}`);
    console.log(`\n📊 Expected Stock Calculation:`);
    console.log(`  Total Accepted from GRNs: ${totalAccepted}`);
    console.log(`  Total Damaged from GRNs: ${totalDamaged}`);
    console.log(`  Expected Usable Stock: ${totalAccepted} (damaged is tracked separately, not subtracted)`);
    console.log(`  Actual Stock Balance: ${runningBalance}`);
    
    if (runningBalance === totalAccepted) {
      console.log(`\n✅ STOCK CALCULATION IS CORRECT!`);
      console.log(`   - Stock movements show: ${runningBalance} units`);
      console.log(`   - Damaged quantity (${totalDamaged}) is tracked in GRN for display only`);
      console.log(`   - Net usable stock = ${runningBalance} units`);
    } else {
      console.log(`\n❌ STOCK MISMATCH!`);
      console.log(`   Expected: ${totalAccepted}`);
      console.log(`   Actual: ${runningBalance}`);
      console.log(`   Difference: ${totalAccepted - runningBalance}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

verifyStockFix();
