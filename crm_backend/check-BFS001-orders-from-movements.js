import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';

dotenv.config();

const checkBFS001OrdersFromMovements = async () => {
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

    const warehouseId = new mongoose.Types.ObjectId('68e8f0283f5fd5a817866df6');

    console.log(`Product ID: ${product._id}`);
    console.log(`Warehouse ID: ${warehouseId}\n`);

    // Get all SALE movements for BFS001
    console.log('📋 SALE MOVEMENTS FOR BFS001:');
    console.log('='.repeat(80));
    
    const saleMovements = await StockMovement.find({
      productId: product._id,
      warehouseId: warehouseId,
      referenceType: 'SALE'
    }).sort({ date: 1 }).lean();

    console.log(`Found ${saleMovements.length} SALE movements:\n`);
    
    const orderNumbers = new Set();
    saleMovements.forEach((mov, index) => {
      console.log(`${index + 1}. [${mov.date.toISOString().split('T')[0]}] ${mov.type} ${mov.quantity} units`);
      console.log(`   Reference: ${mov.referenceNo}`);
      console.log(`   Remarks: ${mov.remarks}`);
      console.log('');
      orderNumbers.add(mov.referenceNo);
    });

    // Check if these orders exist in the database
    console.log('\n🔍 CHECKING IF THESE ORDERS EXIST:');
    console.log('='.repeat(80));
    
    for (const orderNo of orderNumbers) {
      const order = await SalesOrder.findOne({ salesOrderNo: orderNo })
        .populate('dealerId', 'name')
        .lean();
      
      if (order) {
        console.log(`✅ ${orderNo} EXISTS`);
        console.log(`   Status: ${order.status}`);
        console.log(`   isOutOfStock: ${order.isOutOfStock || false}`);
        console.log(`   Dealer: ${order.dealerId?.name || 'N/A'}`);
        
        // Check if BFS001 is in the products array
        const hasBFS001 = order.products.some(p => {
          const prodId = p.productId || p.product;
          return prodId && prodId.toString() === product._id.toString();
        });
        
        console.log(`   Has BFS001 in products: ${hasBFS001}`);
        
        if (!hasBFS001) {
          console.log(`   ⚠️  Order exists but BFS001 not found in products array!`);
          console.log(`   Products in order:`, order.products.map(p => ({
            productId: p.productId || p.product,
            quantity: p.quantity
          })));
        }
      } else {
        console.log(`❌ ${orderNo} NOT FOUND`);
      }
      console.log('');
    }

    // Check the SalesOrder schema to see what field name is used
    console.log('\n🔍 CHECKING SALESORDER SCHEMA:');
    console.log('='.repeat(80));
    
    const sampleOrder = await SalesOrder.findOne().lean();
    if (sampleOrder && sampleOrder.products && sampleOrder.products.length > 0) {
      console.log('Sample product structure in SalesOrder:');
      console.log(JSON.stringify(sampleOrder.products[0], null, 2));
    }

    console.log('\n✅ Analysis complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkBFS001OrdersFromMovements();
