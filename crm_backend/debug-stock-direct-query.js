import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function debugStockDirect() {
  try {
    const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI;
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    
    // Query Stock collection directly
    console.log('📦 STOCK COLLECTION - Product Code: 15151663');
    console.log('='.repeat(80));
    const stocks = await db.collection('stocks').find({ 
      productCode: '15151663' 
    }).toArray();
    
    console.log(`Found ${stocks.length} stock records:\n`);
    stocks.forEach((stock, index) => {
      console.log(`${index + 1}. Stock Record:`);
      console.log(`   Product ID: ${stock.productId}`);
      console.log(`   Product Code: ${stock.productCode}`);
      console.log(`   Warehouse ID: ${stock.warehouseId}`);
      console.log(`   Stock: ${stock.stock}`);
      console.log(`   Blocked Quantity: ${stock.blockedQuantity}`);
      console.log(`   Net Stock: ${stock.netStock}`);
      console.log(`   Damaged Quantity: ${stock.damagedQuantity || 0}`);
      console.log(`   Created: ${stock.createdAt}`);
      console.log(`   Updated: ${stock.updatedAt}`);
      console.log('');
    });

    // Query StockMovements directly
    console.log('\n📊 STOCK MOVEMENTS - Product Code: 15151663');
    console.log('='.repeat(80));
    
    // First find the product ID
    const product = await db.collection('products').findOne({ productCode: '15151663' });
    if (!product) {
      console.log('❌ Product not found');
      return;
    }
    
    console.log(`Product ID: ${product._id}\n`);
    
    const movements = await db.collection('stockmovements').find({
      productId: product._id
    }).sort({ createdAt: 1 }).toArray();
    
    console.log(`Found ${movements.length} movements:\n`);
    movements.forEach((movement, index) => {
      console.log(`${index + 1}. Movement:`);
      console.log(`   Type: ${movement.type}`);
      console.log(`   Quantity: ${movement.quantity}`);
      console.log(`   Balance: ${movement.balance}`);
      console.log(`   Reference: ${movement.referenceNo}`);
      console.log(`   Reference Type: ${movement.referenceType}`);
      console.log(`   Date: ${movement.date}`);
      console.log(`   Created: ${movement.createdAt}`);
      console.log('');
    });

    // Query Sales Orders directly
    console.log('\n📋 SALES ORDERS - Product Code: 15151663');
    console.log('='.repeat(80));
    const salesOrders = await db.collection('salesorders').find({
      'products.product': product._id
    }).sort({ createdAt: 1 }).toArray();
    
    console.log(`Found ${salesOrders.length} sales orders:\n`);
    salesOrders.forEach((order, index) => {
      const productInOrder = order.products.find(p => 
        p.product.toString() === product._id.toString()
      );
      
      console.log(`${index + 1}. Order: ${order.orderNumber}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Dealer: ${order.dealerName}`);
      console.log(`   Order Date: ${order.orderDate}`);
      console.log(`   Product Quantity: ${productInOrder.quantity}`);
      console.log(`   Product Warehouse: ${productInOrder.warehouse}`);
      console.log(`   Product Stock Status: ${productInOrder.stockStatus || 'N/A'}`);
      console.log(`   Created: ${order.createdAt}`);
      console.log('');
    });

    // Check for GRN
    console.log('\n📥 GRN RECORDS');
    console.log('='.repeat(80));
    const grns = await db.collection('grns').find({
      'products.product': product._id
    }).toArray();
    
    console.log(`Found ${grns.length} GRN records:\n`);
    grns.forEach((grn, index) => {
      const productInGRN = grn.products.find(p => 
        p.product.toString() === product._id.toString()
      );
      
      console.log(`${index + 1}. GRN: ${grn.grnNumber}`);
      console.log(`   Status: ${grn.status}`);
      console.log(`   Quantity Received: ${productInGRN.quantityReceived}`);
      console.log(`   Warehouse: ${grn.warehouseId}`);
      console.log(`   Date: ${grn.grnDate}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n📊 MongoDB connection closed');
  }
}

debugStockDirect();
