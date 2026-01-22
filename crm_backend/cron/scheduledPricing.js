import cron from 'node-cron';
import DealerPricingSchedule from '../models/DealerPricingSchedule.js';

// Run every hour to check for scheduled price changes
const scheduledPricingJob = cron.schedule('0 * * * *', async () => {
  console.log('🕐 Running scheduled pricing job...');
  
  try {
    const result = await DealerPricingSchedule.applyScheduledChanges();
    
    if (result.appliedCount > 0 || result.failedCount > 0) {
      console.log(`✅ Scheduled pricing job completed: ${result.appliedCount} applied, ${result.failedCount} failed`);
    }
  } catch (error) {
    console.error('❌ Scheduled pricing job failed:', error);
  }
}, {
  scheduled: false, // Don't start automatically
  timezone: "Asia/Kolkata"
});

// Function to start the cron job
export const startScheduledPricingJob = () => {
  scheduledPricingJob.start();
  console.log('🚀 Scheduled pricing cron job started (runs every hour)');
};

// Function to stop the cron job
export const stopScheduledPricingJob = () => {
  scheduledPricingJob.stop();
  console.log('🛑 Scheduled pricing cron job stopped');
};

export default scheduledPricingJob;