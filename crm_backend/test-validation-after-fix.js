// Test Comprehensive Validation After Enum Fix
import mongoose from 'mongoose';
import { validateAndSyncAllPricing } from './controllers/dealerPricingController.js';

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://parnetstech14:parnets14@jainimpexcrm.grb5bho.mongodb.net/?retryWrites=true&w=majority&appName=JainImpexCRM');
    console.log('✅ Connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testValidation = async () => {
  try {
    console.log('🧪 Testing Comprehensive Validation After Enum Fix...');
    
    // Mock request and response objects
    const mockReq = { user: { _id: null } };
    const mockRes = {
      json: (data) => {
        console.log('📊 Validation Response:', data);
        return data;
      },
      status: (code) => ({
        json: (data) => {
          console.log(`❌ Error Response (${code}):`, data);
          return data;
        }
      })
    };
    
    // Run the validation
    await validateAndSyncAllPricing(mockReq, mockRes);
    
    console.log('✅ Comprehensive validation test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
};

// Run the test
connectDB().then(() => testValidation());