import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getExtendedSubcategories } from './controllers/extendedSubcategoryController.js';

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testExtendedAPIResponse = async () => {
  try {
    console.log('\n🧪 Testing Extended Subcategory API Response Format...\n');

    // Mock request and response objects
    const mockReq = {
      query: {
        limit: 1000
      },
      user: {
        id: new mongoose.Types.ObjectId()
      }
    };

    const mockRes = {
      json: (data) => {
        console.log('📊 API Response Structure:');
        console.log(`   Success: ${data.success}`);
        console.log(`   Items Count: ${data.items?.length || 0}`);
        console.log(`   Has Pagination: ${!!data.pagination}`);
        
        if (data.items && data.items.length > 0) {
          console.log('\n📋 Sample Items:');
          data.items.slice(0, 3).forEach((item, index) => {
            console.log(`\n   Item ${index + 1}:`);
            console.log(`   - Name: ${item.name}`);
            console.log(`   - Level: ${item.level}`);
            console.log(`   - Brand: ${item.brand?.name || 'Not populated'} (${item.brand})`);
            console.log(`   - Category: ${item.category?.name || 'Not populated'} (${item.category})`);
            console.log(`   - Subcategory: ${item.subcategory?.name || 'Not populated'} (${item.subcategory})`);
          });
        }
        
        console.log('\n✅ API Response Test Complete');
        return data;
      },
      status: (code) => ({
        json: (data) => {
          console.log(`❌ Error Response (${code}):`, data);
          return data;
        }
      })
    };

    // Test the API controller function
    await getExtendedSubcategories(mockReq, mockRes);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

const main = async () => {
  await connectDB();
  await testExtendedAPIResponse();
  await mongoose.disconnect();
  console.log('\n👋 Disconnected from MongoDB');
};

main().catch(console.error);