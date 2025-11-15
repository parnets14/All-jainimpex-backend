import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import StockMovement from '../models/Stock.js';
import Warehouse from '../models/Warehouse.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import StockMovementService from '../services/stockMovementService.js';

dotenv.config();

async function checkProductStock() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get a sample product
    const product = await Product.findOne({ status: 'active' })
      .populate('brand category')
      .lean();
    
    if (!product) {
      console.log('❌ No active products found');
      return;
    }

    console.log('\n📦 Sample Product:', {
      id: product._id,
      name: product.itemName,
      code: product.productCode,
      brand: product.brand?.name,
      category: product.category?.name
    });

    // Check stock movements for this product
    const movements = await StockMovement.find({ productId: product._id })
      .populate('warehouseId', 'name')
      .sort({ date: 1 })
      .lean();

    console.log(`\n📊 Stock Movements: ${movements.length} found`);
    
    if (movements.length > 0) {
      console.log('\nFirst 5 movements:');
      movements.slice(0, 5).forEach((m, i) => {
        console.log(`${i + 1}. ${m.type} - Qty: ${m.quantity} - Warehouse: ${m.warehouseId?.name || 'Unknown'} - Date: ${m.date}`);
      });
    }

    // Get unique warehouses
    const warehouseIds = [...new Set(movements.map(m => m.warehouseId?._id?.toString()).filter(Boolean))];
    console.log(`\n🏭 Warehouses with stock: ${warehouseIds.length}`);

    // Check stock for each warehouse
    for (const whId of warehouseIds) {
      const warehouse = await Warehouse.findById(whId).select('name');
      if (!warehouse) continue;

      const currentStock = await StockMovementService.getCurrentStock(product._id, whId);
      
      console.log(`\n  ${warehouse.name}:`);
      console.log(`    Current Stock: ${currentStock}`);
    }

    // Check all warehouses
    console.log('\n\n🏭 All Active Warehouses:');
    const allWarehouses = await Warehouse.find({ isActive: true, status: 'active' })
      .select('name code')
      .lean();
    
    console.log(`Total: ${allWarehouses.length}`);
    allWarehouses.forEach((wh, i) => {
      console.log(`${i + 1}. ${wh.name} (${wh.code})`);
    });

    // Check total products
    const totalProducts = await Product.countDocuments({ status: 'active' });
    console.log(`\n📦 Total Active Products: ${totalProducts}`);

    // Check products with stock movements
    const productsWithStock = await StockMovement.distinct('productId');
    console.log(`📦 Products with Stock Movements: ${productsWithStock.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkProductStock();
