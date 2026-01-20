import cron from 'node-cron';
import DiscountMapping from '../models/DiscountMapping.js';

// Cron job to automatically expire discounts
// Runs every day at 12:01 AM (00:01)
const scheduleDiscountExpiration = () => {
  cron.schedule('1 0 * * *', async () => {
    try {
      console.log('🕒 Running scheduled discount expiration check...');
      
      const expiredCount = await DiscountMapping.expireDiscounts();
      
      if (expiredCount > 0) {
        console.log(`✅ Scheduled expiration completed: ${expiredCount} discounts expired`);
      } else {
        console.log('✅ Scheduled expiration completed: No discounts to expire');
      }
    } catch (error) {
      console.error('❌ Error in scheduled discount expiration:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Adjust timezone as needed
  });
  
  console.log('🕒 Discount expiration cron job scheduled (daily at 12:01 AM IST)');
};

// Manual function to expire discounts (can be called from API)
export const expireDiscountsManually = async () => {
  try {
    console.log('🕒 Manual discount expiration triggered...');
    
    const expiredCount = await DiscountMapping.expireDiscounts();
    
    console.log(`✅ Manual expiration completed: ${expiredCount} discounts expired`);
    return expiredCount;
  } catch (error) {
    console.error('❌ Error in manual discount expiration:', error);
    throw error;
  }
};

export default scheduleDiscountExpiration;