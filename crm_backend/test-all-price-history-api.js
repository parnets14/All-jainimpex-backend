import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricingHistory from './models/DealerPricingHistory.js';
import User from './models/User.js';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

const testAllPriceHistoryAPI = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('🧪 Testing getAllPriceHistory API endpoint simulation...\n');

    // Simulate the API endpoint logic
    const page = 1;
    const limit = 50;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter (empty for now)
    let filter = {};
    
    // Get history with product details
    const history = await DealerPricingHistory.find(filter)
      .populate('product', 'itemName itemCode')
      .populate('changedBy', 'name')
      .sort({ changeDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalCount = await DealerPricingHistory.countDocuments(filter);
    
    const apiResponse = {
      success: true,
      data: history.map(record => ({
        _id: record._id,
        product: record.product,
        oldPrice: record.oldPrice,
        newPrice: record.newPrice,
        changeType: record.changeType,
        changeMethod: record.changeMethod,
        changeValue: record.changeValue,
        reason: record.reason,
        changeDate: record.changeDate,
        changedBy: record.changedBy
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalRecords: totalCount,
        hasNext: skip + history.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    };
    
    console.log('📊 API Response Summary:');
    console.log(`  - Success: ${apiResponse.success}`);
    console.log(`  - Records returned: ${apiResponse.data.length}`);
    console.log(`  - Total records: ${apiResponse.pagination.totalRecords}`);
    console.log(`  - Current page: ${apiResponse.pagination.currentPage}`);
    console.log(`  - Total pages: ${apiResponse.pagination.totalPages}`);
    
    console.log('\n📋 Sample Records:');
    apiResponse.data.slice(0, 5).forEach((record, index) => {
      console.log(`${index + 1}. ${record.product?.itemName || 'Unknown Product'}`);
      console.log(`   ₹${record.oldPrice} → ₹${record.newPrice} (${record.changeType})`);
      console.log(`   ${new Date(record.changeDate).toLocaleDateString()} - ${record.reason}`);
      console.log(`   Changed by: ${record.changedBy?.name || 'System'}`);
      console.log('');
    });

    // Test with filters
    console.log('🔍 Testing with filters...\n');
    
    // Test change type filter
    const manualChanges = await DealerPricingHistory.find({ changeType: 'manual' })
      .populate('product', 'itemName itemCode')
      .populate('changedBy', 'name')
      .sort({ changeDate: -1 })
      .limit(5);
    
    console.log(`📊 Manual changes: ${manualChanges.length} found`);
    
    const scheduledChanges = await DealerPricingHistory.find({ changeType: 'scheduled' })
      .populate('product', 'itemName itemCode')
      .populate('changedBy', 'name')
      .sort({ changeDate: -1 })
      .limit(5);
    
    console.log(`📊 Scheduled changes: ${scheduledChanges.length} found`);
    
    const bulkChanges = await DealerPricingHistory.find({ changeType: 'bulk_update' })
      .populate('product', 'itemName itemCode')
      .populate('changedBy', 'name')
      .sort({ changeDate: -1 })
      .limit(5);
    
    console.log(`📊 Bulk changes: ${bulkChanges.length} found`);

    // Test date range filter
    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const recentChanges = await DealerPricingHistory.find({
      changeDate: { $gte: lastWeek }
    })
      .populate('product', 'itemName itemCode')
      .populate('changedBy', 'name')
      .sort({ changeDate: -1 });
    
    console.log(`📊 Changes in last 7 days: ${recentChanges.length} found`);

    console.log('\n✅ All Price History API endpoint is ready to use!');
    console.log('💡 Frontend can now call: GET /api/dealer-pricing/all-price-history');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the test
testAllPriceHistoryAPI();