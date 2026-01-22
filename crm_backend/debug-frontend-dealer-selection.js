import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function debugDealerSelection() {
  try {
    console.log('🔍 DEBUGGING FRONTEND DEALER SELECTION ISSUE');
    console.log('=' .repeat(60));
    
    // Get all dealers
    const dealers = await Dealer.find({}).select('name dealerType code _id');
    console.log('📊 Total dealers in database:', dealers.length);
    
    // Filter Independent dealers (like frontend does)
    const independentDealers = dealers.filter(dealer => {
      const normalizedType = dealer.dealerType === 'Retailer' ? 'Retail' : dealer.dealerType;
      return normalizedType === 'Independent';
    });
    
    console.log('🎯 Independent dealers:', independentDealers.length);
    independentDealers.forEach(dealer => {
      console.log(`  - ${dealer.name} (${dealer.dealerType}) - ID: ${dealer._id}`);
    });
    
    // Check Suman dealer specifically
    const sumanDealer = dealers.find(d => d.name === 'Suman');
    if (sumanDealer) {
      console.log('\n🔍 Suman dealer details:');
      console.log('  Name:', sumanDealer.name);
      console.log('  Type:', sumanDealer.dealerType);
      console.log('  ID:', sumanDealer._id);
      console.log('  ID type:', typeof sumanDealer._id);
      console.log('  ID string:', sumanDealer._id.toString());
    } else {
      console.log('\n❌ Suman dealer not found!');
    }
    
    // Check Ravi dealer specifically
    const raviDealer = dealers.find(d => d.name === 'Ravi Ranjan Rai');
    if (raviDealer) {
      console.log('\n🔍 Ravi dealer details:');
      console.log('  Name:', raviDealer.name);
      console.log('  Type:', raviDealer.dealerType);
      console.log('  ID:', raviDealer._id);
      console.log('  ID type:', typeof raviDealer._id);
      console.log('  ID string:', raviDealer._id.toString());
    } else {
      console.log('\n❌ Ravi dealer not found!');
    }
    
    console.log('\n🔧 FRONTEND DEBUGGING SUGGESTIONS:');
    console.log('1. Check if onChange function is properly bound');
    console.log('2. Check if there are JavaScript errors in browser console');
    console.log('3. Verify that option._id exists and is correct type');
    console.log('4. Check if event propagation is being stopped somewhere');
    console.log('5. Verify that handleDealerChange function is defined in scope');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugDealerSelection();