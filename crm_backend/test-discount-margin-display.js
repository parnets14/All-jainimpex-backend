import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import DiscountMapping from './models/DiscountMapping.js';
import PurchaseDiscountMapping from './models/PurchaseDiscountMapping.js';

dotenv.config();

const testDiscountMarginDisplay = async () => {
  try {
    console.log('🔍 Testing Discount and Margin Display...');
    
    // Connect to database
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');
    
    console.log('\n=== TESTING DISCOUNT AND MARGIN DISPLAY ===');
    
    // 1. Check discount mappings
    console.log('\n1️⃣ Checking discount mappings...');
    
    const salesDiscounts = await DiscountMapping.find({ isActive: true }).limit(5);
    console.log(`📊 Sales discount mappings: ${salesDiscounts.length}`);
    
    const purchaseDiscounts = await PurchaseDiscountMapping.find({ isActive: true }).limit(5);
    console.log(`📊 Purchase discount mappings: ${purchaseDiscounts.length}`);
    
    if (salesDiscounts.length > 0) {
      console.log('📋 Sample sales discount:');
      const sampleSales = salesDiscounts[0];
      console.log(`  - Target: ${sampleSales.targetType} (${sampleSales.targetName})`);
      console.log(`  - Direct Discount: ${sampleSales.directDiscountPercentage}%`);
      console.log(`  - Dealer Type: ${sampleSales.dealerType}`);
    }
    
    if (purchaseDiscounts.length > 0) {
      console.log('📋 Sample purchase discount:');
      const samplePurchase = purchaseDiscounts[0];
      console.log(`  - Target: ${samplePurchase.targetType} (${samplePurchase.targetName})`);
      console.log(`  - Direct Discount: ${samplePurchase.directDiscountPercentage}%`);
      if (samplePurchase.floatingDiscountEnabled) {
        console.log(`  - Floating: ${samplePurchase.floatingDiscountMin}% - ${samplePurchase.floatingDiscountMax}%`);
      }
    }
    
    // 2. Check dealer pricing records with discount info
    console.log('\n2️⃣ Checking dealer pricing with discount information...');
    
    const pricingRecords = await DealerPricing.find({ isActive: true })
      .populate('product', 'itemName productCode')
      .limit(5);
    
    console.log(`📊 Dealer pricing records: ${pricingRecords.length}`);
    
    for (const pricing of pricingRecords) {
      console.log(`\n📦 Product: ${pricing.product?.itemName} (${pricing.product?.productCode})`);
      console.log(`💰 Purchase Price: ₹${pricing.purchasePrice}`);
      console.log(`💰 Selling Price: ₹${pricing.sellingPrice}`);
      
      // Sales discount info
      console.log(`📊 Sales Discount: ${pricing.hasDirectDiscount ? pricing.directDiscountPercentage + '%' : 'None'}`);
      if (pricing.salesDiscountSource) {
        console.log(`   Source: ${pricing.salesDiscountSource} (${pricing.salesDiscountSourceName})`);
      }
      
      // Purchase discount info
      if (pricing.purchaseDiscountInfo) {
        console.log(`📊 Purchase Discount: ${pricing.purchaseDiscountInfo.hasDirectDiscount ? pricing.purchaseDiscountInfo.directDiscountPercentage + '%' : 'None'}`);
        if (pricing.purchaseDiscountInfo.discountSource) {
          console.log(`   Source: ${pricing.purchaseDiscountInfo.discountSource} (${pricing.purchaseDiscountInfo.discountSourceName})`);
        }
        if (pricing.purchaseDiscountInfo.hasFloatingDiscount) {
          console.log(`   Floating: ${pricing.purchaseDiscountInfo.floatingDiscountMin}% - ${pricing.purchaseDiscountInfo.floatingDiscountMax}%`);
        }
      } else {
        console.log(`📊 Purchase Discount: No info available`);
      }
      
      // Margin calculations
      console.log(`📈 Gross Margin: ${pricing.grossMargin?.toFixed(2) || 'N/A'}%`);
      console.log(`📈 Net Margin: ${pricing.netMargin?.toFixed(2) || 'N/A'}%`);
      
      // Effective prices
      console.log(`💵 Effective Purchase: ₹${pricing.effectivePurchasePrice || 'N/A'}`);
      console.log(`💵 Effective Selling: ₹${pricing.effectiveSellingPrice || 'N/A'}`);
      
      // Manual calculation for verification
      const purchaseDiscount = pricing.purchaseDiscountInfo?.directDiscountPercentage || 0;
      const salesDiscount = pricing.directDiscountPercentage || 0;
      
      const effectivePurchase = pricing.purchasePrice - (pricing.purchasePrice * purchaseDiscount / 100);
      const effectiveSelling = pricing.sellingPrice - (pricing.sellingPrice * salesDiscount / 100);
      const actualMargin = effectivePurchase > 0 ? ((effectiveSelling - effectivePurchase) / effectivePurchase) * 100 : 0;
      
      console.log(`🧮 Manual Calculation:`);
      console.log(`   Effective Purchase: ₹${effectivePurchase.toFixed(2)}`);
      console.log(`   Effective Selling: ₹${effectiveSelling.toFixed(2)}`);
      console.log(`   Actual Margin: ${actualMargin.toFixed(2)}%`);
      console.log(`   Profit: ₹${(effectiveSelling - effectivePurchase).toFixed(2)}`);
    }
    
    // 3. Test the comprehensive API response
    console.log('\n3️⃣ Testing comprehensive API response format...');
    
    const samplePricing = pricingRecords[0];
    if (samplePricing) {
      console.log('📋 Sample API response format:');
      console.log(JSON.stringify({
        productId: samplePricing.product?._id,
        productName: samplePricing.product?.itemName,
        purchasePrice: samplePricing.purchasePrice,
        sellingPrice: samplePricing.sellingPrice,
        purchaseDiscountInfo: samplePricing.purchaseDiscountInfo,
        salesDiscount: {
          hasDirectDiscount: samplePricing.hasDirectDiscount,
          directDiscountPercentage: samplePricing.directDiscountPercentage,
          source: samplePricing.salesDiscountSource,
          sourceName: samplePricing.salesDiscountSourceName
        },
        margins: {
          gross: samplePricing.grossMargin,
          net: samplePricing.netMargin
        },
        effectivePrices: {
          purchase: samplePricing.effectivePurchasePrice,
          selling: samplePricing.effectiveSellingPrice
        }
      }, null, 2));
    }
    
    // 4. Recommendations for frontend display
    console.log('\n4️⃣ Frontend Display Recommendations...');
    console.log('✅ Frontend should display:');
    console.log('  1. Purchase Price with purchase discount percentage');
    console.log('  2. Selling Price with sales discount percentage');
    console.log('  3. Effective prices after discounts');
    console.log('  4. Basic margin (without discounts) vs Actual margin (with discounts)');
    console.log('  5. Real profit amount after all discounts');
    console.log('  6. Discount sources for both purchase and sales');
    
    console.log('\n📊 Example Display Format:');
    if (samplePricing) {
      const purchaseDiscount = samplePricing.purchaseDiscountInfo?.directDiscountPercentage || 0;
      const salesDiscount = samplePricing.directDiscountPercentage || 0;
      const effectivePurchase = samplePricing.purchasePrice - (samplePricing.purchasePrice * purchaseDiscount / 100);
      const effectiveSelling = samplePricing.sellingPrice - (samplePricing.sellingPrice * salesDiscount / 100);
      const basicMargin = ((samplePricing.sellingPrice - samplePricing.purchasePrice) / samplePricing.purchasePrice) * 100;
      const actualMargin = ((effectiveSelling - effectivePurchase) / effectivePurchase) * 100;
      
      console.log(`Product: ${samplePricing.product?.itemName}`);
      console.log(`Purchase: ₹${samplePricing.purchasePrice} ${purchaseDiscount > 0 ? `(-${purchaseDiscount}% = ₹${effectivePurchase.toFixed(2)})` : ''}`);
      console.log(`Selling: ₹${samplePricing.sellingPrice} ${salesDiscount > 0 ? `(-${salesDiscount}% = ₹${effectiveSelling.toFixed(2)})` : ''}`);
      console.log(`Margin: Basic ${basicMargin.toFixed(2)}% | Actual ${actualMargin.toFixed(2)}%`);
      console.log(`Profit: ₹${(effectiveSelling - effectivePurchase).toFixed(2)}`);
    }
    
    console.log('\n✅ Discount and margin display test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error in discount margin display test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from database');
  }
};

testDiscountMarginDisplay();