// Debug Celeb 3D Black Auto-Sync Issue
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

const debugCeleb3DBlackSync = async () => {
  try {
    console.log('🔍 DEBUGGING CELEB 3D BLACK AUTO-SYNC ISSUE');
    console.log('=' .repeat(60));
    
    // Find the product
    const product = await Product.findOne({
      $or: [
        { itemName: { $regex: 'celeb.*3d.*black', $options: 'i' } },
        { productCode: '635165165' }
      ]
    });
    
    if (!product) {
      console.log('❌ Celeb 3D Black product not found');
      return;
    }
    
    console.log('📦 PRODUCT FOUND:');
    console.log(`   ID: ${product._id}`);
    console.log(`   Name: ${product.itemName}`);
    console.log(`   Code: ${product.productCode}`);
    console.log(`   Master Price: ₹${product.rateSlabs?.[0]?.rate || 0}`);
    
    // Check current dealer pricing
    const dealerPricing = await DealerPricing.findOne({ product: product._id });
    console.log('\n💰 CURRENT DEALER PRICING:');
    if (dealerPricing) {
      console.log(`   Purchase Price: ₹${dealerPricing.purchasePrice}`);
      console.log(`   Selling Price: ₹${dealerPricing.sellingPrice}`);
      console.log(`   Source: ${dealerPricing.purchasePriceSource}`);
      console.log(`   Last Update: ${dealerPricing.lastPurchasePriceUpdate || 'Never'}`);
    } else {
      console.log('   ❌ No dealer pricing record found');
    }
    
    // Check purchase orders
    console.log('\n🛒 PURCHASE ORDERS CHECK:');
    const purchaseOrders = await PurchaseOrder.find({
      'lines.productId': product._id,
      status: { $in: ['Approved', 'Completed', 'Received'] }
    }).sort({ orderDate: -1 }).limit(5);
    
    console.log(`   Found ${purchaseOrders.length} purchase orders`);
    
    if (purchaseOrders.length === 0) {
      console.log('   ❌ No approved purchase orders found for this product');
    } else {
      purchaseOrders.forEach((po, index) => {
        const productLine = po.lines.find(line => 
          line.productId && line.productId.toString() === product._id.toString()
        );
        
        console.log(`\n   PO ${index + 1}:`);
        console.log(`     ID: ${po._id}`);
        console.log(`     Date: ${po.orderDate}`);
        console.log(`     Status: ${po.status}`);
        
        if (productLine) {
          console.log(`     Product Line Found:`);
          console.log(`       Unit Price: ₹${productLine.unitPrice || 'N/A'}`);
          console.log(`       Price: ₹${productLine.price || 'N/A'}`);
          console.log(`       Quantity: ${productLine.quantity || 'N/A'}`);
          console.log(`       Product ID Match: ${productLine.productId.toString() === product._id.toString()}`);
        } else {
          console.log(`     ❌ Product not found in PO lines`);
          console.log(`     Available product IDs in lines:`, po.lines.map(l => l.productId?.toString()).filter(Boolean));
        }
      });
    }
    
    // Check why sync didn't work
    console.log('\n🔍 SYNC ANALYSIS:');
    if (purchaseOrders.length > 0) {
      const latestPO = purchaseOrders[0];
      const productLine = latestPO.lines.find(line => 
        line.productId && line.productId.toString() === product._id.toString()
      );
      
      if (productLine) {
        const poPrice = productLine.unitPrice || productLine.price;
        if (poPrice && poPrice > 0) {
          console.log(`   ✅ Latest PO has valid price: ₹${poPrice}`);
          console.log(`   Current dealer purchase price: ₹${dealerPricing?.purchasePrice || 0}`);
          
          if (dealerPricing && Math.abs(dealerPricing.purchasePrice - poPrice) > 0.01) {
            console.log(`   🚨 SYNC ISSUE: Prices don't match!`);
            console.log(`   Expected: ₹${poPrice} (from PO)`);
            console.log(`   Actual: ₹${dealerPricing.purchasePrice} (in dealer pricing)`);
            
            // Try to manually sync now
            console.log('\n🔧 ATTEMPTING MANUAL SYNC...');
            dealerPricing.purchasePrice = poPrice;
            dealerPricing.purchasePriceSource = 'purchase_order';
            dealerPricing.lastPurchasePriceUpdate = new Date();
            await dealerPricing.save();
            
            console.log(`   ✅ Manual sync completed!`);
            console.log(`   New purchase price: ₹${dealerPricing.purchasePrice}`);
            console.log(`   New source: ${dealerPricing.purchasePriceSource}`);
          } else {
            console.log(`   ✅ Prices already match - sync is working`);
          }
        } else {
          console.log(`   ❌ PO has no valid price (unitPrice: ${productLine.unitPrice}, price: ${productLine.price})`);
        }
      } else {
        console.log(`   ❌ Product not found in latest PO lines`);
      }
    } else {
      console.log(`   ❌ No purchase orders available for sync`);
    }
    
    console.log('\n✅ Debug analysis completed!');
    
  } catch (error) {
    console.error('❌ Error in debug analysis:', error);
  } finally {
    process.exit(0);
  }
};

// Run the debug
connectDB().then(() => debugCeleb3DBlackSync());