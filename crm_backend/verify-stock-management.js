import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import StockMovement from './models/Stock.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import Dealer from './models/Dealer.js';

dotenv.config();

const verifyStockManagement = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 STOCK MANAGEMENT VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    // 1. Check recent orders (last 4 created)
    console.log('1️⃣ RECENT ORDERS CHECK');
    console.log('───────────────────────────────────────────────────────────\n');

    const recentOrders = await SalesOrder.find()
      .sort({ createdAt: -1 })
      .limit(4)
      .populate('dealer', 'name')
      .populate('products.product', 'itemName productCode')
      .populate('products.warehouse', 'name')
      .lean();

    console.log(`Found ${recentOrders.length} recent orders:\n`);

    recentOrders.forEach((order, index) => {
      console.log(`📦 Order ${index + 1}: ${order.orderNumber}`);
      console.log(`   Dealer: ${order.dealer?.name || order.dealerName}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Sales Type: ${order.salesType || 'Not set'}`);
      console.log(`   Is Out of Stock: ${order.isOutOfStock ? 'YES ✅' : 'NO'}`);
      console.log(`   Created: ${new Date(order.createdAt).toLocaleString()}`);
      console.log(`   Remarks: ${order.remarks || 'None'}`);
      console.log(`   Products: ${order.products.length}`);
      
      order.products.forEach((product, pIndex) => {
        console.log(`      ${pIndex + 1}. ${product.productName} (${product.productCode})`);
        console.log(`         Quantity: ${product.quantity}`);
        console.log(`         Warehouse: ${product.warehouseName || 'Not set'}`);
        console.log(`         Warehouse ID: ${product.warehouse || 'None'}`);
      });
      console.log();
    });

    // 2. Check Pending Quantities
    console.log('\n2️⃣ PENDING QUANTITIES CHECK');
    console.log('───────────────────────────────────────────────────────────\n');

    const outOfStockOrders = await SalesOrder.find({
      isOutOfStock: true,
      status: 'Pending'
    })
      .populate('dealer', 'name')
      .populate('products.product', 'itemName productCode')
      .lean();

    console.log(`Found ${outOfStockOrders.length} out-of-stock pending orders\n`);

    // Aggregate pending quantities
    const pendingQuantities = {};
    
    outOfStockOrders.forEach(order => {
      console.log(`📋 Order: ${order.orderNumber} (${order.dealer?.name || order.dealerName})`);
      
      order.products.forEach(product => {
        const productKey = `${product.product._id}-${product.warehouse}`;
        
        if (!pendingQuantities[productKey]) {
          pendingQuantities[productKey] = {
            productId: product.product._id,
            productName: product.product.itemName,
            productCode: product.product.productCode,
            warehouseId: product.warehouse,
            warehouseName: product.warehouseName,
            totalPendingQuantity: 0,
            orders: []
          };
        }
        
        pendingQuantities[productKey].totalPendingQuantity += product.quantity;
        pendingQuantities[productKey].orders.push({
          orderNumber: order.orderNumber,
          quantity: product.quantity
        });
        
        console.log(`   - ${product.productName}: ${product.quantity} units (Warehouse: ${product.warehouseName})`);
      });
      console.log();
    });

    const pendingQuantitiesArray = Object.values(pendingQuantities);
    console.log(`\n📊 AGGREGATED PENDING QUANTITIES: ${pendingQuantitiesArray.length} products\n`);
    
    pendingQuantitiesArray.forEach(item => {
      console.log(`   ${item.productName} (${item.productCode})`);
      console.log(`   Warehouse: ${item.warehouseName}`);
      console.log(`   Total Pending: ${item.totalPendingQuantity} units`);
      console.log(`   From ${item.orders.length} order(s):`);
      item.orders.forEach(order => {
        console.log(`      - ${order.orderNumber}: ${order.quantity} units`);
      });
      console.log();
    });

    // 3. Check Blocked Quantities
    console.log('\n3️⃣ BLOCKED QUANTITIES CHECK');
    console.log('───────────────────────────────────────────────────────────\n');

    const confirmedOrders = await SalesOrder.find({
      status: 'Confirmed',
      isOutOfStock: false
    })
      .populate('products.product', 'itemName productCode')
      .lean();

    console.log(`Found ${confirmedOrders.length} confirmed orders\n`);

    const blockedQuantities = {};

    confirmedOrders.forEach(order => {
      console.log(`📦 Confirmed Order: ${order.orderNumber}`);
      
      order.products.forEach(product => {
        if (product.warehouse) {
          const productKey = `${product.product._id}-${product.warehouse}`;
          
          if (!blockedQuantities[productKey]) {
            blockedQuantities[productKey] = {
              productName: product.productName,
              productCode: product.productCode,
              warehouseId: product.warehouse,
              warehouseName: product.warehouseName,
              totalBlockedQuantity: 0,
              orders: []
            };
          }
          
          blockedQuantities[productKey].totalBlockedQuantity += product.quantity;
          blockedQuantities[productKey].orders.push({
            orderNumber: order.orderNumber,
            quantity: product.quantity
          });
          
          console.log(`   - ${product.productName}: ${product.quantity} units blocked (Warehouse: ${product.warehouseName})`);
        }
      });
      console.log();
    });

    const blockedQuantitiesArray = Object.values(blockedQuantities);
    console.log(`\n📊 AGGREGATED BLOCKED QUANTITIES: ${blockedQuantitiesArray.length} products\n`);
    
    blockedQuantitiesArray.forEach(item => {
      console.log(`   ${item.productName} (${item.productCode})`);
      console.log(`   Warehouse: ${item.warehouseName}`);
      console.log(`   Total Blocked: ${item.totalBlockedQuantity} units`);
      console.log(`   From ${item.orders.length} order(s):`);
      item.orders.forEach(order => {
        console.log(`      - ${order.orderNumber}: ${order.quantity} units`);
      });
      console.log();
    });

    // 4. Check Stock Movements
    console.log('\n4️⃣ STOCK MOVEMENTS CHECK (Recent 10)');
    console.log('───────────────────────────────────────────────────────────\n');

    const recentMovements = await StockMovement.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('productId', 'itemName productCode')
      .populate('warehouseId', 'name')
      .lean();

    console.log(`Found ${recentMovements.length} recent stock movements:\n`);

    recentMovements.forEach((movement, index) => {
      console.log(`${index + 1}. ${movement.productId?.itemName || 'Unknown'} (${movement.productId?.productCode || 'N/A'})`);
      console.log(`   Type: ${movement.type} (${movement.referenceType || 'N/A'})`);
      console.log(`   Quantity: ${movement.quantity}`);
      console.log(`   Balance: ${movement.balance}`);
      console.log(`   Warehouse: ${movement.warehouseId?.name || 'Unknown'}`);
      console.log(`   Reference: ${movement.referenceNo || 'N/A'}`);
      console.log(`   Date: ${new Date(movement.date).toLocaleString()}`);
      console.log(`   Remarks: ${movement.remarks || 'None'}`);
      console.log();
    });

    // 5. Verify Stock Calculations
    console.log('\n5️⃣ STOCK CALCULATIONS VERIFICATION');
    console.log('───────────────────────────────────────────────────────────\n');

    // Get a sample product with stock
    const sampleProduct = recentOrders[0]?.products[0];
    
    if (sampleProduct && sampleProduct.product) {
      const productId = sampleProduct.product._id;
      const warehouseId = sampleProduct.warehouse;
      
      console.log(`Checking: ${sampleProduct.productName} (${sampleProduct.productCode})`);
      console.log(`Warehouse: ${sampleProduct.warehouseName}\n`);

      // Get all movements for this product-warehouse
      const movements = await StockMovement.find({
        productId: productId,
        warehouseId: warehouseId
      }).sort({ date: 1, createdAt: 1 }).lean();

      console.log(`Total movements: ${movements.length}\n`);

      let currentStock = 0;
      let blockedQty = 0;

      movements.forEach((movement, index) => {
        if (movement.type === 'IN') {
          currentStock += movement.quantity;
        } else if (movement.type === 'OUT') {
          currentStock -= movement.quantity;
          
          // Check if this is a blocking movement (from sales order)
          if (movement.referenceType === 'SALE' && movement.remarks?.includes('Blocked')) {
            blockedQty += movement.quantity;
          }
        }
        
        console.log(`   ${index + 1}. ${movement.type} - ${movement.quantity} units`);
        console.log(`      Balance: ${movement.balance} (Calculated: ${currentStock})`);
        console.log(`      Reference: ${movement.referenceNo}`);
        console.log(`      Remarks: ${movement.remarks || 'None'}`);
      });

      console.log(`\n📊 Final Calculations:`);
      console.log(`   Current Stock: ${currentStock}`);
      console.log(`   Blocked Quantity: ${blockedQty}`);
      console.log(`   Net Available: ${currentStock - blockedQty}`);

      // Check pending quantity for this product
      const pendingKey = `${productId}-${warehouseId}`;
      const pending = pendingQuantities[pendingKey];
      
      if (pending) {
        console.log(`   Pending Quantity: ${pending.totalPendingQuantity} ✅`);
      } else {
        console.log(`   Pending Quantity: 0`);
      }
    }

    // 6. Summary
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('📋 VERIFICATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Recent Orders: ${recentOrders.length}`);
    console.log(`   - In-Stock Orders: ${recentOrders.filter(o => !o.isOutOfStock).length}`);
    console.log(`   - Out-of-Stock Orders: ${recentOrders.filter(o => o.isOutOfStock).length}`);
    console.log(`   - Regular Sales: ${recentOrders.filter(o => o.salesType === 'Regular Sale').length}`);
    console.log(`   - CD Sales: ${recentOrders.filter(o => o.salesType === 'CD Sales').length}`);
    
    console.log(`\n✅ Pending Quantities: ${pendingQuantitiesArray.length} products`);
    console.log(`   Total Pending: ${pendingQuantitiesArray.reduce((sum, item) => sum + item.totalPendingQuantity, 0)} units`);
    
    console.log(`\n✅ Blocked Quantities: ${blockedQuantitiesArray.length} products`);
    console.log(`   Total Blocked: ${blockedQuantitiesArray.reduce((sum, item) => sum + item.totalBlockedQuantity, 0)} units`);
    
    console.log(`\n✅ Stock Movements: ${recentMovements.length} recent movements`);
    console.log(`   - IN movements: ${recentMovements.filter(m => m.type === 'IN').length}`);
    console.log(`   - OUT movements: ${recentMovements.filter(m => m.type === 'OUT').length}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ VERIFICATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
};

verifyStockManagement();
