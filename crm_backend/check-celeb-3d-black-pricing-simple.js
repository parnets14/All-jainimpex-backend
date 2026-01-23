// Simple pricing analysis for celeb 3d black without complex populations
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import PurchaseOrder from './models/PurchaseOrder.js';
import SupplierInvoice from './models/SupplierInvoice.js';

dotenv.config();

const checkCeleb3dBlackPricingSimple = async () => {
  try {
    console.log('🔍 Simple Pricing Analysis for "celeb 3d black"...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // 1. Find the celeb 3d black product
    const celebProduct = await Product.findOne({
      itemName: { $regex: 'celeb.*3d.*black', $options: 'i' }
    });

    if (!celebProduct) {
      console.log('❌ Celeb 3d black product not found!');
      return;
    }

    console.log('✅ Found celeb 3d black product:');
    console.log(`- Product ID: ${celebProduct._id}`);
    console.log(`- Name: ${celebProduct.itemName}`);
    console.log(`- Code: ${celebProduct.productCode}`);

    // 2. Product Master pricing (rate slabs)
    console.log('\n💰 Product Master Pricing (Rate Slabs):');
    if (celebProduct.rateSlabs && celebProduct.rateSlabs.length > 0) {
      console.log(`Found ${celebProduct.rateSlabs.length} rate slabs:`);
      celebProduct.rateSlabs.forEach((slab, index) => {
        console.log(`${index + 1}. Quantity: ${slab.quantity}, Rate: ₹${slab.rate}, Amount: ₹${slab.amount}`);
      });
      
      const masterPrice = celebProduct.rateSlabs[0].rate;
      console.log(`\n📊 Product Master Price: ₹${masterPrice}`);
    } else {
      console.log('❌ No rate slabs found in Product Master');
    }

    // 3. Dealer Pricing
    console.log('\n🏪 Dealer Pricing:');
    const dealerPricing = await DealerPricing.findOne({
      product: celebProduct._id,
      isActive: true
    });

    if (dealerPricing) {
      console.log('✅ Found dealer pricing record:');
      console.log(`- Purchase Price: ₹${dealerPricing.purchasePrice}`);
      console.log(`- Selling Price: ₹${dealerPricing.sellingPrice}`);
      console.log(`- Gross Margin: ${dealerPricing.grossMargin?.toFixed(2)}%`);
      console.log(`- Purchase Price Source: ${dealerPricing.purchasePriceSource}`);
    } else {
      console.log('❌ No dealer pricing record found');
    }

    // 4. Check Purchase Orders (without population)
    console.log('\n📦 Last Purchase from Purchase Orders:');
    const purchaseOrders = await PurchaseOrder.find({
      'lines.productId': celebProduct._id,
      status: { $in: ['Approved', 'Completed', 'Received'] }
    })
    .sort({ orderDate: -1 })
    .limit(5);

    if (purchaseOrders.length > 0) {
      console.log(`✅ Found ${purchaseOrders.length} purchase orders containing celeb 3d black:`);
      
      purchaseOrders.forEach((po, index) => {
        const productLine = po.lines.find(line => 
          line.productId && line.productId.toString() === celebProduct._id.toString()
        );
        
        if (productLine) {
          console.log(`\n${index + 1}. Purchase Order: ${po.orderNumber || po._id}`);
          console.log(`   - Date: ${po.orderDate ? new Date(po.orderDate).toLocaleDateString() : 'Not set'}`);
          console.log(`   - Supplier ID: ${po.supplierId}`);
          console.log(`   - Status: ${po.status}`);
          console.log(`   - Quantity: ${productLine.quantity}`);
          console.log(`   - Unit Price: ₹${productLine.unitPrice}`);
          console.log(`   - Total Amount: ₹${productLine.totalAmount}`);
          
          if (productLine.directDiscount > 0) {
            console.log(`   - Direct Discount: ${productLine.directDiscount}%`);
          }
          if (productLine.floatingDiscount > 0) {
            console.log(`   - Floating Discount: ${productLine.floatingDiscount}%`);
          }
        }
      });
      
      // Get the most recent purchase
      const latestPO = purchaseOrders[0];
      const latestProductLine = latestPO.lines.find(line => 
        line.productId && line.productId.toString() === celebProduct._id.toString()
      );
      
      if (latestProductLine) {
        console.log(`\n🎯 LAST PURCHASE ORDER DETAILS:`);
        console.log(`- Date: ${latestPO.orderDate ? new Date(latestPO.orderDate).toLocaleDateString() : 'Not set'}`);
        console.log(`- Last Purchase Price: ₹${latestProductLine.unitPrice}`);
        console.log(`- Quantity: ${latestProductLine.quantity}`);
      }
    } else {
      console.log('❌ No purchase orders found for celeb 3d black');
    }

    // 5. Check Supplier Invoices (without population)
    console.log('\n📄 Last Purchase from Supplier Invoices:');
    const supplierInvoices = await SupplierInvoice.find({
      'items.productId': celebProduct._id,
      status: { $in: ['Approved', 'Completed', 'Paid'] }
    })
    .sort({ invoiceDate: -1 })
    .limit(3);

    if (supplierInvoices.length > 0) {
      console.log(`✅ Found ${supplierInvoices.length} supplier invoices containing celeb 3d black:`);
      
      supplierInvoices.forEach((invoice, index) => {
        const productItem = invoice.items.find(item => 
          item.productId && item.productId.toString() === celebProduct._id.toString()
        );
        
        if (productItem) {
          console.log(`\n${index + 1}. Supplier Invoice: ${invoice.invoiceNumber || invoice._id}`);
          console.log(`   - Date: ${invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : 'Not set'}`);
          console.log(`   - Supplier ID: ${invoice.supplierId}`);
          console.log(`   - Status: ${invoice.status}`);
          console.log(`   - Quantity: ${productItem.quantity}`);
          console.log(`   - Unit Price: ₹${productItem.unitPrice}`);
          console.log(`   - Total Amount: ₹${productItem.totalAmount}`);
          
          if (productItem.directDiscount > 0) {
            console.log(`   - Direct Discount: ${productItem.directDiscount}%`);
          }
          if (productItem.floatingDiscount > 0) {
            console.log(`   - Floating Discount: ${productItem.floatingDiscount}%`);
          }
        }
      });
      
      // Get the most recent invoice
      const latestInvoice = supplierInvoices[0];
      const latestProductItem = latestInvoice.items.find(item => 
        item.productId && item.productId.toString() === celebProduct._id.toString()
      );
      
      if (latestProductItem) {
        console.log(`\n🎯 LAST SUPPLIER INVOICE DETAILS:`);
        console.log(`- Date: ${latestInvoice.invoiceDate ? new Date(latestInvoice.invoiceDate).toLocaleDateString() : 'Not set'}`);
        console.log(`- Last Invoice Price: ₹${latestProductItem.unitPrice}`);
        console.log(`- Quantity: ${latestProductItem.quantity}`);
      }
    } else {
      console.log('❌ No supplier invoices found for celeb 3d black');
    }

    // 6. COMPLETE SUMMARY
    console.log('\n' + '='.repeat(70));
    console.log('📊 COMPLETE PRICING SUMMARY FOR CELEB 3D BLACK');
    console.log('='.repeat(70));
    
    const masterPrice = celebProduct.rateSlabs?.[0]?.rate || 0;
    const dealerPurchasePrice = dealerPricing?.purchasePrice || 0;
    const dealerSellingPrice = dealerPricing?.sellingPrice || 0;
    
    console.log(`\n1. 📋 Product Master Price (Rate Slab): ₹${masterPrice.toLocaleString()}`);
    console.log(`2. 🏪 Dealer Purchase Price: ₹${dealerPurchasePrice.toLocaleString()}`);
    console.log(`3. 🏪 Dealer Selling Price: ₹${dealerSellingPrice.toLocaleString()}`);
    
    if (purchaseOrders.length > 0) {
      const latestPO = purchaseOrders[0];
      const latestProductLine = latestPO.lines.find(line => 
        line.productId && line.productId.toString() === celebProduct._id.toString()
      );
      if (latestProductLine) {
        console.log(`4. 📦 Last Purchase Order Price: ₹${latestProductLine.unitPrice.toLocaleString()}`);
      }
    }
    
    if (supplierInvoices.length > 0) {
      const latestInvoice = supplierInvoices[0];
      const latestProductItem = latestInvoice.items.find(item => 
        item.productId && item.productId.toString() === celebProduct._id.toString()
      );
      if (latestProductItem) {
        console.log(`5. 📄 Last Supplier Invoice Price: ₹${latestProductItem.unitPrice.toLocaleString()}`);
      }
    }
    
    console.log('\n🔍 PRICE COMPARISON ANALYSIS:');
    console.log('-'.repeat(50));
    
    if (masterPrice > 0 && dealerSellingPrice > 0) {
      const masterVsDealerDiff = ((dealerSellingPrice - masterPrice) / masterPrice * 100);
      console.log(`📊 Dealer Selling vs Master Price: ${masterVsDealerDiff >= 0 ? '+' : ''}${masterVsDealerDiff.toFixed(2)}%`);
      console.log(`   (₹${dealerSellingPrice} vs ₹${masterPrice})`);
    }
    
    if (masterPrice > 0 && dealerPurchasePrice > 0) {
      const masterVsPurchaseDiff = ((dealerPurchasePrice - masterPrice) / masterPrice * 100);
      console.log(`📊 Dealer Purchase vs Master Price: ${masterVsPurchaseDiff >= 0 ? '+' : ''}${masterVsPurchaseDiff.toFixed(2)}%`);
      console.log(`   (₹${dealerPurchasePrice} vs ₹${masterPrice})`);
    }
    
    if (dealerPurchasePrice > 0 && dealerSellingPrice > 0) {
      const margin = ((dealerSellingPrice - dealerPurchasePrice) / dealerPurchasePrice * 100);
      console.log(`📊 Current Dealer Margin: ${margin.toFixed(2)}%`);
      console.log(`   (₹${dealerSellingPrice} - ₹${dealerPurchasePrice} = ₹${(dealerSellingPrice - dealerPurchasePrice).toLocaleString()})`);
    }

    console.log('\n🚨 KEY FINDINGS:');
    console.log('-'.repeat(50));
    
    if (masterPrice > dealerSellingPrice) {
      console.log(`⚠️  ISSUE: Dealer selling price (₹${dealerSellingPrice}) is LOWER than Product Master price (₹${masterPrice})`);
    }
    
    if (masterPrice > dealerPurchasePrice && dealerPurchasePrice > 0) {
      const savings = masterPrice - dealerPurchasePrice;
      console.log(`✅ GOOD: Purchase price (₹${dealerPurchasePrice}) is ₹${savings.toLocaleString()} lower than Master price`);
    }
    
    if (dealerPurchasePrice === 0) {
      console.log(`⚠️  WARNING: Dealer purchase price is ₹0 - needs to be updated from actual purchases`);
    }

    console.log('\n✅ Complete pricing analysis completed!');

  } catch (error) {
    console.error('❌ Analysis failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the analysis
checkCeleb3dBlackPricingSimple();