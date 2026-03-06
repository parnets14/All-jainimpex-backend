// Quick test script for balance sheet endpoint
import axios from 'axios';

const BASE_URL = 'http://localhost:5000'; // Change if your backend runs on different port

async function testBalanceSheet() {
  try {
    console.log('🧪 Testing Balance Sheet API...\n');
    
    // First, login to get token (update credentials as needed)
    console.log('1️⃣ Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@example.com', // Update with your admin credentials
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful\n');
    
    // Test balance sheet generation
    console.log('2️⃣ Generating balance sheet...');
    const balanceSheetResponse = await axios.get(
      `${BASE_URL}/api/balance-sheet/generate`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          asOfDate: new Date().toISOString().split('T')[0]
        }
      }
    );
    
    console.log('✅ Balance sheet generated successfully!\n');
    console.log('📊 Summary:');
    console.log('   Total Assets:', balanceSheetResponse.data.data.summary.totalAssets);
    console.log('   Total Liabilities:', balanceSheetResponse.data.data.summary.totalLiabilities);
    console.log('   Total Equity:', balanceSheetResponse.data.data.summary.totalEquity);
    console.log('   Is Balanced:', balanceSheetResponse.data.data.summary.isBalanced);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data?.stack) {
      console.error('\n📋 Stack trace:', error.response.data.stack);
    }
  }
}

testBalanceSheet();
