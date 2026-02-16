import axios from 'axios';

const testStockAPI = async () => {
  try {
    const baseURL = 'http://localhost:5000/api';
    const productCode = '15454636';

    console.log(`\n🔍 Testing Stock API for product: ${productCode}`);
    console.log('='.repeat(70));

    // Test the stock endpoint
    const response = await axios.get(`${baseURL}/stock`, {
      params: {
        productCode: productCode
      }
    });

    console.log(`\n✅ API Response Status: ${response.status}`);
    
    if (response.data && response.data.length > 0) {
      const stockData = response.data[0];
      
      console.log(`\n📊 Stock Data from API:`);
      console.log(`   Product: ${stockData.productCode} - ${stockData.itemName}`);
      console.log(`   Warehouse: ${stockData.warehouseName}`);
      console.log(`   Total Quantity: ${stockData.totalQty}`);
      console.log(`   Damaged Quantity: ${stockData.damagedQty}`);
      console.log(`   Blocked Quantity: ${stockData.blockedQty}`);
      console.log(`   Net Stock: ${stockData.netStock}`);

      console.log(`\n🔍 Analysis:`);
      
      // Expected values
      const expectedDamaged = 9;
      const expectedNetStock = 100;
      
      if (stockData.damagedQty === expectedDamaged) {
        console.log(`   ✅ Damaged Quantity is CORRECT: ${stockData.damagedQty}`);
      } else {
        console.log(`   ❌ Damaged Quantity is WRONG: ${stockData.damagedQty} (expected ${expectedDamaged})`);
      }

      if (stockData.netStock === expectedNetStock) {
        console.log(`   ✅ Net Stock is CORRECT: ${stockData.netStock}`);
      } else {
        console.log(`   ❌ Net Stock is WRONG: ${stockData.netStock} (expected ${expectedNetStock})`);
      }

      // Check if backend is using old code
      if (stockData.netStock < 0 || stockData.netStock !== expectedNetStock) {
        console.log(`\n⚠️  BACKEND IS USING OLD CODE!`);
        console.log(`   The backend needs to be restarted to load the new code.`);
        console.log(`\n   Steps to restart:`);
        console.log(`   1. Go to the terminal running the backend`);
        console.log(`   2. Press Ctrl+C to stop it`);
        console.log(`   3. Run: node server.js`);
      } else {
        console.log(`\n✅ Backend is using the NEW CODE - fix is working!`);
      }

    } else {
      console.log(`\n❌ No stock data found for product ${productCode}`);
    }

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error(`\n❌ Cannot connect to backend at http://localhost:5000`);
      console.error(`   Make sure the backend is running!`);
    } else {
      console.error(`\n❌ Error:`, error.message);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Data:`, error.response.data);
      }
    }
  }
};

testStockAPI();
