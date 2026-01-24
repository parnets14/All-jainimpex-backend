// Debug Wire Belts Auto-Sync Issue
import mongoose from 'mongoose';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import PurchaseOrder from './models/PurchaseOrder.js';
import SupplierInvoice from './models/SupplierInvoice.js';

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://parnetstech14:parnets14@jainimpexcrm.grb5bho.mongodb.net/?retryWrites=true&w=majority&appName=JainImpexCRM');
    console.log('✅ Connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const debugWireBeltsAutoSync = async () => {
  try {
    console.log('🔍 DEBUGGING WIRE BELTS AUTO-SYNC ISSUE');
    console.log('=' .repeat(60));
    
    // Find the wire belts product
    const product = await Product.findOne({
      $or: [
        { itemName: { $regex: 'wire.*belts', $options: 'i' } },
        { productCode: 'TTT006' }
      ]
    });
    
    if (!product) {
      console.log('❌ Wire belts product not found');
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
      console.log(`   Created: ${dealerPricing.createdAt}`);
      console.log(`   Updated: ${dealerPricing.updatedAt}`);
    } else {
      console.log('   ❌ No dealer pricing record found');
    }
    
    // Check purchase orders (recent first)
    console.log('\n🛒 PURCHASE ORDERS CHECK:');
    const purchaseOrders = await PurchaseOrder.find({
      'lines.productId': product._id
    }).sort({ orderDate: -1, createdAt: -1 }).limit(10);
    
    console.log(`   Found ${purchaseOrders.length} purchase orders`);
    
    if (purchaseOrders.length === 0) {
      console.log('   ❌ No purchase orders found for wire belts');
    } else {
      purchaseOrders.forEach((po, index) => {
        const productLine = po.lines.find(line => 
          line.productId && line.productId.toString() === product._id.toString()
        );
        
        console.log(`\n   PO ${index + 1}:`);
        console.log(`     ID: ${po._id}`);
        console.log(`     Date: ${po.orderDate}`);
        console.log(`     Created: ${po.createdAt}`);
        console.log(`     Status: ${po.status}`);
        console.log(`     Supplier: ${po.supplierId}`);
        
        if (productLine) {
          console.log(`     Product Line Found:`);
          console.log(`       Unit Price: ₹${productLine.unitPrice || 'N/A'}`);
          console.log(`       Price: ₹${productLine.price || 'N/A'}`);
          console.log(`       Quantity: ${productLine.quantity || 'N/A'}`);
          console.log(`       Product ID Match: ${productLine.productId.toString() === product._id.toString()}`);
          
          // Check if this PO should trigger auto-sync
          const validStatuses = ['Approved', 'Completed', 'Received'];
          const hasValidStatus = validStatuses.includes(po.status);
          const hasValidPrice = (productLine.unitPrice && productLine.unitPrice > 0) || (productLine.price && productLine.price > 0);
          
          console.log(`       Should Auto-Sync: ${hasValidStatus && hasValidPrice ? 'YES' : 'NO'}`);
          console.log(`         - Valid Status: ${hasValidStatus} (${po.status})`);
          console.log(`         - Valid Price: ${hasValidPrice}`);
        } else {
          console.log(`     ❌ Product not found in PO lines`);
          console.log(`     Available product IDs in lines:`, po.lines.map(l => l.productId?.toString()).filter(Boolean));
        }
      });
    }
    
    // Check supplier invoices
    console.log('\n📄 SUPPLIER INVOICES CHECK:');
    const supplierInvoices = await SupplierInvoice.find({
      'items.productId': product._id
    }).sort({ invoiceDate: -1, createdAt: -1 }).limit(5);
    
    console.log(`   Found ${supplierInvoices.length} supplier invoices`);
    
    if (supplierInvoices.length > 0) {
      supplierInvoices.forEach((invoice, index) => {
        const productItem = invoice.items.find(item => 
          item.productId && item.productId.toString() === product._id.toString()
        );
        
        console.log(`\n   Invoice ${index + 1}:`);
        console.log(`     ID: ${invoice._id}`);
        console.log(`     Date: ${invoice.invoiceDate}`);
        console.log(`     Status: ${invoice.status}`);
        
        if (productItem) {
          console.log(`     Product Item Found:`);
          console.log(`       Unit Price: ₹${productItem.unitPrice || 'N/A'}`);
          console.log(`       Direct Discount: ${productItem.directDiscount || 0}%`);
          console.log(`       Floating Discount: ${productItem.floatingDiscount || 0}%`);
          
          let effectivePrice = productItem.unitPrice || 0;
          if (productItem.directDiscount > 0) {
            effectivePrice = effectivePrice - (effectivePrice * productItem.directDiscount / 100);
          }
          if (productItem.floatingDiscount > 0) {
            effectivePrice = effectivePrice - (effectivePrice * productItem.floatingDiscount / 100);
          }
          
          console.log(`       Effective Price: ₹${effectivePrice.toFixed(2)}`);
        }
      });
    }
    
    // Check auto-sync hooks/triggers
    console.log('\n🔄 AUTO-SYNC ANALYSIS:');
    
    // Check if there are any recent POs that should have triggered auto-sync
    const recentApprovedPOs = purchaseOrders.filter(po => 
      ['Approved', 'Completed', 'Received'].includes(po.status) &&
      po.lines.some(line => 
        line.productId && line.productId.toString() === product._id.toString() &&
        ((line.unitPrice && line.unitPrice > 0) || (line.price && line.price > 0))
      )
    );
    
    if (recentApprovedPOs.length > 0) {
      console.log(`   🚨 Found ${recentApprovedPOs.length} approved POs that should have triggered auto-sync`);
      
      const latestPO = recentApprovedPOs[0];
      const productLine = latestPO.lines.find(line => 
        line.productId && line.productId.toString() === product._id.toString()
      );
      
      const expectedPrice = productLine.unitPrice || productLine.price;
      const currentPrice = dealerPricing?.purchasePrice || 0;
      
      console.log(`   Expected Price: ₹${expectedPrice}`);
      console.log(`   Current Price: ₹${currentPrice}`);
      
      if (Math.abs(currentPrice - expectedPrice) > 0.01) {
        console.log(`   🚨 SYNC ISSUE: Prices don't match!`);
        console.log(`   Latest PO Date: ${latestPO.orderDate}`);
        console.log(`   Dealer Pricing Last Update: ${dealerPricing?.lastPurchasePriceUpdate || 'Never'}`);
        
        // Check if PO is newer than last pricing update
        const poDate = new Date(latestPO.orderDate);
        const lastUpdate = dealerPricing?.lastPurchasePriceUpdate ? new Date(dealerPricing.lastPurchasePriceUpdate) : new Date(0);
        
        console.log(`   PO is newer than last update: ${poDate > lastUpdate}`);
        
        if (poDate > lastUpdate) {
          console.log('\n🔧 ATTEMPTING MANUAL SYNC...');
          if (dealerPricing) {
            dealerPricing.purchasePrice = expectedPrice;
            dealerPricing.purchasePriceSource = 'purchase_order';
            dealerPricing.lastPurchasePriceUpdate = new Date();
            await dealerPricing.save();
            
            console.log(`   ✅ Manual sync completed!`);
            console.log(`   New purchase price: ₹${dealerPricing.purchasePrice}`);
            console.log(`   New source: ${dealerPricing.purchasePriceSource}`);
          } else {
            console.log(`   ❌ No dealer pricing record to update`);
          }
        }
      } else {
        console.log(`   ✅ Prices already match - sync is working`);
      }
    } else {
      console.log(`   ℹ️  No approved POs found that should trigger auto-sync`);
    }
    
    // Check for auto-sync system issues
    console.log('\n🔍 POTENTIAL ISSUES:');
    
    if (purchaseOrders.length === 0) {
      console.log(`   1. ❌ No purchase orders found for wire belts`);
    }
    
    const hasApprovedPOs = purchaseOrders.some(po => ['Approved', 'Completed', 'Received'].includes(po.status));
    if (!hasApprovedPOs) {
      console.log(`   2. ❌ No approved purchase orders found`);
    }
    
    const hasValidPrices = purchaseOrders.some(po => 
      po.lines.some(line => 
        line.productId && line.productId.toString() === product._id.toString() &&
        ((line.unitPrice && line.unitPrice > 0) || (line.price && line.price > 0))
      )
    );
    if (!hasValidPrices) {
      console.log(`   3. ❌ No purchase orders with valid prices found`);
    }
    
    if (!dealerPricing) {
      console.log(`   4. ❌ No dealer pricing record exists (auto-sync target missing)`);
    } else if (dealerPricing.purchasePriceSource === 'manual') {
      console.log(`   5. ⚠️  Dealer pricing source is 'manual' - may not auto-sync`);
    }
    
    console.log('\n✅ Wire belts debug analysis completed!');
    
  } catch (error) {
    console.error('❌ Error in debug analysis:', error);
  } finally {
    process.exit(0);
  }
};

// Run the debug
connectDB().then(() => debugWireBeltsAutoSync());