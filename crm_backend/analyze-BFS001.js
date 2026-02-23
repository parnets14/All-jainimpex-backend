import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';
import Product from './models/Product.js';
import GRN from './models/GRN.js';
import SalesOrder from './models/SalesOrder.js';
import Warehouse from './models/Warehouse.js';

dotenv.config();

const analyzeBFS001 = async () => {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Find the product
    const product = await Product.findOne({ productCode: 'BFS001' }).lean();
    if (!product) {
      console.log('❌ Product BFS001 not found');
      process.exit(1);
    }

    console.log('📦 PRODUCT INFORMATION');
    console.log('='.repeat(80));
    console.log(`Product Code: ${product.productCode}`);
    console.log(`Item Name: ${product.itemName}`);
    console.log(`HSN Code: ${product.hsnCode}`);
    console.log(`Base Price: ₹${product.basePrice}`);
    console.log(`GST: ${product.gst}%`);
    console.log(`Min Stock Level: ${product.minStockLevel}`);
    console.log(`Product ID: ${product._id}`);

    const warehouseId = '68e8f0283f5fd5a817866df6'; // Jain Impex Hub
    const warehouseObjectId = new mongoose.Types.ObjectId(warehouseId);

    // ============================================
    // 1. TOTAL QUANTITY CALCULATION
    // ============================================
    console.log('\n\n📊 1. TOTAL QUANTITY CALCULATION');
    console.log('='.repeat(80));
    console.log('Source: StockMovement records (running balance)');
    
    const allMovements = await StockMovement.find({
      productId: product._id,
      warehouseId: warehouseObjectId
    }).sort({ date: 1, createdAt: 1 }).lean();

    console.log(`\nFound ${allMovements.length} total movements:`);
    let runningBalance = 0;
    allMovements.forEach((mov, index) => {
      const sign = mov.type === 'IN' ? '+' : '-';
      runningBalance = mov.balance;
      console.log(`  ${index + 1}. [${mov.date.toISOString().split('T')[0]}] ${mov.type.padEnd(3)} ${sign}${mov.quantity.toString().padStart(3)} | Balance: ${mov.balance.toString().padStart(4)} | ${mov.referenceType}: ${mov.referenceNo}`);
    });

    const latestMovement = allMovements[allMovements.length - 1];
    const totalQuantity = latestMovement ? latestMovement.balance : 0;
    console.log(`\n✅ TOTAL QUANTITY = ${totalQuantity} (from latest balance)`);

    // ============================================
    // 2. DAMAGED QUANTITY CALCULATION
    // ============================================
    console.log('\n\n🔴 2. DAMAGED QUANTITY CALCULATION');
    console.log('='.repeat(80));
    console.log('Source: GRN records (damageQuantity field)');

    const grns = await GRN.find({
      'items.productId': product._id,
      warehouseId: warehouseObjectId
    }).populate('warehouseId', 'name').lean();

    let damagedQty = 0;
    console.log(`\nFound ${grns.length} GRNs:`);
    grns.forEach((grn, index) => {
      grn.items.forEach(item => {
        if (item.productId.toString() === product._id.toString()) {
          damagedQty += item.damageQuantity || 0;
          console.log(`  ${index + 1}. GRN: ${grn.grnNo} | Accepted: ${item.acceptedQuantity} | Damaged: ${item.damageQuantity || 0}`);
        }
      });
    });

    console.log(`\n✅ DAMAGED QUANTITY = ${damagedQty}`);
    console.log('Note: Damaged items are NOT included in Total Quantity (never entered usable stock)');

    // ============================================
    // 3. BLOCKED QUANTITY CALCULATION
    // ============================================
    console.log('\n\n🔒 3. BLOCKED QUANTITY CALCULATION');
    console.log('='.repeat(80));
    console.log('Source: StockMovement records with referenceType = "SALE"');

    const blockedResult = await StockMovement.aggregate([
      {
        $match: {
          productId: product._id,
          warehouseId: warehouseObjectId,
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

    console.log('\nAggregation result:', JSON.stringify(blockedResult, null, 2));

    let blockedQty = 0;
    let blockedOut = 0;
    let blockedIn = 0;

    blockedResult.forEach(result => {
      if (result._id === 'OUT') {
        blockedOut = result.totalQuantity;
        blockedQty += result.totalQuantity;
      } else if (result._id === 'IN') {
        blockedIn = result.totalQuantity;
        blockedQty -= result.totalQuantity;
      }
    });

    blockedQty = Math.max(0, blockedQty);

    console.log(`\nBlocked OUT (reserved for sales): ${blockedOut}`);
    console.log(`Blocked IN (returned/cancelled): ${blockedIn}`);
    console.log(`\n✅ BLOCKED QUANTITY = ${blockedOut} - ${blockedIn} = ${blockedQty}`);

    // Get detailed blocked movements
    const blockedMovements = await StockMovement.find({
      productId: product._id,
      warehouseId: warehouseObjectId,
      referenceType: 'SALE'
    }).sort({ date: 1 }).lean();

    console.log(`\nDetailed blocked movements (${blockedMovements.length} records):`);
    blockedMovements.forEach((mov, index) => {
      const sign = mov.type === 'OUT' ? '-' : '+';
      console.log(`  ${index + 1}. [${mov.date.toISOString().split('T')[0]}] ${mov.type.padEnd(3)} ${sign}${mov.quantity.toString().padStart(3)} | ${mov.referenceNo} | ${mov.remarks}`);
    });

    // ============================================
    // 4. NET STOCK CALCULATION
    // ============================================
    console.log('\n\n💰 4. NET STOCK CALCULATION');
    console.log('='.repeat(80));
    console.log('Formula: Net Stock = Total Quantity - Blocked Quantity');

    const netStock = totalQuantity - blockedQty;
    console.log(`\nNet Stock = ${totalQuantity} - ${blockedQty} = ${netStock}`);
    console.log(`\n✅ NET STOCK = ${netStock}`);

    if (netStock < 0) {
      console.log('⚠️  WARNING: Net Stock is NEGATIVE! This means more stock is blocked than available.');
      console.log('   This can happen when orders are confirmed but stock hasn\'t been received yet.');
    }

    // ============================================
    // 5. STOCK STATUS CALCULATION
    // ============================================
    console.log('\n\n📈 5. STOCK STATUS CALCULATION');
    console.log('='.repeat(80));
    console.log(`Min Stock Level: ${product.minStockLevel}`);
    console.log(`Net Stock: ${netStock}`);

    let stockStatus;
    if (netStock <= 0) {
      stockStatus = 'Out of Stock';
    } else if (netStock < product.minStockLevel) {
      stockStatus = 'Low Stock';
    } else {
      stockStatus = 'In Stock';
    }

    console.log(`\n✅ STOCK STATUS = "${stockStatus}"`);

    // ============================================
    // 6. PENDING QUANTITY CALCULATION
    // ============================================
    console.log('\n\n⏳ 6. PENDING QUANTITY CALCULATION');
    console.log('='.repeat(80));
    console.log('Source: Sales Orders with status "Pending" and isOutOfStock = true');

    const pendingOrders = await SalesOrder.find({
      'products.productId': product._id,
      status: 'Pending',
      isOutOfStock: true
    }).lean();

    let pendingQty = 0;
    console.log(`\nFound ${pendingOrders.length} pending out-of-stock orders:`);
    pendingOrders.forEach((order, index) => {
      order.products.forEach(prod => {
        if (prod.productId.toString() === product._id.toString()) {
          pendingQty += prod.quantity;
          console.log(`  ${index + 1}. ${order.salesOrderNo} | Quantity: ${prod.quantity} | Dealer: ${order.dealerId?.name || 'N/A'}`);
        }
      });
    });

    console.log(`\n✅ PENDING QUANTITY = ${pendingQty}`);

    // ============================================
    // 7. 30-DAY SALES CALCULATION
    // ============================================
    console.log('\n\n📅 7. 30-DAY SALES CALCULATION');
    console.log('='.repeat(80));
    console.log('Source: StockMovement records with referenceType = "SALE" in last 30 days');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesMovements = await StockMovement.find({
      productId: product._id,
      warehouseId: warehouseObjectId,
      referenceType: 'SALE',
      type: 'OUT',
      date: { $gte: thirtyDaysAgo }
    }).lean();

    let sales30Days = 0;
    console.log(`\nFound ${salesMovements.length} sales movements in last 30 days:`);
    salesMovements.forEach((mov, index) => {
      sales30Days += mov.quantity;
      console.log(`  ${index + 1}. [${mov.date.toISOString().split('T')[0]}] ${mov.referenceNo} | Quantity: ${mov.quantity}`);
    });

    console.log(`\n✅ 30-DAY SALES = ${sales30Days}`);

    // ============================================
    // 8. SUGGESTED ORDER CALCULATION
    // ============================================
    console.log('\n\n📦 8. SUGGESTED ORDER CALCULATION');
    console.log('='.repeat(80));
    console.log('Formula: Suggested Order = (Min Stock Level + Pending Quantity + 30-Day Sales) - Net Stock');

    const suggestedOrder = Math.max(0, (product.minStockLevel + pendingQty + sales30Days) - netStock);
    
    console.log(`\nCalculation:`);
    console.log(`  Min Stock Level: ${product.minStockLevel}`);
    console.log(`  Pending Quantity: ${pendingQty}`);
    console.log(`  30-Day Sales: ${sales30Days}`);
    console.log(`  Net Stock: ${netStock}`);
    console.log(`\n  Suggested = (${product.minStockLevel} + ${pendingQty} + ${sales30Days}) - ${netStock}`);
    console.log(`  Suggested = ${product.minStockLevel + pendingQty + sales30Days} - ${netStock}`);
    console.log(`  Suggested = ${suggestedOrder}`);

    console.log(`\n✅ SUGGESTED ORDER = ${suggestedOrder} units`);

    // ============================================
    // 9. TOTAL VALUE CALCULATION
    // ============================================
    console.log('\n\n💵 9. TOTAL VALUE CALCULATION');
    console.log('='.repeat(80));
    console.log('Formula: Total Value = Total Quantity × Base Price × (1 + GST/100)');

    const priceWithGST = product.basePrice * (1 + product.gst / 100);
    const totalValue = totalQuantity * priceWithGST;

    console.log(`\nCalculation:`);
    console.log(`  Base Price: ₹${product.basePrice}`);
    console.log(`  GST: ${product.gst}%`);
    console.log(`  Price with GST: ₹${product.basePrice} × 1.${product.gst} = ₹${priceWithGST}`);
    console.log(`  Total Value: ${totalQuantity} × ₹${priceWithGST} = ₹${totalValue}`);

    console.log(`\n✅ TOTAL VALUE = ₹${totalValue.toFixed(2)}`);

    // ============================================
    // FINAL SUMMARY
    // ============================================
    console.log('\n\n' + '='.repeat(80));
    console.log('📋 FINAL SUMMARY - BFS001');
    console.log('='.repeat(80));
    console.log(`Total Quantity:      ${totalQuantity.toString().padStart(6)} units`);
    console.log(`Damaged Quantity:    ${damagedQty.toString().padStart(6)} units`);
    console.log(`Blocked Quantity:    ${blockedQty.toString().padStart(6)} units`);
    console.log(`Net Stock:           ${netStock.toString().padStart(6)} units`);
    console.log(`Min Stock Level:     ${product.minStockLevel.toString().padStart(6)} units`);
    console.log(`Stock Status:        ${stockStatus}`);
    console.log(`Pending Quantity:    ${pendingQty.toString().padStart(6)} units`);
    console.log(`30-Day Sales:        ${sales30Days.toString().padStart(6)} units`);
    console.log(`Suggested Order:     ${suggestedOrder.toString().padStart(6)} units`);
    console.log(`Total Value:         ₹${totalValue.toFixed(2)}`);
    console.log('='.repeat(80));

    // ============================================
    // VERIFICATION AGAINST IMAGES
    // ============================================
    console.log('\n\n✅ VERIFICATION AGAINST YOUR IMAGES');
    console.log('='.repeat(80));
    
    const imageData = {
      totalQuantity: 101,
      damagedQuantity: 0,
      blockedQuantity: 121,
      netStock: -20,
      minStockLevel: 33,
      pendingQuantity: 121,
      sales30Days: 121,
      suggestedOrder: 82
    };

    console.log('\nComparison:');
    console.log(`Total Quantity:      Calculated: ${totalQuantity.toString().padStart(4)} | Image: ${imageData.totalQuantity.toString().padStart(4)} | ${totalQuantity === imageData.totalQuantity ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(`Damaged Quantity:    Calculated: ${damagedQty.toString().padStart(4)} | Image: ${imageData.damagedQuantity.toString().padStart(4)} | ${damagedQty === imageData.damagedQuantity ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(`Blocked Quantity:    Calculated: ${blockedQty.toString().padStart(4)} | Image: ${imageData.blockedQuantity.toString().padStart(4)} | ${blockedQty === imageData.blockedQuantity ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(`Net Stock:           Calculated: ${netStock.toString().padStart(4)} | Image: ${imageData.netStock.toString().padStart(4)} | ${netStock === imageData.netStock ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(`Min Stock Level:     Calculated: ${product.minStockLevel.toString().padStart(4)} | Image: ${imageData.minStockLevel.toString().padStart(4)} | ${product.minStockLevel === imageData.minStockLevel ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(`Pending Quantity:    Calculated: ${pendingQty.toString().padStart(4)} | Image: ${imageData.pendingQuantity.toString().padStart(4)} | ${pendingQty === imageData.pendingQuantity ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(`30-Day Sales:        Calculated: ${sales30Days.toString().padStart(4)} | Image: ${imageData.sales30Days.toString().padStart(4)} | ${sales30Days === imageData.sales30Days ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(`Suggested Order:     Calculated: ${suggestedOrder.toString().padStart(4)} | Image: ${imageData.suggestedOrder.toString().padStart(4)} | ${suggestedOrder === imageData.suggestedOrder ? '✅ MATCH' : '❌ MISMATCH'}`);

    console.log('\n✅ Analysis complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

analyzeBFS001();
