import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricingSchedule from './models/DealerPricingSchedule.js';
import DealerPricing from './models/DealerPricing.js';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

const testScheduledPricing = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    const now = new Date();
    console.log(`🕐 Current time: ${now.toISOString()}`);
    console.log(`📅 Today's date: ${now.toDateString()}`);

    // Check for scheduled changes that should be applied
    const scheduledChanges = await DealerPricingSchedule.find({
      status: 'Scheduled',
      effectiveDate: { $lte: now },
      isActive: true
    }).populate('product', 'itemName productCode');

    console.log(`\n🔍 Found ${scheduledChanges.length} scheduled changes that should be applied:`);
    
    if (scheduledChanges.length === 0) {
      console.log('ℹ️ No scheduled changes found for today or earlier dates');
      
      // Check all scheduled changes regardless of date
      const allScheduled = await DealerPricingSchedule.find({
        status: 'Scheduled',
        isActive: true
      }).populate('product', 'itemName productCode').sort({ effectiveDate: 1 });
      
      console.log(`\n📋 All scheduled changes (${allScheduled.length}):`);
      allScheduled.forEach((schedule, index) => {
        console.log(`  ${index + 1}. ${schedule.product.itemName} (${schedule.product.productCode})`);
        console.log(`     Current: ₹${schedule.currentPrice} → New: ₹${schedule.newPrice}`);
        console.log(`     Effective Date: ${schedule.effectiveDate.toISOString()}`);
        console.log(`     Status: ${schedule.status}`);
        console.log(`     Change Type: ${schedule.changeType} (${schedule.changeValue})`);
        console.log('');
      });
    } else {
      // Show scheduled changes that should be applied
      scheduledChanges.forEach((schedule, index) => {
        console.log(`  ${index + 1}. ${schedule.product.itemName} (${schedule.product.productCode})`);
        console.log(`     Current: ₹${schedule.currentPrice} → New: ₹${schedule.newPrice}`);
        console.log(`     Effective Date: ${schedule.effectiveDate.toISOString()}`);
        console.log(`     Status: ${schedule.status}`);
        console.log(`     Change Type: ${schedule.changeType} (${schedule.changeValue})`);
        console.log('');
      });

      // Apply the scheduled changes
      console.log('🚀 Applying scheduled changes...');
      const result = await DealerPricingSchedule.applyScheduledChanges();
      
      console.log(`\n✅ Scheduled changes applied:`);
      console.log(`   - Successfully applied: ${result.appliedCount}`);
      console.log(`   - Failed: ${result.failedCount}`);
      
      if (result.appliedCount > 0) {
        console.log('\n🔄 Checking updated pricing records...');
        
        // Check the updated pricing records
        for (const schedule of scheduledChanges) {
          const pricing = await DealerPricing.findOne({
            product: schedule.product._id,
            isActive: true
          }).populate('product', 'itemName productCode');
          
          if (pricing) {
            console.log(`✅ ${pricing.product.itemName}: Updated to ₹${pricing.sellingPrice}`);
          } else {
            console.log(`❌ ${schedule.product.itemName}: No pricing record found`);
          }
        }
      }
    }

    // Check if there are any pricing records that need to be updated
    console.log('\n🔍 Checking pricing records with scheduled changes...');
    const pricingWithScheduled = await DealerPricing.find({
      hasScheduledChange: true,
      isActive: true
    }).populate('product', 'itemName productCode');

    console.log(`📊 Found ${pricingWithScheduled.length} pricing records with scheduled changes:`);
    pricingWithScheduled.forEach((pricing, index) => {
      console.log(`  ${index + 1}. ${pricing.product.itemName} (${pricing.product.productCode})`);
      console.log(`     Current Price: ₹${pricing.sellingPrice}`);
      console.log(`     Next Scheduled Price: ₹${pricing.nextScheduledPrice || 'N/A'}`);
      console.log(`     Next Scheduled Date: ${pricing.nextScheduledDate ? pricing.nextScheduledDate.toISOString() : 'N/A'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testScheduledPricing();