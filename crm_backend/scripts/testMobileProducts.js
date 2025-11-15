import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import StockMovement from '../models/Stock.js';
import Warehouse from '../models/Warehouse.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import StockMovementService from '../services/stockMovementService.js';

dotenv.config();

async function testMobileProducts() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Simulate the mobile app's getProducts logic
    console.log('📱 Testing Mobile App Product Fetch Logic\n');
    console.log('='.repeat(60));

    const products = await Product.find({ status: 'active' })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .select('productCode itemName HSNCode unit gst brand category subcategory minStockLevel')
      .sort({ itemName: 1 })
      .limit(5)
      .lean();

    console.log(`\n📦 Found ${products.length} active products (showing first 5)\n`);

    for (const product of products) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`Product: ${product.itemName} (${product.productCode})`);
      console.log(`Brand: ${product.brand?.name || 'N/A'}`);
      console.log(`Category: ${product.category?.name || 'N/A'}`);

      // Get all warehouses that have stock for this product
      const stockMovements = await StockMovement.find({
        productId: product._id
      }).distinct('warehouseId');

      console.log(`\n🏭 Warehouses with stock movements: ${stockMovements.length}`);

      const warehouseStock = [];
      let totalStock = 0;

      for (const whId of stockMovements) {
        // Get warehouse details (don't filter by isActive - match web CRM)
        const warehouse = await Warehouse.findById(whId).select('name isActive status');
        if (!warehouse) {
          console.log(`  ⚠️  Warehouse ${whId} not found`);
          continue;
        }

        // Get current stock from StockMovementService
        const currentStock = await StockMovementService.getCurrentStock(product._id, whId);
        
        // Calculate blocked stock
        const blockedMovements = await StockMovement.find({
          productId: product._id,
          warehouseId: whId,
          type: 'OUT',
          referenceType: 'SALE'
        });
        
        const unblockedMovements = await StockMovement.find({
          productId: product._id,
          warehouseId: whId,
          type: 'IN',
          referenceType: 'SALE',
          remarks: { $regex: /Stock Unblocked/ }
        });
        
        let blockedQty = 0;
        blockedMovements.forEach(movement => {
          blockedQty += movement.quantity;
        });
        
        unblockedMovements.forEach(movement => {
          blockedQty -= movement.quantity;
        });
        
        blockedQty = Math.max(0, blockedQty);
        const netStock = currentStock - blockedQty;

        if (netStock > 0) {
          warehouseStock.push({
            warehouseId: whId.toString(),
            warehouseName: warehouse.name,
            quantity: currentStock,
            blocked: blockedQty,
            net: netStock,
            isActive: warehouse.isActive,
            status: warehouse.status
          });
          
          totalStock += netStock;
        }
      }

      console.log(`\n📊 Stock Summary:`);
      console.log(`  Total Net Stock: ${totalStock}`);
      console.log(`  Warehouses with stock: ${warehouseStock.length}`);
      
      if (warehouseStock.length > 0) {
        console.log(`\n  Warehouse Details:`);
        warehouseStock.forEach(wh => {
          const activeStatus = wh.isActive ? '✅ Active' : '⚠️  Inactive';
          console.log(`    - ${wh.warehouseName}: ${wh.net} units (${activeStatus}, ${wh.status})`);
          console.log(`      Current: ${wh.quantity}, Blocked: ${wh.blocked}, Net: ${wh.net}`);
        });
      }

      const isOutOfStock = totalStock <= 0;
      const isLowStock = !isOutOfStock && product.minStockLevel && totalStock <= product.minStockLevel;
      
      console.log(`\n  Status: ${isOutOfStock ? '❌ OUT OF STOCK' : isLowStock ? '⚠️  LOW STOCK' : '✅ IN STOCK'}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('\n✅ Mobile app will now show products from ALL warehouses with stock');
    console.log('   (including inactive warehouses, matching web CRM behavior)\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

testMobileProducts();
