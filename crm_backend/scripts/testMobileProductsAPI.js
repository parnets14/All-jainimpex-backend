import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Simulate the mobile API call
async function testMobileProductsAPI() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Import models
    const Brand = (await import('../models/Brand.js')).default;
    const Category = (await import('../models/Category.js')).default;
    const Subcategory = (await import('../models/Subcategory.js')).default;
    const Product = (await import('../models/Product.js')).default;
    const DealerPricing = (await import('../models/DealerPricing.js')).default;
    const StockMovement = (await import('../models/Stock.js')).default;
    const Warehouse = (await import('../models/Warehouse.js')).default;
    const GRN = (await import('../models/GRN.js')).default;
    const StockMovementService = (await import('../services/stockMovementService.js')).default;

    // Get the product from screenshot
    const product = await Product.findOne({ productCode: 'HTB001' })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .lean();

    if (!product) {
      console.log('Product not found');
      return;
    }

    console.log('📦 Product:', product.itemName);
    console.log('Code:', product.productCode);
    console.log('Unit:', product.unit);
    console.log('');

    // Get warehouse (south popualr)
    const warehouseId = null; // No filter - get all warehouses

    // Get pricing
    const pricing = await DealerPricing.findOne({
      product: product._id,
      isActive: true
    }).select('sellingPrice purchasePrice');

    // Get stock using same logic as mobile backend
    const stockMovements = await StockMovement.find({
      productId: product._id
    }).distinct('warehouseId');

    const warehouseStock = [];
    let totalStock = 0;

    for (const whId of stockMovements) {
      if (warehouseId && whId.toString() !== warehouseId) {
        continue;
      }

      const warehouse = await Warehouse.findById(whId).select('name');
      if (!warehouse) continue;

      // Get current stock
      const currentStock = await StockMovementService.getCurrentStock(product._id, whId);
      
      // Calculate damaged stock from GRN items
      const grns = await GRN.find({
        'items.productId': product._id,
        warehouseId: whId
      });
      
      let damagedQty = 0;
      grns.forEach(grn => {
        if (grn.items && Array.isArray(grn.items)) {
          grn.items.forEach(item => {
            const itemProductId = item.productId?._id ? item.productId._id.toString() : item.productId.toString();
            if (itemProductId === product._id.toString()) {
              damagedQty += item.damageQuantity || 0;
            }
          });
        }
      });
      
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

      const netStock = currentStock - damagedQty - blockedQty;

      if (netStock > 0 || !warehouseId) {
        warehouseStock.push({
          warehouseId: whId.toString(),
          warehouseName: warehouse.name,
          quantity: currentStock,
          damaged: damagedQty,
          blocked: blockedQty,
          net: netStock
        });
        
        totalStock += netStock;
      }
    }

    const availableStock = warehouseId 
      ? (warehouseStock.find(w => w.warehouseId === warehouseId)?.net || 0)
      : totalStock;

    const isOutOfStock = availableStock <= 0;
    const isLowStock = !isOutOfStock && product.minStockLevel && availableStock <= product.minStockLevel;

    const result = {
      _id: product._id,
      productCode: product.productCode,
      itemName: product.itemName,
      HSNCode: product.HSNCode,
      description: product.description,
      unit: product.unit,
      gst: product.gst,
      brandName: product.brand?.name || 'N/A',
      categoryName: product.category?.name || 'N/A',
      subcategoryName: product.subcategory?.name || 'N/A',
      dealerPrice: pricing?.sellingPrice || (product.rateSlabs?.[0]?.rate || 0),
      basePrice: product.rateSlabs?.[0]?.rate || 0,
      availableStock: availableStock,
      warehouseStock: warehouseStock,
      totalStock: totalStock,
      isOutOfStock,
      isLowStock,
      minStockLevel: product.minStockLevel
    };

    console.log('📱 MOBILE API RESPONSE:');
    console.log('─'.repeat(60));
    console.log(JSON.stringify(result, null, 2));
    console.log('─'.repeat(60));
    console.log('');
    console.log('🔍 STOCK DISPLAY:');
    console.log(`Stock: ${result.availableStock} ${result.unit || 'pcs'}`);
    console.log('');
    console.log('📊 Warehouse Breakdown:');
    result.warehouseStock.forEach(ws => {
      console.log(`  ${ws.warehouseName}: ${ws.net} (current: ${ws.quantity}, damaged: ${ws.damaged}, blocked: ${ws.blocked})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testMobileProductsAPI();
