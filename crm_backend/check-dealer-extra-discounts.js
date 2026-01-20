import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Connect to MongoDB
const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_impex_crm';
console.log('Connecting to MongoDB...');
mongoose.connect(mongoUrl, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Import Dealer model
import Dealer from './models/Dealer.js';

async function checkDealerExtraDiscounts() {
  try {
    console.log('🔍 Checking dealer extra discounts...\n');
    
    // Find the dealer "Ayush Rawat" with code "DLR1001"
    const dealer = await Dealer.findOne({ 
      $or: [
        { name: /Ayush Rawat/i },
        { code: 'DLR1001' }
      ]
    });
    
    if (!dealer) {
      console.log('❌ Dealer not found');
      process.exit(0);
    }
    
    console.log('✅ Dealer found:', dealer.name, '(' + dealer.code + ')');
    console.log('\n📊 Dealer Extra Discounts:');
    console.log('Has extraDiscounts field:', !!dealer.extraDiscounts);
    console.log('Extra discounts count:', dealer.extraDiscounts?.length || 0);
    
    if (dealer.extraDiscounts && dealer.extraDiscounts.length > 0) {
      console.log('\n💰 Configured Extra Discounts:');
      dealer.extraDiscounts.forEach((discount, index) => {
        console.log(`\n${index + 1}. ${discount.targetName || 'Unnamed'}`);
        console.log(`   - Target Type: ${discount.targetType}`);
        console.log(`   - Target ID: ${discount.targetId}`);
        console.log(`   - Discount: ${discount.discountPercentage}%`);
        console.log(`   - Active: ${discount.isActive !== false ? 'Yes' : 'No'}`);
        console.log(`   - Description: ${discount.description || 'N/A'}`);
      });
    } else {
      console.log('\n❌ No extra discounts configured for this dealer');
    }
    
    console.log('\n✅ Check complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDealerExtraDiscounts();
