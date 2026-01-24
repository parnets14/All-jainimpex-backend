import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import PurchaseOrder from './models/PurchaseOrder.js';
import DealerPricingHistory from './models/DealerPricingHistory.js';
import Supplier from './models/Supplier.js';

dotenv.config();

const testWireBeltsAutoSyncFix = async () => {
  try {
    console.log('🔍 Testing Wire Belts Auto-Sync Fix...');
    
    // Connect to database
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');
    
    // Get a user ID for createdBy field
    const { default: User } = await import('./models/User.js');
    const systemUser = await User.findOne({ role: 'super_admin' });
    const userId = systemUser?._id || null;
    
    // 1. Find wire belts product
    const wireBeltsProduct = await Product.findOne({
      itemName: { $regex: /wire.*belt/i }
    });
    
    if (!wireBeltsProduct) {
      console.log('❌ Wire belts product not found');
      return;
    }
    
    console.log('📦 Found wire belts product:', {
      id: wireBeltsProduct._id,
      name: wireBeltsProduct.itemName,
      productCode: wireBeltsProduct.productCode,
      rateSlabs: wireBeltsProduct.rateSlabs
    });
    
    // 2. Check current dealer pricing
    let dealerPricing = await DealerPricing.findOne({
      product: wireBeltsProduct._id,
      isActive: true
    });
    
    console.log('💰 Current dealer pricing:', dealerPricing ? {
      id: dealerPricing._id,
      purchasePrice: dealerPricing.purchasePrice,
      sellingPrice: dealerPricing.sellingPrice,
      purchasePriceSource: dealerPricing.purchasePriceSource,
      lastPurchaseDate: dealerPricing.lastPurchaseDate
    } : 'No pricing record found');
    
    // 3. Check latest purchase orders for wire belts
    const latestPO = await PurchaseOrder.findOne({
      'lines.productId': wireBeltsProduct._id,
      status: { $in: ['Approved', 'Completed'] }
    })
    .sort({ orderDate: -1 })
    .populate('supplierId', 'name companyName');
    
    if (latestPO) {
      const wireBeltsLine = latestPO.lines.find(line => 
        line.productId.toString() === wireBeltsProduct._id.toString()
      );
      
      console.log('📋 Latest approved PO for wire belts:', {
        poNumber: latestPO.poNumber,
        orderDate: latestPO.orderDate,
        status: latestPO.status,
        supplier: latestPO.supplierId?.name || latestPO.supplierId?.companyName,
        wireBeltsPrice: wireBeltsLine?.price,
        wireBeltsQuantity: wireBeltsLine?.quantity
      });
    } else {
      console.log('📋 No approved purchase orders found for wire belts');
    }
    
    // 4. If no dealer pricing exists, create it using the fixed autoSyncNewProduct logic
    if (!dealerPricing) {
      console.log('🔧 Creating dealer pricing record using fixed logic...');
      
      // Get selling price from rate slabs (Product Master price)
      const sellingPrice = wireBeltsProduct.rateSlabs && wireBeltsProduct.rateSlabs.length > 0
        ? wireBeltsProduct.rateSlabs[0].rate
        : 0;
      
      if (sellingPrice <= 0) {
        console.log('❌ Product has no valid rate slab price');
        return;
      }
      
      // Create new pricing record with BOTH purchase and selling price from Product Master
      dealerPricing = new DealerPricing({
        product: wireBeltsProduct._id,
        purchasePrice: sellingPrice, // Initially set to same as selling price from Product Master
        sellingPrice,
        purchasePriceSource: 'product_master',
        isActive: true,
        createdBy: userId // Use system user
      });
      
      await dealerPricing.save();
      
      // Log initial price setting
      await DealerPricingHistory.logPriceChange({
        product: wireBeltsProduct._id,
        oldPrice: 0,
        newPrice: sellingPrice,
        changeType: 'manual',
        changeMethod: 'direct_update',
        reason: 'Auto-created pricing record for wire belts from Product Master (fix applied)',
        changedBy: userId
      });
      
      console.log('✅ Created dealer pricing record:', {
        purchasePrice: dealerPricing.purchasePrice,
        sellingPrice: dealerPricing.sellingPrice,
        source: dealerPricing.purchasePriceSource
      });
    }
    
    // 5. If there's a latest PO, update the purchase price
    if (latestPO && dealerPricing) {
      const wireBeltsLine = latestPO.lines.find(line => 
        line.productId.toString() === wireBeltsProduct._id.toString()
      );
      
      if (wireBeltsLine && wireBeltsLine.price > 0) {
        console.log('🔧 Updating purchase price from latest PO...');
        
        const oldPurchasePrice = dealerPricing.purchasePrice;
        dealerPricing.purchasePrice = wireBeltsLine.price;
        dealerPricing.lastPurchaseDate = latestPO.orderDate;
        dealerPricing.lastPurchaseSupplier = latestPO.supplierId;
        dealerPricing.purchasePriceSource = 'purchase_order';
        await dealerPricing.save();
        
        // Log price change
        await DealerPricingHistory.logPriceChange({
          product: wireBeltsProduct._id,
          oldPrice: dealerPricing.sellingPrice,
          newPrice: dealerPricing.sellingPrice,
          changeType: 'manual',
          changeMethod: 'direct_update',
          reason: `Purchase price auto-updated from approved PO: ${latestPO.poNumber} (fix applied)`,
          changedBy: userId
        });
        
        console.log('✅ Updated purchase price:', {
          oldPrice: oldPurchasePrice,
          newPrice: wireBeltsLine.price,
          sellingPrice: dealerPricing.sellingPrice,
          source: dealerPricing.purchasePriceSource
        });
      }
    }
    
    // 6. Final verification
    const finalPricing = await DealerPricing.findOne({
      product: wireBeltsProduct._id,
      isActive: true
    }).populate('lastPurchaseSupplier', 'name companyName');
    
    console.log('🎉 Final wire belts pricing:', {
      purchasePrice: finalPricing.purchasePrice,
      sellingPrice: finalPricing.sellingPrice,
      purchasePriceSource: finalPricing.purchasePriceSource,
      lastPurchaseDate: finalPricing.lastPurchaseDate,
      lastPurchaseSupplier: finalPricing.lastPurchaseSupplier?.name || finalPricing.lastPurchaseSupplier?.companyName
    });
    
    // 7. Check price history
    const priceHistory = await DealerPricingHistory.find({
      product: wireBeltsProduct._id
    }).sort({ changeDate: -1 }).limit(5);
    
    console.log('📊 Recent price history:');
    priceHistory.forEach((history, index) => {
      console.log(`  ${index + 1}. ${history.changeDate.toISOString().split('T')[0]} - ${history.changeType}: Purchase ₹${history.oldPurchasePrice} → ₹${history.newPurchasePrice}, Selling ₹${history.oldSellingPrice} → ₹${history.newSellingPrice} (${history.reason})`);
    });
    
    console.log('✅ Wire belts auto-sync fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error in wire belts auto-sync fix:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from database');
  }
};

testWireBeltsAutoSyncFix();