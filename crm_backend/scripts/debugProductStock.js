import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Product from '../models/Product.js';
import GRN from '../models/GRN.js';
import Warehouse from '../models/Warehouse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const debugProductStock = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get product code from command line or use default
    const productCode = process.argv[2] || '123';
    
    console.log(`\n🔍 Debugging stock for product: ${productCode}`);
    console.log('='.repeat(60));

    // Find the product
    const product = await Product.findOne({ productCode })
      .select('productCode itemName')
      .lean();

    if (!product) {
      console.log('❌ Product not found!');
      process.exit(1);
    }

    console.log(`\n📦 Product: ${product.itemName} (${product.productCode})`);
    console.log(`   Product ID: ${product._id}`);

    // Get ALL GRNs for this product
    const allGrns = await GRN.find({
      'items.productId': product._id
    })
      .populate('warehouseId', 'name code')
      .select('grnNo status items warehouseId')
      .lean();

    console.log(`\n📋 Total GRNs found: ${allGrns.length}`);
    console.log('='.repeat(60));

    // Group by status
    const grnsByStatus = {};
    let totalByStatus = {};

    allGrns.forEach(grn => {
      const status = grn.status;
      if (!grnsByStatus[status]) {
        grnsByStatus[status] = [];
        totalByStatus[status] = { accepted: 0, damaged: 0, net: 0 };
      }

      // Find items for this product
      const productItems = grn.items.filter(item => 
        item.productId.toString() === product._id.toString()
      );

      productItems.forEach(item => {
        const accepted = item.acceptedQuantity || 0;
        const damaged = item.damageQuantity || 0;
        const net = accepted - damaged;

        grnsByStatus[status].push({
          grnNo: grn.grnNo,
          warehouse: grn.warehouseId?.name || 'Unknown',
          warehouseCode: grn.warehouseId?.code || 'N/A',
          warehouseId: grn.warehouseId?._id,
          accepted,
          damaged,
          net
        });

        totalByStatus[status].accepted += accepted;
        totalByStatus[status].damaged += damaged;
        totalByStatus[status].net += net;
      });
    });

    // Display by status
    Object.keys(grnsByStatus).forEach(status => {
      console.log(`\n📊 Status: ${status}`);
      console.log('-'.repeat(60));
      grnsByStatus[status].forEach(item => {
        console.log(`   GRN: ${item.grnNo}`);
        console.log(`   Warehouse: ${item.warehouse} (${item.warehouseCode})`);
        console.log(`   Accepted: ${item.accepted}, Damaged: ${item.damaged}, Net: ${item.net}`);
        console.log('');
      });
      console.log(`   TOTAL for ${status}: Accepted=${totalByStatus[status].accepted}, Damaged=${totalByStatus[status].damaged}, Net=${totalByStatus[status].net}`);
    });

    // Calculate what the API would return
    console.log('\n🔧 API CALCULATION (status: Received or Completed):');
    console.log('='.repeat(60));
    
    const apiGrns = await GRN.find({
      'items.productId': product._id,
      status: { $in: ['Received', 'Completed'] }
    })
      .populate('warehouseId', 'name code')
      .select('grnNo status items warehouseId')
      .lean();

    console.log(`GRNs matching API query: ${apiGrns.length}`);
    
    let apiTotal = { accepted: 0, damaged: 0, net: 0 };
    const warehouseStock = {};

    apiGrns.forEach(grn => {
      const productItems = grn.items.filter(item => 
        item.productId.toString() === product._id.toString()
      );

      productItems.forEach(item => {
        const whId = grn.warehouseId?._id?.toString() || 'unknown';
        const whName = grn.warehouseId?.name || 'Unknown';
        
        if (!warehouseStock[whId]) {
          warehouseStock[whId] = {
            warehouseId: whId,
            warehouseName: whName,
            quantity: 0,
            damaged: 0,
            net: 0
          };
        }
        
        warehouseStock[whId].quantity += (item.acceptedQuantity || 0);
        warehouseStock[whId].damaged += (item.damageQuantity || 0);
        warehouseStock[whId].net = warehouseStock[whId].quantity - warehouseStock[whId].damaged;
        
        apiTotal.accepted += (item.acceptedQuantity || 0);
        apiTotal.damaged += (item.damageQuantity || 0);
      });
    });

    apiTotal.net = apiTotal.accepted - apiTotal.damaged;

    console.log(`\nAPI Total: Accepted=${apiTotal.accepted}, Damaged=${apiTotal.damaged}, Net=${apiTotal.net}`);
    
    console.log('\n📍 Stock by Warehouse (API calculation):');
    Object.values(warehouseStock).forEach(wh => {
      console.log(`   ${wh.warehouseName}: Accepted=${wh.quantity}, Damaged=${wh.damaged}, Net=${wh.net}`);
    });

    console.log('\n✅ Debug complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

debugProductStock();
