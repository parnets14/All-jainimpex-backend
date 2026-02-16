import dotenv from 'dotenv';
import mongoose from 'mongoose';
import axios from 'axios';

dotenv.config();

async function testStockAPI() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const productCode = '154154658';
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   TESTING STOCK API FOR PRODUCT ${productCode}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Test the stock API endpoint
    const response = await axios.get(`http://localhost:5173/api/stock`, {
      params: {
        search: productCode,
        page: 1,
        limit: 10
      }
    });

    if (response.data.success && response.data.data.length > 0) {
      const stockData = response.data.data[0];
      
      console.log('API Response for product:');
      console.log(JSON.stringify(stockData, null, 2));
      
      console.log('\n\nKey Values:');
      console.log(`Total Quantity: ${stockData.totalQty}`);
      console.log(`Damaged Quantity: ${stockData.damagedQty}`);
      console.log(`Net Stock: ${stockData.netStock}`);
      
      if (stockData.damagedQty === 2) {
        console.log('\n❌ CONFIRMED: API is returning damagedQty = 2');
        console.log('   This is the source of the frontend display issue');
      }
    } else {
      console.log('No stock data found for this product');
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

testStockAPI();
