import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricingHistory from './models/DealerPricingHistory.js';
import User from './models/User.js';

// Load environment variables
dotenv.config();

const testHCpvcBrassElbowHistory = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    const productId = '696cea0a0588aebfaecac617'; // h cpvc brass elbow 3/4x1/2"
    
    console.log(`🧪 Testing price history for: h cpvc brass elbow 3/4x1/2"`);
    console.log(`📦 Product ID: ${productId}`);
    
    // Test the history retrieval (same as API endpoint)
    const history = await DealerPricingHistory.find({ 
      product: new mongoose.Types.ObjectId(productId) 
    })
    .populate('changedBy', 'name')
    .sort({ changeDate: -1 });
    
    console.log(`\n📊 Found ${history.length} history records:`);
    
    if (history.length === 0) {
      console.log('❌ No history records found!');
    } else {
      history.forEach((record, index) => {
        console.log(`\n${index + 1}. Price Change:`);
        console.log(`   ₹${record.oldPrice} → ₹${record.newPrice}`);
        console.log(`   Change Type: ${record.changeType}`);
        console.log(`   Method: ${record.changeMethod}`);
        console.log(`   Value: ${record.changeValue}`);
        console.log(`   Date: ${record.changeDate.toLocaleDateString()}`);
        console.log(`   Reason: ${record.reason}`);
        console.log(`   Changed By: ${record.changedBy?.name || 'Unknown'}`);
      });
    }

    // Also test the API response format
    console.log('\n🔧 API Response Format:');
    const apiResponse = {
      success: true,
      data: history.map(record => ({
        _id: record._id,
        oldPrice: record.oldPrice,
        newPrice: record.newPrice,
        changeType: record.changeType,
        changeMethod: record.changeMethod,
        changeValue: record.changeValue,
        reason: record.reason,
        changeDate: record.changeDate,
        changedBy: record.changedBy
      }))
    };
    
    console.log(JSON.stringify(apiResponse, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the test
testHCpvcBrassElbowHistory();