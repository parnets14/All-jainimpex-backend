import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Stock from './models/Stock.js';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';
import StockAdjustment from './models/StockAdjustment.js';
import Warehouse from './models/Warehouse.js';

dotenv.config();

// StockMovement is exported from Stock.js
const StockMovement = mongoose.model('StockMovement');

const PRODUCT_CODE = '15151663';
const HSN_CODE = '51550965';

async function debugNegativeStock() {
  try {
    console.log('🔍 DEBUGGING NEGATIVE STOCK FOR PRODUCT:', PRODUCT_CODE);
    console.log('=' .repeat(80));
    
    // Check MongoDB connection
    console.log('\n📊 ENVIRONMENT CHECK:');
    console.log('MONGO_URL:', process.env.MONGO_URL ? '✅ Set' : '❌ Not set');
    console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Set' : '❌ Not set');
    
    const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI;
    if (!mongoUrl) {
      console.error('❌ No MongoDB connection string found in environment!');
      console.log('\nPlease check your .env file for:');
      console.log('  MONGO_URL=mongodb://...');
      console.log('  or');
      console.log('  MONGODB_URI=mongodb://...');
      return;
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected to MongoDB\n');

    // 1. Find the product
    console.log('1️⃣ FINDING PRODUCT:');
    console.log('-'.repeat(80));
    const product = await Product.findOne({ 
      $or: [
        { productCode: PRODUCT_CODE },
        { hsnCode: HSN_CODE }
      ]
    });
    
    if (!product) {
      console.log('❌ Product not found!');
      return;
    }
    
    console.log('✅ Product found:');
    console.log('  ID:', product._id);
    console.log('  Code:', product.productCode);
    console.log('  Name:', product.itemName);
    console.log('  HSN:', product.hsnCode);
    console.log('  Base Price:', product.basePrice);

    // 2. Get current stock status
    console.log('\n2️⃣ CURRENT STOCK STATUS:');
    console.log('-'.repeat(80));
    const stockRecords = await Stock.find({ productId: product._id }).sort({ warehouseId: 1 });
    
    let totalStock = 0;
    let totalBlocked = 0;
    let totalNet = 0;
    
    console.log('Warehouse-wise stock:');
    for (const stock of stockRecords) {
      let warehouse = 'No Warehouse';
      if (stock.warehouseId) {
        try {
          const wh = await Warehouse.findById(stock.warehouseId);
          warehouse = wh?.name || `Unknown (${stock.warehouseId})`;
        } catch (err) {
          warehouse = `Error loading (${stock.warehouseId})`;
        }
      }
      
      totalStock += stock.stock || 0;
      totalBlocked += stock.blockedQuantity || 0;
      totalNet += stock.netStock || 0;
      
      console.log(`  ${warehouse}:`);
      console.log(`    Stock: ${stock.stock || 0}`);
      console.log(`    Blocked: ${stock.blockedQuantity || 0}`);
      console.log(`    Net Stock: ${stock.netStock || 0}`);
      console.log(`    Damaged: ${stock.damagedQuantity || 0}`);
    }
    
    console.log('\n📊 TOTALS:');
    console.log(`  Total Stock: ${totalStock}`);
    console.log(`  Total Blocked: ${totalBlocked}`);
    console.log(`  Total Net Stock: ${totalNet}`);
    
    if (totalNet < 0) {
      console.log(`  ⚠️  NEGATIVE STOCK DETECTED: ${totalNet}`);
    }

    // 3. Get ALL stock movements
    console.log('\n3️⃣ STOCK MOVEMENT HISTORY:');
    console.log('-'.repeat(80));
    const movements = await StockMovement.find({ productId: product._id })
      .sort({ createdAt: 1 })
      .lean();
    
    console.log(`Found ${movements.length} movements\n`);
    
    let runningStock = 0;
    let runningBlocked = 0;
    
    for (const [index, movement] of movements.entries()) {
      const date = new Date(movement.createdAt).toLocaleString('en-IN');
      const type = movement.type;
      const qtyIn = movement.quantityIn || 0;
      const qtyOut = movement.quantityOut || 0;
      const ref = movement.referenceNo || 'N/A';
      
      // Calculate running totals
      if (type === 'IN' || type === 'GRN') {
        runningStock += qtyIn;
      } else if (type === 'OUT' || type === 'BLOCK') {
        runningStock -= qtyOut;
        if (type === 'BLOCK') {
          runningBlocked += qtyOut;
        }
      } else if (type === 'UNBLOCK') {
        runningBlocked -= qtyOut;
      }
      
      console.log(`${index + 1}. [${date}] ${type}`);
      console.log(`   Reference: ${ref}`);
      console.log(`   Quantity In: ${qtyIn}`);
      console.log(`   Quantity Out: ${qtyOut}`);
      console.log(`   Balance After: ${movement.balanceAfter || 'N/A'}`);
      console.log(`   Running Stock: ${runningStock}`);
      console.log(`   Running Blocked: ${runningBlocked}`);
      console.log(`   Running Net: ${runningStock - runningBlocked}`);
      
      if (runningStock - runningBlocked < 0) {
        console.log(`   ⚠️  WENT NEGATIVE HERE!`);
      }
      console.log('');
    }

    // 4. Find related sales orders
    console.log('\n4️⃣ RELATED SALES ORDERS:');
    console.log('-'.repeat(80));
    const salesOrders = await SalesOrder.find({
      'products.product': product._id
    }).sort({ createdAt: 1 }).lean();
    
    console.log(`Found ${salesOrders.length} sales orders\n`);
    
    for (const order of salesOrders) {
      const productInOrder = order.products.find(p => 
        p.product.toString() === product._id.toString()
      );
      
      if (!productInOrder) continue;
      
      console.log(`Order: ${order.orderNumber}`);
      console.log(`  Date: ${new Date(order.orderDate).toLocaleString('en-IN')}`);
      console.log(`  Status: ${order.status}`);
      console.log(`  Dealer: ${order.dealerName || 'N/A'}`);
      console.log(`  Quantity: ${productInOrder.quantity}`);
      console.log(`  Warehouse: ${productInOrder.warehouse || 'Not assigned'}`);
      console.log(`  Stock Status: ${productInOrder.stockStatus || 'N/A'}`);
      
      // Check if this order has movements
      const orderMovements = movements.filter(m => 
        m.referenceNo && m.referenceNo.includes(order.orderNumber)
      );
      
      if (orderMovements.length > 0) {
        console.log(`  Movements: ${orderMovements.length}`);
        orderMovements.forEach(m => {
          console.log(`    - ${m.type}: In=${m.quantityIn || 0}, Out=${m.quantityOut || 0}`);
        });
      } else {
        console.log(`  ⚠️  NO MOVEMENTS FOUND FOR THIS ORDER!`);
      }
      console.log('');
    }

    // 5. Identify the problem
    console.log('\n5️⃣ PROBLEM ANALYSIS:');
    console.log('-'.repeat(80));
    
    // Check for orders without movements
    const ordersWithoutMovements = [];
    for (const order of salesOrders) {
      const hasMovement = movements.some(m => 
        m.referenceNo && m.referenceNo.includes(order.orderNumber)
      );
      if (!hasMovement && order.status !== 'Cancelled' && order.status !== 'Pending') {
        ordersWithoutMovements.push(order);
      }
    }
    
    if (ordersWithoutMovements.length > 0) {
      console.log('⚠️  ORDERS WITHOUT STOCK MOVEMENTS:');
      ordersWithoutMovements.forEach(order => {
        const productInOrder = order.products.find(p => 
          p.product.toString() === product._id.toString()
        );
        console.log(`  - ${order.orderNumber} (${order.status}): ${productInOrder.quantity} units`);
      });
    }
    
    // Check for duplicate movements
    const movementRefs = movements.map(m => m.referenceNo).filter(Boolean);
    const duplicates = movementRefs.filter((ref, index) => 
      movementRefs.indexOf(ref) !== index
    );
    
    if (duplicates.length > 0) {
      console.log('\n⚠️  DUPLICATE MOVEMENTS DETECTED:');
      [...new Set(duplicates)].forEach(ref => {
        const count = movementRefs.filter(r => r === ref).length;
        console.log(`  - ${ref}: ${count} times`);
      });
    }
    
    // Check for OUT movements without corresponding orders
    const outMovements = movements.filter(m => m.type === 'OUT');
    console.log(`\n📤 OUT MOVEMENTS: ${outMovements.length}`);
    for (const movement of outMovements) {
      const hasOrder = salesOrders.some(order => 
        movement.referenceNo && movement.referenceNo.includes(order.orderNumber)
      );
      if (!hasOrder) {
        console.log(`  ⚠️  OUT movement without order: ${movement.referenceNo} (${movement.quantityOut} units)`);
      }
    }
    
    // Calculate expected vs actual
    console.log('\n6️⃣ STOCK RECONCILIATION:');
    console.log('-'.repeat(80));
    
    const totalIn = movements
      .filter(m => m.type === 'IN' || m.type === 'GRN')
      .reduce((sum, m) => sum + (m.quantityIn || 0), 0);
    
    const totalOut = movements
      .filter(m => m.type === 'OUT')
      .reduce((sum, m) => sum + (m.quantityOut || 0), 0);
    
    const totalBlocks = movements
      .filter(m => m.type === 'BLOCK')
      .reduce((sum, m) => sum + (m.quantityOut || 0), 0);
    
    const totalUnblocks = movements
      .filter(m => m.type === 'UNBLOCK')
      .reduce((sum, m) => sum + (m.quantityOut || 0), 0);
    
    const expectedStock = totalIn - totalOut;
    const expectedBlocked = totalBlocks - totalUnblocks;
    const expectedNet = expectedStock - expectedBlocked;
    
    console.log('Expected (from movements):');
    console.log(`  Stock: ${expectedStock}`);
    console.log(`  Blocked: ${expectedBlocked}`);
    console.log(`  Net: ${expectedNet}`);
    
    console.log('\nActual (from Stock table):');
    console.log(`  Stock: ${totalStock}`);
    console.log(`  Blocked: ${totalBlocked}`);
    console.log(`  Net: ${totalNet}`);
    
    console.log('\nDifference:');
    console.log(`  Stock: ${totalStock - expectedStock}`);
    console.log(`  Blocked: ${totalBlocked - expectedBlocked}`);
    console.log(`  Net: ${totalNet - expectedNet}`);
    
    if (totalNet !== expectedNet) {
      console.log('\n❌ MISMATCH DETECTED!');
      console.log('The Stock table does not match the movement history.');
    }

    // 7. Recommendations
    console.log('\n7️⃣ RECOMMENDATIONS:');
    console.log('-'.repeat(80));
    
    if (totalNet < 0) {
      console.log('🔧 NEGATIVE STOCK FIX NEEDED:');
      console.log('  1. Review the OUT movements without corresponding orders');
      console.log('  2. Check if any orders were confirmed without proper stock validation');
      console.log('  3. Verify GRN entries match purchase orders');
      console.log('  4. Consider adding a manual adjustment to correct the stock');
      console.log(`  5. Required adjustment: +${Math.abs(totalNet)} units`);
    }
    
    if (ordersWithoutMovements.length > 0) {
      console.log('\n🔧 ORDERS WITHOUT MOVEMENTS:');
      console.log('  These orders may have been confirmed without creating stock movements');
      console.log('  Review the sales order confirmation logic');
    }
    
    if (duplicates.length > 0) {
      console.log('\n🔧 DUPLICATE MOVEMENTS:');
      console.log('  Remove duplicate stock movements to correct the balance');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ DEBUG COMPLETE');
    
  } catch (error) {
    console.error('❌ Error during debugging:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n📊 MongoDB connection closed');
  }
}

// Run the debug
debugNegativeStock();
