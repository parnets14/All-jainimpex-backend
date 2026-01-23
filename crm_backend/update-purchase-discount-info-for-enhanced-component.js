// Update purchase discount information for enhanced component
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricing from './models/DealerPricing.js';
import PurchaseDiscountMapping from './models/PurchaseDiscountMapping.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import SupplierInvoice from './models/SupplierInvoice.js';
import DealerPricingHistory from './models/DealerPricingHistory.js';
import DealerPricingSchedule from './models/DealerPricingSchedule.js';

dotenv.config();

const updatePurchaseDiscountInfo = async () => {
  try {
    console.log('🔄 Updating purchase discount information for enhanced component...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Update all pricing records with purchase discount information
    console.log('📊 Updating purchase discount info for all pricing records...');
    
    const updatedCount = await DealerPricing.updateAllDiscountInfo();
    
    console.log(`✅ Updated discount information for ${updatedCount} pricing records\n`);

    // Check the results
    console.log('📋 Checking updated results...');
    
    const stats = await DealerPricing.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          withSalesDiscount: { $sum: { $cond: ['$hasDirectDiscount', 1, 0] } },
          withPurchaseDiscount: { $sum: { $cond: ['$purchaseDiscountInfo.hasDirectDiscount', 1, 0] } },
          withScheduledChanges: { $sum: { $cond: ['$hasScheduledChange', 1, 0] } },
          avgGrossMargin: { $avg: '$grossMargin' },
          avgNetMargin: { $avg: '$netMargin' },
          avgEffectivePurchasePrice: { $avg: '$effectivePurchasePrice' }
        }
      }
    ]);

    if (stats.length > 0) {
      const stat = stats[0];
      console.log(`- Total Products: ${stat.totalProducts}`);
      console.log(`- With Sales Discounts: ${stat.withSalesDiscount} (${((stat.withSalesDiscount / stat.totalProducts) * 100).toFixed(1)}%)`);
      console.log(`- With Purchase Discounts: ${stat.withPurchaseDiscount} (${((stat.withPurchaseDiscount / stat.totalProducts) * 100).toFixed(1)}%)`);
      console.log(`- With Scheduled Changes: ${stat.withScheduledChanges} (${((stat.withScheduledChanges / stat.totalProducts) * 100).toFixed(1)}%)`);
      console.log(`- Average Gross Margin: ${stat.avgGrossMargin?.toFixed(2)}%`);
      console.log(`- Average Net Margin: ${stat.avgNetMargin?.toFixed(2)}%`);
      console.log(`- Average Effective Purchase Price: ₹${stat.avgEffectivePurchasePrice?.toFixed(2)}`);
    }

    // Show some sample updated records
    console.log('\n📋 Sample updated records:');
    
    const samples = await DealerPricing.find({ isActive: true })
      .populate('product', 'name code')
      .populate({
        path: 'product',
        populate: { path: 'brand', select: 'name' }
      })
      .limit(3);

    samples.forEach((sample, index) => {
      console.log(`\n${index + 1}. ${sample.product?.name} (${sample.product?.code})`);
      console.log(`   - Brand: ${sample.product?.brand?.name}`);
      console.log(`   - Purchase Price: ₹${sample.purchasePrice} → Effective: ₹${sample.effectivePurchasePrice}`);
      console.log(`   - Selling Price: ₹${sample.sellingPrice} → Effective: ₹${sample.effectiveSellingPrice}`);
      console.log(`   - Gross Margin: ${sample.grossMargin?.toFixed(2)}% → Net Margin: ${sample.netMargin?.toFixed(2)}%`);
      console.log(`   - Sales Discount: ${sample.hasDirectDiscount ? sample.directDiscountPercentage + '%' : 'None'}`);
      console.log(`   - Purchase Discount: ${sample.purchaseDiscountInfo?.hasDirectDiscount ? sample.purchaseDiscountInfo.directDiscountPercentage + '%' : 'None'}`);
      console.log(`   - Purchase Discount Source: ${sample.purchaseDiscountInfo?.discountSource || 'N/A'}`);
      console.log(`   - Margin Range: ${sample.marginRange?.min?.toFixed(2)}% - ${sample.marginRange?.max?.toFixed(2)}%`);
    });

    console.log('\n✅ Purchase discount information updated successfully!');
    console.log('🚀 Enhanced Dealer Product Pricing Component is ready to use!');

  } catch (error) {
    console.error('❌ Update failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the update
updatePurchaseDiscountInfo();