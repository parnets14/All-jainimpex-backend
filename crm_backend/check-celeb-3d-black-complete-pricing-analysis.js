// Complete pricing analysis for celeb 3d black: Product Master vs Dealer Pricing vs Last Purchase
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import PurchaseOrder from './models/PurchaseOrder.js';
import SupplierInvoice from './models/SupplierInvoice.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const checkCeleb3dBlackCompletePricingAnalysis = async () => {
  try {
    console.log('🔍 Complete Pricing Analysis for "celeb 3d black"...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // 1. Find the celeb 3d black product
    console.log('📋 Step 1: Finding celeb 3d black product...');
    
    const celebProduct = await Product.findOne({
      itemName: { $regex: 'celeb.*3d.*black', $options: 'i' }
    })
    .populate('brand', 'name')
    .populate('category', 'name')
    .populate('subcategory', 'name');

    if (!celebProduct) {
      console.log('❌ Celeb 3d black product not found!');
      return;
    }

    console.log('✅ Found celeb 3d black product:');
    console.log(`- Product ID: ${celebProduct._id}`);
    console.log(`- Name: ${celebProduct.itemName}`);
    console.log(`- Code: ${celebProduct.productCode}`);
    console.log(`- Brand: ${celebProduct.brand?.name}`);
    console.log(`- Category: ${celebProduct.category?.name}`);
    console.log(`- HSN Code: ${celebProduct.HSNCode}`);
    console.log(`- Unit: ${celebProduct.unit}`);

    // 2. Check Product Master pricing (rate slabs)
    console.log('\n💰 Step 2: Product Master Pricing (Rate Slabs)...');
    
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

    // 3. Check Dealer Pricing
    console.log('\n🏪 Step 3: Dealer Pricing...');
    
    const dealerPricing = await DealerPricing.findOne({
      product: celebProduct._id,
      isActive: true
    });

    if (dealerPricing) {
      console.log('✅ Found dealer pricing record:');
      console.log(`- Purchase Price: ₹${dealerPricing.purchasePrice}`);
      console.log(`- Selling Price: ₹${dealerPricing.sellingPrice}`);
      console.log(`- Gross Margin: ${dealerPricing.grossMargin?.toFixed(2)}%`);
      console.log(`- Net Margin: ${dealerPricing.netMargin?.toFixed(2)}%`);
      console.log(`- Effective Purchase Price: ₹${dealerPricing.effectivePurchasePrice}`);
      console.log(`- Purchase Price Source: ${dealerPricing.purchasePriceSource}`);
      console.log(`- Last Purchase Date: ${dealerPricing.lastPurchaseDate || 'Not set'}`);
      console.log(`- Has Sales Discount: ${dealerPricing.hasDirectDiscount}`);
      console.log(`- Sales Discount %: ${dealerPricing.directDiscountPercentage}%`);
    } else {
      console.log('❌ No dealer pricing record found');
    }

    // 4. Check Purchase Orders for last purchase
    console.log('\n📦 Step 4: Last Purchase from Purchase Orders...');
    
    const purchaseOrders = await PurchaseOrder.find({
      'lines.productId': celebProduct._id,
      status: { $in: ['Approved', 'Completed', 'Received'] }
    })
    .populate('supplierId', 'name companyName')
    .sort({ orderDate: -1 })
    .limit(10);

    if (purchaseOrders.length > 0) {
      console.log(`✅ Found ${purchaseOrders.length} purchase orders containing celeb 3d black:`);
      
      purchaseOrders.forEach((po, index) => {
        const productLine = po.lines.find(line => 
          line.productId && line.productId.toString() === celebProduct._id.toString()
        );
        
        if (productLine) {
          console.log(`\n${index + 1}. Purchase Order: ${po.orderNumber || po._id}`);
          console.log(`   - Date: ${po.orderDate ? new Date(po.orderDate).toLocaleDateString() : 'Not set'}`);
          console.log(`   - Supplier: ${po.supplierId?.name || po.supplierId?.companyName || 'Unknown'}`);
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
          
          // Calculate effective price after discounts
          let effectivePrice = productLine.unitPrice;
          if (productLine.directDiscount > 0) {
            effectivePrice = effectivePrice - (effectivePrice * productLine.directDiscount / 100);
          }
          if (productLine.floatingDiscount > 0) {
            effectivePrice = effectivePrice - (effectivePrice * productLine.floatingDiscount / 100);
          }
          
          if (effectivePrice !== productLine.unitPrice) {
            console.log(`   - Effective Price (after discounts): ₹${effectivePrice.toFixed(2)}`);
          }
        }
      });
      
      // Get the most recent purchase
      const latestPO = purchaseOrders[0];
      const latestProductLine = latestPO.lines.find(line => 
        line.productId && line.productId.toString() === celebProduct._id.toString()
      );
      
      if (latestProductLine) {
        console.log(`\n🎯 LAST PURCHASE DETAILS:`);
        console.log(`- Date: ${latestPO.orderDate ? new Date(latestPO.orderDate).toLocaleDateString() : 'Not set'}`);
        console.log(`- Supplier: ${latestPO.supplierId?.name || latestPO.supplierId?.companyName || 'Unknown'}`);
        console.log(`- Last Purchase Price: ₹${latestProductLine.unitPrice}`);
        
        let effectivePrice = latestProductLine.unitPrice;
        if (latestProductLine.directDiscount > 0) {
          effectivePrice = effectivePrice - (effectivePrice * latestProductLine.directDiscount / 100);
        }
        if (latestProductLine.floatingDiscount > 0) {
          effectivePrice = effectivePrice - (effectivePrice * latestProductLine.floatingDiscount / 100);
        }
        
        if (effectivePrice !== latestProductLine.unitPrice) {
          console.log(`- Effective Purchase Price: ₹${effectivePrice.toFixed(2)}`);
        }
      }
    } else {
      console.log('❌ No purchase orders found for celeb 3d black');
    }

    // 5. Check Supplier Invoices for actual received prices
    console.log('\n📄 Step 5: Last Purchase from Supplier Invoices...');
    
    const supplierInvoices = await SupplierInvoice.find({
      'items.productId': celebProduct._id,
      status: { $in: ['Approved', 'Completed', 'Paid'] }
    })
    .populate('supplierId', 'name companyName')
    .sort({ invoiceDate: -1 })
    .limit(5);

    if (supplierInvoices.length > 0) {
      console.log(`✅ Found ${supplierInvoices.length} supplier invoices containing celeb 3d black:`);
      
      supplierInvoices.forEach((invoice, index) => {
        const productItem = invoice.items.find(item => 
          item.productId && item.productId.toString() === celebProduct._id.toString()
        );
        
        if (productItem) {
          console.log(`\n${index + 1}. Supplier Invoice: ${invoice.invoiceNumber || invoice._id}`);
          console.log(`   - Date: ${invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : 'Not set'}`);
          console.log(`   - Supplier: ${invoice.supplierId?.name || invoice.supplierId?.companyName || 'Unknown'}`);
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
          
          // Calculate effective price after discounts
          let effectivePrice = productItem.unitPrice;
          if (productItem.directDiscount > 0) {
            effectivePrice = effectivePrice - (effectivePrice * productItem.directDiscount / 100);
          }
          if (productItem.floatingDiscount > 0) {
            effectivePrice = effectivePrice - (effectivePrice * productItem.floatingDiscount / 100);
          }
          
          if (effectivePrice !== productItem.unitPrice) {
            console.log(`   - Effective Price (after discounts): ₹${effectivePrice.toFixed(2)}`);
          }
        }
      });
      
      // Get the most recent invoice
      const latestInvoice = supplierInvoices[0];
      const latestProductItem = latestInvoice.items.find(item => 
        item.productId && item.productId.toString() === celebProduct._id.toString()
      );
      
      if (latestProductItem) {
        console.log(`\n🎯 LAST INVOICE DETAILS:`);
        console.log(`- Date: ${latestInvoice.invoiceDate ? new Date(latestInvoice.invoiceDate).toLocaleDateString() : 'Not set'}`);
        console.log(`- Supplier: ${latestInvoice.supplierId?.name || latestInvoice.supplierId?.companyName || 'Unknown'}`);
        console.log(`- Last Invoice Price: ₹${latestProductItem.unitPrice}`);
        
        let effectivePrice = latestProductItem.unitPrice;
        if (latestProductItem.directDiscount > 0) {
          effectivePrice = effectivePrice - (effectivePrice * latestProductItem.directDiscount / 100);
        }
        if (latestProductItem.floatingDiscount > 0) {
          effectivePrice = effectivePrice - (effectivePrice * latestProductItem.floatingDiscount / 100);
        }
        
        if (effectivePrice !== latestProductItem.unitPrice) {
          console.log(`- Effective Invoice Price: ₹${effectivePrice.toFixed(2)}`);
        }
      }
    } else {
      console.log('❌ No supplier invoices found for celeb 3d black');
    }

    // 6. Summary and Comparison
    console.log('\n📊 COMPLETE PRICING SUMMARY FOR CELEB 3D BLACK:');
    console.log('=' .repeat(60));
    
    const masterPrice = celebProduct.rateSlabs?.[0]?.rate || 0;
    const dealerPurchasePrice = dealerPricing?.purchasePrice || 0;
    const dealerSellingPrice = dealerPricing?.sellingPrice || 0;
    
    console.log(`Product Master Price (Rate Slab): ₹${masterPrice}`);
    console.log(`Dealer Purchase Price: ₹${dealerPurchasePrice}`);
    console.log(`Dealer Selling Price: ₹${dealerSellingPrice}`);
    
    if (purchaseOrders.length > 0) {
      const latestPO = purchaseOrders[0];
      const latestProductLine = latestPO.lines.find(line => 
        line.productId && line.productId.toString() === celebProduct._id.toString()
      );
      if (latestProductLine) {
        console.log(`Last Purchase Order Price: ₹${latestProductLine.unitPrice}`);
      }
    }
    
    if (supplierInvoices.length > 0) {
      const latestInvoice = supplierInvoices[0];
      const latestProductItem = latestInvoice.items.find(item => 
        item.productId && item.productId.toString() === celebProduct._id.toString()
      );
      if (latestProductItem) {
        console.log(`Last Supplier Invoice Price: ₹${latestProductItem.unitPrice}`);
      }
    }
    
    console.log('\n🔍 PRICE COMPARISON ANALYSIS:');
    if (masterPrice > 0 && dealerSellingPrice > 0) {
      const masterVsDealerDiff = ((dealerSellingPrice - masterPrice) / masterPrice * 100);
      console.log(`Dealer Selling vs Master Price: ${masterVsDealerDiff >= 0 ? '+' : ''}${masterVsDealerDiff.toFixed(2)}%`);
    }
    
    if (dealerPurchasePrice > 0 && dealerSellingPrice > 0) {
      const margin = ((dealerSellingPrice - dealerPurchasePrice) / dealerPurchasePrice * 100);
      console.log(`Current Dealer Margin: ${margin.toFixed(2)}%`);
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
checkCeleb3dBlackCompletePricingAnalysis();