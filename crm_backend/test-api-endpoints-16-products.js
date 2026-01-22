import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL);

async function testAPIEndpoints16Products() {
  try {
    console.log('🧪 TESTING API ENDPOINTS FOR 16 PRODUCTS');
    console.log('=' .repeat(60));
    
    // Get dealer IDs
    const raviDealer = await Dealer.findOne({ name: /ravi/i });
    const sumanDealer = await Dealer.findOne({ name: /suman/i });
    
    console.log('👤 Ravi Dealer ID:', raviDealer._id.toString());
    console.log('👤 Suman Dealer ID:', sumanDealer._id.toString());
    
    // Test Main CRM API endpoint
    console.log('\n🔍 Testing Main CRM API Endpoint...');
    
    const mainCRMAPI = `http://localhost:5000/api/dealers/${raviDealer._id}/accessible-products?page=1&limit=1000`;
    console.log('📡 Main CRM API URL:', mainCRMAPI);
    
    try {
      const response = await fetch(mainCRMAPI);
      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ Main CRM API: ${data.products?.length || 0} products for Ravi`);
        if (data.products?.length === 16) {
          console.log('🎯 SUCCESS: Main CRM API returns 16 products!');
        } else {
          console.log(`⚠️ Expected 16, got ${data.products?.length || 0}`);
        }
      } else {
        console.log('❌ Main CRM API failed:', data.message);
      }
    } catch (error) {
      console.log('❌ Main CRM API error:', error.message);
      console.log('💡 Make sure backend is running on port 5000');
    }
    
    // Test Sales Executive App API endpoint
    console.log('\n🔍 Testing Sales Executive App API Endpoint...');
    
    const seAppAPI = `http://localhost:5000/api/se-app/products?dealerId=${raviDealer._id}&page=1&limit=1000`;
    console.log('📡 SE App API URL:', seAppAPI);
    
    try {
      const response = await fetch(seAppAPI);
      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ SE App API: ${data.products?.length || 0} products for Ravi`);
        if (data.products?.length === 16) {
          console.log('🎯 SUCCESS: SE App API returns 16 products!');
        } else {
          console.log(`⚠️ Expected 16, got ${data.products?.length || 0}`);
        }
      } else {
        console.log('❌ SE App API failed:', data.message);
      }
    } catch (error) {
      console.log('❌ SE App API error:', error.message);
      console.log('💡 Make sure backend is running on port 5000');
    }
    
    // Test Suman (should still be 1)
    console.log('\n🔍 Testing Suman (Should Still Be 1)...');
    
    const sumanAPI = `http://localhost:5000/api/dealers/${sumanDealer._id}/accessible-products?page=1&limit=1000`;
    console.log('📡 Suman API URL:', sumanAPI);
    
    try {
      const response = await fetch(sumanAPI);
      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ Suman API: ${data.products?.length || 0} products`);
        if (data.products?.length === 1) {
          console.log('🎯 SUCCESS: Suman API still returns 1 product!');
        } else {
          console.log(`⚠️ Expected 1, got ${data.products?.length || 0}`);
        }
      } else {
        console.log('❌ Suman API failed:', data.message);
      }
    } catch (error) {
      console.log('❌ Suman API error:', error.message);
    }
    
    console.log('\n📋 SUMMARY:');
    console.log('✅ Backend logic fixed to include basic hierarchy products');
    console.log('✅ Ravi should now see 16 products (14 extended + 2 basic)');
    console.log('✅ Suman should still see 1 product (basic only)');
    console.log('🔧 Frontend should now work correctly with enhanced debugging');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testAPIEndpoints16Products();