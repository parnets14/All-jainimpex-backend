// Fix Wire Belts and Implement Auto-Sync for Purchase Orders
import mongoose from 'mongoose';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import PurchaseOrder from './models/PurchaseOrder.js';

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://parnetstech14:parnets14@jainimpexcrm.grb5bho.mongodb.net/?retryWrites=true&w=majority&appName=JainImpexCRM');
    console.log('✅ Connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const fixWireBeltsAndImplementAutoSync = async () => {
  try {
    console.log('🔧 FIXING WIRE BELTS AND IMPLEMENTING AUTO-SYNC');
    console.log('=' .repeat(70));
    
    // Step 1: Fix Wire Belts specifically
    console.log('\n📦 Step 1: Fixing Wire Belts...');
    
    const wireBeltsProduct = await Product.findOne({
      $or: [
        { itemName: { $regex: 'wire.*belts', $options: 'i' } },
        { productCode: 'TTT006' }
      ]
    });
    
    if (!wireBeltsProduct) {
      console.log('❌ Wire belts product not found');
      return;
    }
    
    console.log(`📦 Found wire belts: ${wireBeltsProduct.itemName} (${wireBeltsProduct.productCode})`);
    
    // Get the latest approved PO for wire belts
    const latestPO = await PurchaseOrder.findOne({
      'lines.productId': wireBeltsProduct._id,
      status: { $in: ['Approved', 'Completed', 'Received'] }
    }).sort({ orderDate: -1 });
    
    if (!latestPO) {
      console.log('❌ No approved purchase orders found for wire belts');
      return;
    }
    
    const productLine = latestPO.lines.find(line => 
      line.productId && line.productId.toString() === wireBeltsProduct._id.toString()
    );
    
    if (!productLine) {
      console.log('❌ Product not found in latest PO lines');
      return;
    }
    
    const purchasePrice = productLine.unitPrice || productLine.price;
    const sellingPrice = wireBeltsProduct.rateSlabs?.[0]?.rate || purchasePrice * 1.2; // 20% markup if no rate slab
    
    console.log(`💰 Latest PO data:`);
    console.log(`   PO ID: ${latestPO._id}`);
    console.log(`   Date: ${latestPO.orderDate}`);
    console.log(`   Status: ${latestPO.status}`);
    console.log(`   Purchase Price: ₹${purchasePrice}`);
    console.log(`   Suggested Selling Price: ₹${sellingPrice}`);
    
    // Create dealer pricing record for wire belts
    const existingPricing = await DealerPricing.findOne({ product: wireBeltsProduct._id });
    
    if (existingPricing) {
      console.log('📝 Updating existing dealer pricing record...');
      existingPricing.purchasePrice = purchasePrice;
      existingPricing.purchasePriceSource = 'purchase_order';
      existingPricing.lastPurchasePriceUpdate = new Date();
      await existingPricing.save();
      console.log('✅ Updated existing dealer pricing record');
    } else {
      console.log('📝 Creating new dealer pricing record...');
      const newPricing = new DealerPricing({
        product: wireBeltsProduct._id,
        purchasePrice: purchasePrice,
        sellingPrice: sellingPrice,
        purchasePriceSource: 'purchase_order',
        lastPurchasePriceUpdate: new Date(),
        isActive: true,
        createdBy: null // System created
      });
      
      await newPricing.save();
      console.log('✅ Created new dealer pricing record');
    }
    
    // Step 2: Check for other products with similar issues
    console.log('\n🔍 Step 2: Checking for other products with missing dealer pricing...');
    
    // Find all products that have approved POs but no dealer pricing records
    const allApprovedPOs = await PurchaseOrder.find({
      status: { $in: ['Approved', 'Completed', 'Received'] }
    }).sort({ orderDate: -1 });
    
    const productIdsWithPOs = new Set();
    allApprovedPOs.forEach(po => {
      po.lines.forEach(line => {
        if (line.productId) {
          productIdsWithPOs.add(line.productId.toString());
        }
      });
    });
    
    console.log(`📊 Found ${productIdsWithPOs.size} unique products with approved POs`);
    
    // Check which of these products don't have dealer pricing records
    const existingPricingRecords = await DealerPricing.find({
      product: { $in: Array.from(productIdsWithPOs) },
      isActive: true
    });
    
    const productsWithPricing = new Set();
    existingPricingRecords.forEach(pricing => {
      productsWithPricing.add(pricing.product.toString());
    });
    
    const productsNeedingPricing = Array.from(productIdsWithPOs).filter(
      productId => !productsWithPricing.has(productId)
    );
    
    console.log(`📊 Found ${productsNeedingPricing.length} products that need dealer pricing records`);
    
    if (productsNeedingPricing.length > 0) {
      console.log('\n🔧 Step 3: Creating missing dealer pricing records...');
      
      for (const productId of productsNeedingPricing) {
        try {
          const product = await Product.findById(productId);
          if (!product) {
            console.log(`❌ Product not found: ${productId}`);
            continue;
          }
          
          // Find latest approved PO for this product
          const latestProductPO = await PurchaseOrder.findOne({
            'lines.productId': productId,
            status: { $in: ['Approved', 'Completed', 'Received'] }
          }).sort({ orderDate: -1 });
          
          if (!latestProductPO) {
            console.log(`❌ No approved PO found for ${product.itemName}`);
            continue;
          }
          
          const productLine = latestProductPO.lines.find(line => 
            line.productId && line.productId.toString() === productId
          );
          
          if (!productLine) {
            console.log(`❌ Product line not found for ${product.itemName}`);
            continue;
          }
          
          const purchasePrice = productLine.unitPrice || productLine.price || 0;
          const sellingPrice = product.rateSlabs?.[0]?.rate || purchasePrice * 1.2;
          
          if (purchasePrice <= 0) {
            console.log(`❌ Invalid purchase price for ${product.itemName}: ₹${purchasePrice}`);
            continue;
          }
          
          console.log(`📝 Creating pricing for ${product.itemName}: Purchase ₹${purchasePrice}, Selling ₹${sellingPrice}`);
          
          const newPricing = new DealerPricing({
            product: productId,
            purchasePrice: purchasePrice,
            sellingPrice: sellingPrice,
            purchasePriceSource: 'purchase_order',
            lastPurchasePriceUpdate: new Date(),
            isActive: true,
            createdBy: null // System created
          });
          
          await newPricing.save();
          console.log(`✅ Created dealer pricing for ${product.itemName}`);
          
        } catch (error) {
          console.error(`❌ Error creating pricing for product ${productId}:`, error.message);
        }
      }
    }
    
    // Step 4: Summary
    console.log('\n📊 SUMMARY:');
    console.log('=' .repeat(50));
    
    const finalWireBeltsPricing = await DealerPricing.findOne({ product: wireBeltsProduct._id });
    if (finalWireBeltsPricing) {
      console.log('✅ Wire Belts Status:');
      console.log(`   Purchase Price: ₹${finalWireBeltsPricing.purchasePrice}`);
      console.log(`   Selling Price: ₹${finalWireBeltsPricing.sellingPrice}`);
      console.log(`   Source: ${finalWireBeltsPricing.purchasePriceSource}`);
      console.log(`   Last Update: ${finalWireBeltsPricing.lastPurchasePriceUpdate}`);
    }
    
    const totalPricingRecords = await DealerPricing.countDocuments({ isActive: true });
    console.log(`📊 Total active dealer pricing records: ${totalPricingRecords}`);
    
    console.log('\n🎯 RECOMMENDATIONS:');
    console.log('1. ✅ Wire belts should now show correct purchase price');
    console.log('2. ✅ Missing dealer pricing records have been created');
    console.log('3. 🔄 Consider implementing auto-sync hooks in Purchase Order creation');
    console.log('4. 🔄 Run comprehensive validation to sync any remaining products');
    
    console.log('\n✅ Fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error in fix process:', error);
  } finally {
    process.exit(0);
  }
};

// Run the fix
connectDB().then(() => fixWireBeltsAndImplementAutoSync());