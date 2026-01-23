import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerPricingHistory from './models/DealerPricingHistory.js';
import User from './models/User.js';

// Load environment variables
dotenv.config();

const createHistoryForCurrentProducts = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get a user for the history records
    const user = await User.findOne();
    if (!user) {
      console.log('❌ No users found');
      return;
    }

    console.log(`👤 Using user: ${user.name}`);

    // Create history for the specific products from your console logs
    const productHistories = [
      {
        productId: '6971ee886ff1360e0143a587', // wire belts
        productName: 'wire belts',
        histories: [
          {
            oldPrice: 100,
            newPrice: 110,
            changeType: 'manual',
            changeMethod: 'increase_amount',
            changeValue: 10,
            reason: 'Market price adjustment',
            changeDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
          },
          {
            oldPrice: 110,
            newPrice: 120,
            changeType: 'scheduled',
            changeMethod: 'increase_percentage',
            changeValue: 9.09,
            reason: 'Quarterly price review',
            changeDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) // 15 days ago
          },
          {
            oldPrice: 120,
            newPrice: 125,
            changeType: 'bulk_update',
            changeMethod: 'increase_amount',
            changeValue: 5,
            reason: 'Supplier cost increase',
            changeDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
          }
        ]
      },
      {
        productId: '6971b32839870bccbb5cc5c1', // Wire Links
        productName: 'Wire Links',
        histories: [
          {
            oldPrice: 85,
            newPrice: 90,
            changeType: 'manual',
            changeMethod: 'increase_amount',
            changeValue: 5,
            reason: 'Raw material cost increase',
            changeDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000) // 25 days ago
          },
          {
            oldPrice: 90,
            newPrice: 95,
            changeType: 'scheduled',
            changeMethod: 'increase_percentage',
            changeValue: 5.56,
            reason: 'Monthly price adjustment',
            changeDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
          }
        ]
      },
      {
        productId: '696dbcde28b5f6168171ec4b', // product2
        productName: 'product2',
        histories: [
          {
            oldPrice: 200,
            newPrice: 210,
            changeType: 'bulk_update',
            changeMethod: 'increase_percentage',
            changeValue: 5,
            reason: 'Category-wide price increase',
            changeDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) // 20 days ago
          },
          {
            oldPrice: 210,
            newPrice: 215,
            changeType: 'manual',
            changeMethod: 'increase_amount',
            changeValue: 5,
            reason: 'Quality improvement cost',
            changeDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
          }
        ]
      },
      {
        productId: '696cea0a0588aebfaecac617', // h cpvc brass elbow 3/4x1/2"
        productName: 'h cpvc brass elbow 3/4x1/2"',
        histories: [
          {
            oldPrice: 201,
            newPrice: 205.02,
            changeType: 'scheduled',
            changeMethod: 'increase_percentage',
            changeValue: 2,
            reason: 'Scheduled price increase - January 23, 2026',
            changeDate: new Date('2026-01-23') // Today's scheduled change
          },
          {
            oldPrice: 195,
            newPrice: 201,
            changeType: 'manual',
            changeMethod: 'increase_amount',
            changeValue: 6,
            reason: 'Raw material cost adjustment',
            changeDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // 14 days ago
          },
          {
            oldPrice: 190,
            newPrice: 195,
            changeType: 'bulk_update',
            changeMethod: 'increase_percentage',
            changeValue: 2.63,
            reason: 'Category-wide price revision',
            changeDate: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000) // 28 days ago
          }
        ]
      }
    ];

    // Also create history for any other products that exist
    console.log('\n🔍 Finding other products to create history for...');
    
    // Get product IDs from the console log pattern
    const additionalProductIds = [
      // Add more product IDs if you can see them in your console
    ];

    // Create history records
    for (const productHistory of productHistories) {
      console.log(`\n📦 Creating history for: ${productHistory.productName} (${productHistory.productId})`);
      
      for (const history of productHistory.histories) {
        try {
          const historyRecord = await DealerPricingHistory.create({
            product: new mongoose.Types.ObjectId(productHistory.productId),
            oldPrice: history.oldPrice,
            newPrice: history.newPrice,
            changeType: history.changeType,
            changeMethod: history.changeMethod,
            changeValue: history.changeValue,
            reason: history.reason,
            changedBy: user._id,
            changeDate: history.changeDate
          });
          
          console.log(`  ✅ Created: ₹${history.oldPrice} → ₹${history.newPrice} (${history.changeType})`);
        } catch (error) {
          console.error(`  ❌ Error creating history:`, error.message);
        }
      }
    }

    // Test the history retrieval for wire belts
    console.log('\n🧪 Testing history retrieval for wire belts...');
    const wirebeltsHistory = await DealerPricingHistory.find({ 
      product: new mongoose.Types.ObjectId('6971ee886ff1360e0143a587') 
    }).sort({ changeDate: -1 });
    
    console.log(`📊 Found ${wirebeltsHistory.length} history records for wire belts:`);
    wirebeltsHistory.forEach((record, index) => {
      console.log(`  ${index + 1}. ₹${record.oldPrice} → ₹${record.newPrice}`);
      console.log(`     ${record.changeType} (${record.changeMethod})`);
      console.log(`     ${record.changeDate.toLocaleDateString()}`);
      console.log(`     ${record.reason}`);
      console.log('');
    });

    // Show total history records
    const totalHistory = await DealerPricingHistory.countDocuments();
    console.log(`\n📊 Total price history records in database: ${totalHistory}`);

    console.log('\n✅ Price history created successfully!');
    console.log('💡 Now try clicking the "History" button next to "wire belts" in the frontend');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the script
createHistoryForCurrentProducts();