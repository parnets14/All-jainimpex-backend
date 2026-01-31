import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';
import Stock from './models/Stock.js';

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const debugPendingQuantities = async () => {
  try {
    console.log('🔍 Debugging Pending Quantities Issue...\n');

    // 1. Check all sales orders
    console.log('1️⃣ Checking all sales orders...');
    const allOrders = await SalesOrder.find().lean();
    console.log(`📊 Total sales orders: ${allOrders.length}`);

    // 2. Check out-of-stock orders specifically
    console.log('\n2️⃣ Checking out-of-stock orders...');
    const outOfStockOrders = await SalesOrder.find({ 
      isOutOfStock: true 
    }).lean();
    console.log(`🚨 Out-of-stock orders: ${outOfStockOrders.length}`);
    
    outOfStockOrders.forEach(order => {
      console.log(`   - Order: ${order.orderNumber}, Status: ${order.status}, isOutOfStock: ${order.isOutOfStock}`);
      console.log(`     Products: ${order.products?.length || 0}`);
      order.products?.forEach(product => {
        console.log(`       * ${product.productName}: ${product.quantity} units, Warehouse: ${product.warehouseName || product.warehouse || 'null'}`);
      });
    });

    // 3. Check pending orders (status = Pending)
    console.log('\n3️⃣ Checking pending orders...');
    const pendingOrders = await SalesOrder.find({ 
      status: "Pending" 
    }).lean();
    console.log(`⏳ Pending orders: ${pendingOrders.length}`);
    
    pendingOrders.forEach(order => {
      console.log(`   - Order: ${order.orderNumber}, isOutOfStock: ${order.isOutOfStock || false}`);
    });

    // 4. Check orders that match the getPendingQuantities query
    console.log('\n4️⃣ Checking orders matching getPendingQuantities query...');
    const query = {
      isOutOfStock: true,
      status: "Pending"
    };
    
    const matchingOrders = await SalesOrder.find(query)
      .populate("dealer", "name")
      .populate("products.product", "itemName productCode")
      .populate("products.warehouse", "name")
      .lean();
    
    console.log(`🎯 Orders matching query: ${matchingOrders.length}`);
    
    if (matchingOrders.length === 0) {
      console.log('❌ No orders match the query! This is why pending quantities are 0.');
      console.log('🔍 Let\'s check what\'s wrong...');
      
      // Check if there are any orders with isOutOfStock but different status
      const outOfStockAnyStatus = await SalesOrder.find({ isOutOfStock: true }).lean();
      console.log(`📊 Out-of-stock orders (any status): ${outOfStockAnyStatus.length}`);
      
      outOfStockAnyStatus.forEach(order => {
        console.log(`   - ${order.orderNumber}: status="${order.status}", isOutOfStock=${order.isOutOfStock}`);
      });
      
      // Check if there are pending orders that aren't marked as out-of-stock
      const pendingNotOutOfStock = await SalesOrder.find({ 
        status: "Pending",
        $or: [
          { isOutOfStock: { $ne: true } },
          { isOutOfStock: { $exists: false } }
        ]
      }).lean();
      console.log(`📊 Pending orders not marked as out-of-stock: ${pendingNotOutOfStock.length}`);
      
    } else {
      console.log('✅ Found matching orders! Let\'s process them...');
      
      // Aggregate pending quantities
      const pendingQuantities = {};
      matchingOrders.forEach(order => {
        console.log(`\n📦 Processing order: ${order.orderNumber}`);
        order.products.forEach(product => {
          console.log(`   Product: ${product.productName || 'Unknown'}`);
          console.log(`   Product ID: ${product.product?._id || product.product}`);
          console.log(`   Warehouse: ${product.warehouse?._id || product.warehouse || 'null'}`);
          console.log(`   Quantity: ${product.quantity}`);
          
          const productId = product.product?._id || product.product;
          const warehouseId = product.warehouse?._id || product.warehouse || null;
          const productKey = `${productId}-${warehouseId}`;
          
          if (!pendingQuantities[productKey]) {
            pendingQuantities[productKey] = {
              productId: productId,
              productName: product.product?.itemName || product.productName || 'Unknown',
              productCode: product.product?.productCode || product.productCode || 'Unknown',
              warehouseId: warehouseId,
              warehouseName: product.warehouse?.name || product.warehouseName || 'No Stock',
              totalPendingQuantity: 0,
              orders: []
            };
          }
          
          pendingQuantities[productKey].totalPendingQuantity += product.quantity;
          pendingQuantities[productKey].orders.push({
            orderNumber: order.orderNumber,
            dealerName: order.dealer?.name || order.dealerName,
            quantity: product.quantity,
            orderDate: order.orderDate,
            dueDate: order.dueDate
          });
        });
      });
      
      const pendingQuantitiesArray = Object.values(pendingQuantities);
      console.log(`\n📈 Aggregated pending quantities: ${pendingQuantitiesArray.length} products`);
      
      pendingQuantitiesArray.forEach(item => {
        console.log(`   - ${item.productName} (${item.productCode}): ${item.totalPendingQuantity} units pending`);
        console.log(`     Warehouse: ${item.warehouseName}`);
        console.log(`     Key: ${item.productId}-${item.warehouseId}`);
      });
    }

    // 5. Check stock data to see if we can match
    console.log('\n5️⃣ Checking stock data for matching...');
    const stockData = await Stock.find().lean();
    console.log(`📊 Total stock entries: ${stockData.length}`);
    
    if (stockData.length > 0) {
      console.log('Sample stock entries:');
      stockData.slice(0, 3).forEach(stock => {
        console.log(`   - Product: ${stock.productId}, Warehouse: ${stock.warehouseId}, Net Stock: ${stock.netStock}`);
      });
    }

    // 6. Test the actual API endpoint logic
    console.log('\n6️⃣ Testing API endpoint logic...');
    
    // Simulate the getPendingQuantities function
    const { productId, warehouseId } = {}; // No filters
    
    const apiQuery = {
      isOutOfStock: true,
      status: "Pending"
    };

    if (productId || warehouseId) {
      apiQuery.$and = [];
      
      if (productId) {
        apiQuery.$and.push({ "products.product": productId });
      }
      
      if (warehouseId) {
        apiQuery.$and.push({ "products.warehouse": warehouseId });
      }
    }

    console.log('API Query:', JSON.stringify(apiQuery, null, 2));
    
    const apiOrders = await SalesOrder.find(apiQuery)
      .populate("dealer", "name")
      .populate("products.product", "itemName productCode")
      .populate("products.warehouse", "name")
      .lean();

    console.log(`API would return: ${apiOrders.length} orders`);

  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error('Error details:', error.stack);
  }
};

const runDebug = async () => {
  await connectDB();
  await debugPendingQuantities();
  await mongoose.disconnect();
  console.log('✅ Database disconnected');
};

// Run the debug
runDebug().catch(console.error);