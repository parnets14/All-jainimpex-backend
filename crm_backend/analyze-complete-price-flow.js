// COMPREHENSIVE PRICE FLOW ANALYSIS
// This script analyzes the complete price flow from Product Master → Dealer Pricing → Purchase Orders
import mongoose from 'mongoose';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import PurchaseOrder from './models/PurchaseOrder.js';
import SupplierInvoice from './models/SupplierInvoice.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://parnetstech14:parnets14@jainimpexcrm.grb5bho.mongodb.net/?retryWrites=true&w=majority&appName=JainImpexCRM');
    console.log('✅ Connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const analyzePriceFlow = async () => {
  try {
    console.log('🔍 COMPREHENSIVE PRICE FLOW ANALYSIS');
    console.log('=' .repeat(80));
    console.log('Analyzing: Product Master → Dealer Pricing → Purchase Orders → Auto-Sync');
    console.log('=' .repeat(80));

    // 1. GET ALL PRODUCTS WITH RATE SLABS
    console.log('\n📋 Step 1: Getting all products with rate slabs...');
    const products = await Product.find({
      'rateSlabs.0.rate': { $gt: 0 }
    }).populate('brand category subcategory', 'name').limit(20); // Limit for analysis

    console.log(`Found ${products.length} products with rate slabs\n`);

    // 2. ANALYZE EACH PRODUCT
    const analysis = [];
    
    for (const product of products) {
      const productAnalysis = {
        productId: product._id,
        productName: product.itemName,
        productCode: product.productCode,
        brand: product.brand?.name || 'N/A',
        category: product.category?.name || 'N/A',
        
        // Product Master Data
        masterPrice: product.rateSlabs[0].rate,
        
        // Dealer Pricing Data
        dealerPricing: null,
        dealerSellingPrice: 0,
        dealerPurchasePrice: 0,
        purchasePriceSource: 'none',
        lastPurchaseUpdate: null,
        
        // Purchase Order Data
        lastPurchaseOrder: null,
        lastPOPrice: 0,
        lastPODate: null,
        
        // Supplier Invoice Data
        lastSupplierInvoice: null,
        lastInvoicePrice: 0,
        lastInvoiceDate: null,
        
        // Analysis Results
        priceDiscrepancy: 0,
        autoSyncStatus: 'unknown',
        recommendations: []
      };

      // Get Dealer Pricing record
      const dealerPricing = await DealerPricing.findOne({
        product: product._id,
        isActive: true
      });

      if (dealerPricing) {
        productAnalysis.dealerPricing = 'exists';
        productAnalysis.dealerSellingPrice = dealerPricing.sellingPrice;
        productAnalysis.dealerPurchasePrice = dealerPricing.purchasePrice;
        productAnalysis.purchasePriceSource = dealerPricing.purchasePriceSource;
        productAnalysis.lastPurchaseUpdate = dealerPricing.lastPurchasePriceUpdate;
        
        // Calculate price discrepancy between master and dealer selling price
        if (productAnalysis.masterPrice > 0) {
          productAnalysis.priceDiscrepancy = Math.abs(
            (productAnalysis.dealerSellingPrice - productAnalysis.masterPrice) / productAnalysis.masterPrice * 100
          );
        }
      } else {
        productAnalysis.dealerPricing = 'missing';
        productAnalysis.recommendations.push('Create dealer pricing record');
      }

      // Get last Purchase Order
      const lastPO = await PurchaseOrder.findOne({
        'lines.productId': product._id,
        status: { $in: ['Approved', 'Completed', 'Received'] }
      }).sort({ orderDate: -1 });

      if (lastPO) {
        const productLine = lastPO.lines.find(line => 
          line.productId && line.productId.toString() === product._id.toString()
        );
        
        if (productLine) {
          productAnalysis.lastPurchaseOrder = 'found';
          productAnalysis.lastPOPrice = productLine.unitPrice || productLine.price || 0;
          productAnalysis.lastPODate = lastPO.orderDate;
          
          // Check if dealer pricing is synced with PO
          if (dealerPricing && productAnalysis.lastPOPrice > 0) {
            if (Math.abs(dealerPricing.purchasePrice - productAnalysis.lastPOPrice) > 0.01) {
              productAnalysis.autoSyncStatus = 'out_of_sync';
              productAnalysis.recommendations.push('Sync purchase price from PO');
            } else {
              productAnalysis.autoSyncStatus = 'synced_with_po';
            }
          }
        }
      } else {
        productAnalysis.lastPurchaseOrder = 'not_found';
      }

      // Get last Supplier Invoice
      const lastInvoice = await SupplierInvoice.findOne({
        'items.productId': product._id,
        status: { $in: ['Approved', 'Completed', 'Paid'] }
      }).sort({ invoiceDate: -1, createdAt: -1 });

      if (lastInvoice) {
        const productItem = lastInvoice.items.find(item => 
          item.productId && item.productId.toString() === product._id.toString()
        );
        
        if (productItem) {
          productAnalysis.lastSupplierInvoice = 'found';
          productAnalysis.lastInvoicePrice = productItem.unitPrice || 0;
          productAnalysis.lastInvoiceDate = lastInvoice.invoiceDate;
          
          // Calculate effective price after discounts
          let effectiveInvoicePrice = productAnalysis.lastInvoicePrice;
          if (productItem.directDiscount > 0) {
            effectiveInvoicePrice = effectiveInvoicePrice - (effectiveInvoicePrice * productItem.directDiscount / 100);
          }
          if (productItem.floatingDiscount > 0) {
            effectiveInvoicePrice = effectiveInvoicePrice - (effectiveInvoicePrice * productItem.floatingDiscount / 100);
          }
          
          productAnalysis.effectiveInvoicePrice = effectiveInvoicePrice;
          
          // Check sync with invoice
          if (dealerPricing && effectiveInvoicePrice > 0) {
            if (Math.abs(dealerPricing.purchasePrice - effectiveInvoicePrice) > 0.01) {
              if (productAnalysis.autoSyncStatus === 'unknown') {
                productAnalysis.autoSyncStatus = 'out_of_sync_invoice';
                productAnalysis.recommendations.push('Sync purchase price from invoice');
              }
            } else {
              productAnalysis.autoSyncStatus = 'synced_with_invoice';
            }
          }
        }
      } else {
        productAnalysis.lastSupplierInvoice = 'not_found';
      }

      // Additional recommendations
      if (productAnalysis.priceDiscrepancy > 30) {
        productAnalysis.recommendations.push(`Large price discrepancy: ${productAnalysis.priceDiscrepancy.toFixed(1)}%`);
      }
      
      if (productAnalysis.dealerPurchasePrice === 0 && productAnalysis.lastPOPrice > 0) {
        productAnalysis.recommendations.push('Update purchase price from PO');
      }
      
      if (productAnalysis.purchasePriceSource === 'manual' && (productAnalysis.lastPOPrice > 0 || productAnalysis.lastInvoicePrice > 0)) {
        productAnalysis.recommendations.push('Enable auto-sync for purchase prices');
      }

      analysis.push(productAnalysis);
    }

    // 3. DISPLAY RESULTS
    console.log('\n📊 PRICE FLOW ANALYSIS RESULTS');
    console.log('=' .repeat(120));
    console.log('Product Name'.padEnd(25) + 
                'Master Price'.padEnd(15) + 
                'Dealer Sell'.padEnd(15) + 
                'Dealer Purch'.padEnd(15) + 
                'Last PO'.padEnd(12) + 
                'Sync Status'.padEnd(20) + 
                'Issues');
    console.log('-'.repeat(120));

    for (const item of analysis) {
      const masterPrice = `₹${item.masterPrice.toLocaleString()}`;
      const dealerSell = item.dealerSellingPrice > 0 ? `₹${item.dealerSellingPrice.toLocaleString()}` : 'N/A';
      const dealerPurch = item.dealerPurchasePrice > 0 ? `₹${item.dealerPurchasePrice.toLocaleString()}` : 'N/A';
      const lastPO = item.lastPOPrice > 0 ? `₹${item.lastPOPrice.toLocaleString()}` : 'N/A';
      const syncStatus = item.autoSyncStatus.replace('_', ' ');
      const issues = item.recommendations.length;

      console.log(
        item.productName.substring(0, 24).padEnd(25) +
        masterPrice.padEnd(15) +
        dealerSell.padEnd(15) +
        dealerPurch.padEnd(15) +
        lastPO.padEnd(12) +
        syncStatus.padEnd(20) +
        `${issues} issues`
      );
    }

    // 4. SUMMARY STATISTICS
    console.log('\n📈 SUMMARY STATISTICS');
    console.log('=' .repeat(60));
    
    const stats = {
      totalProducts: analysis.length,
      withDealerPricing: analysis.filter(a => a.dealerPricing === 'exists').length,
      withoutDealerPricing: analysis.filter(a => a.dealerPricing === 'missing').length,
      withPurchaseOrders: analysis.filter(a => a.lastPurchaseOrder === 'found').length,
      withSupplierInvoices: analysis.filter(a => a.lastSupplierInvoice === 'found').length,
      syncedWithPO: analysis.filter(a => a.autoSyncStatus === 'synced_with_po').length,
      syncedWithInvoice: analysis.filter(a => a.autoSyncStatus === 'synced_with_invoice').length,
      outOfSync: analysis.filter(a => a.autoSyncStatus.includes('out_of_sync')).length,
      largePriceDiscrepancy: analysis.filter(a => a.priceDiscrepancy > 30).length,
      needsAutoSync: analysis.filter(a => a.recommendations.some(r => r.includes('Sync'))).length
    };

    console.log(`Total Products Analyzed: ${stats.totalProducts}`);
    console.log(`Products with Dealer Pricing: ${stats.withDealerPricing} (${(stats.withDealerPricing/stats.totalProducts*100).toFixed(1)}%)`);
    console.log(`Products without Dealer Pricing: ${stats.withoutDealerPricing} (${(stats.withoutDealerPricing/stats.totalProducts*100).toFixed(1)}%)`);
    console.log(`Products with Purchase Orders: ${stats.withPurchaseOrders} (${(stats.withPurchaseOrders/stats.totalProducts*100).toFixed(1)}%)`);
    console.log(`Products with Supplier Invoices: ${stats.withSupplierInvoices} (${(stats.withSupplierInvoices/stats.totalProducts*100).toFixed(1)}%)`);
    console.log(`Synced with PO: ${stats.syncedWithPO}`);
    console.log(`Synced with Invoice: ${stats.syncedWithInvoice}`);
    console.log(`Out of Sync: ${stats.outOfSync}`);
    console.log(`Large Price Discrepancy (>30%): ${stats.largePriceDiscrepancy}`);
    console.log(`Need Auto-Sync: ${stats.needsAutoSync}`);

    // 5. DETAILED ISSUES
    console.log('\n🚨 DETAILED ISSUES AND RECOMMENDATIONS');
    console.log('=' .repeat(80));
    
    const productsWithIssues = analysis.filter(a => a.recommendations.length > 0);
    
    for (const product of productsWithIssues) {
      console.log(`\n📦 ${product.productName} (${product.productCode})`);
      console.log(`   Brand: ${product.brand} | Category: ${product.category}`);
      console.log(`   Master Price: ₹${product.masterPrice.toLocaleString()}`);
      console.log(`   Dealer Selling: ₹${product.dealerSellingPrice.toLocaleString()}`);
      console.log(`   Dealer Purchase: ₹${product.dealerPurchasePrice.toLocaleString()}`);
      console.log(`   Last PO Price: ₹${product.lastPOPrice.toLocaleString()}`);
      console.log(`   Price Source: ${product.purchasePriceSource}`);
      console.log(`   Sync Status: ${product.autoSyncStatus}`);
      console.log(`   Issues:`);
      product.recommendations.forEach(rec => {
        console.log(`     • ${rec}`);
      });
    }

    // 6. AUTO-SYNC RECOMMENDATIONS
    console.log('\n🔄 AUTO-SYNC RECOMMENDATIONS');
    console.log('=' .repeat(60));
    
    if (stats.needsAutoSync > 0) {
      console.log(`✅ Run comprehensive validation to auto-sync ${stats.needsAutoSync} products`);
      console.log('   Command: POST /api/dealer-pricing/validate-and-sync-all');
    }
    
    if (stats.withoutDealerPricing > 0) {
      console.log(`✅ Create dealer pricing records for ${stats.withoutDealerPricing} products`);
      console.log('   These will be auto-created during comprehensive validation');
    }
    
    if (stats.largePriceDiscrepancy > 0) {
      console.log(`⚠️  Review ${stats.largePriceDiscrepancy} products with large price discrepancies`);
      console.log('   Check if master prices or dealer prices need adjustment');
    }

    console.log('\n✅ Price flow analysis completed!');
    console.log('💡 Use the comprehensive validation system to fix identified issues automatically.');

  } catch (error) {
    console.error('❌ Error in price flow analysis:', error);
  }
};

// Run the analysis
const runAnalysis = async () => {
  await connectDB();
  await analyzePriceFlow();
  process.exit(0);
};

runAnalysis();