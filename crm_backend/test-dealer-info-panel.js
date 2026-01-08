import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

// Test credentials
const TEST_USER = {
  email: 'admin@jainimpex.com',
  password: 'Admin@123'
};

let authToken = '';

// Login and get token
async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await axios.post(`${API_BASE_URL}/users/login`, TEST_USER);
    
    if (response.data.success && response.data.token) {
      authToken = response.data.token;
      console.log('✅ Login successful');
      console.log('Token:', authToken.substring(0, 20) + '...');
      return true;
    } else {
      console.error('❌ Login failed:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Login error:', error.response?.data || error.message);
    return false;
  }
}

// Get all dealers
async function getDealers() {
  try {
    console.log('\n📋 Fetching dealers...');
    const response = await axios.get(`${API_BASE_URL}/dealers`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.data.success && response.data.dealers) {
      console.log(`✅ Found ${response.data.dealers.length} dealers`);
      return response.data.dealers;
    }
    return [];
  } catch (error) {
    console.error('❌ Error fetching dealers:', error.response?.data || error.message);
    return [];
  }
}

// Test dealer complete info endpoint
async function testDealerCompleteInfo(dealerId, dealerName) {
  try {
    console.log(`\n🔍 Testing Dealer Complete Info for: ${dealerName}`);
    console.log(`Dealer ID: ${dealerId}`);
    
    const response = await axios.get(`${API_BASE_URL}/dealers/${dealerId}/complete-info`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.data.success) {
      console.log('✅ API Response successful\n');
      
      const { dealer, creditStatus, lastPurchase, paymentStatus, availableDiscounts, summary } = response.data;
      
      // Display Dealer Info
      console.log('📊 DEALER INFORMATION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Name: ${dealer.name}`);
      console.log(`Code: ${dealer.code}`);
      console.log(`Type: ${dealer.dealerType}`);
      console.log(`Credit Limit: ₹${dealer.creditLimit.toLocaleString()}`);
      console.log(`Credit Days: ${dealer.creditDays} days`);
      
      // Display Credit Status
      console.log('\n💳 CREDIT STATUS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Status: ${creditStatus.status.toUpperCase()}`);
      console.log(`Credit Limit: ₹${creditStatus.creditLimit.toLocaleString()}`);
      console.log(`Current Outstanding: ₹${creditStatus.currentOutstanding.toLocaleString()}`);
      console.log(`Available Credit: ₹${creditStatus.availableCredit.toLocaleString()}`);
      console.log(`Utilization: ${creditStatus.utilizationPercent}%`);
      
      // Display visual progress bar
      const barLength = 40;
      const filledLength = Math.round((creditStatus.utilizationPercent / 100) * barLength);
      const emptyLength = barLength - filledLength;
      const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
      
      let statusColor = '';
      if (creditStatus.status === 'good') statusColor = '🟢';
      else if (creditStatus.status === 'warning') statusColor = '🟡';
      else if (creditStatus.status === 'exceeded') statusColor = '🔴';
      
      console.log(`Progress: [${bar}] ${statusColor}`);
      
      // Display Last Purchase
      console.log('\n🛒 LAST PURCHASE');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      if (lastPurchase) {
        console.log(`Order Number: ${lastPurchase.orderNumber}`);
        console.log(`Date: ${new Date(lastPurchase.orderDate).toLocaleDateString('en-IN')}`);
        console.log(`Amount: ₹${lastPurchase.orderAmount.toLocaleString()}`);
        console.log(`Products: ${lastPurchase.productCount} items`);
        console.log(`Status: ${lastPurchase.status}`);
        if (lastPurchase.products && lastPurchase.products.length > 0) {
          console.log('Products:');
          lastPurchase.products.forEach((p, i) => {
            console.log(`  ${i + 1}. ${p.name} (Qty: ${p.quantity})`);
          });
        }
      } else {
        console.log('No previous purchases');
      }
      
      // Display Payment Status
      console.log('\n💰 PAYMENT STATUS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Status: ${paymentStatus.status.toUpperCase()}`);
      console.log(`Total Outstanding: ₹${paymentStatus.totalOutstanding.toLocaleString()}`);
      console.log(`Overdue Amount: ₹${paymentStatus.overdueAmount.toLocaleString()}`);
      if (paymentStatus.lastPaymentDate) {
        console.log(`Last Payment Date: ${new Date(paymentStatus.lastPaymentDate).toLocaleDateString('en-IN')}`);
        console.log(`Last Payment Amount: ₹${paymentStatus.lastPaymentAmount.toLocaleString()}`);
      }
      console.log(`Can Create Order: ${paymentStatus.canCreateOrder ? '✅ YES' : '❌ NO'}`);
      if (paymentStatus.blockReason) {
        console.log(`Block Reason: ${paymentStatus.blockReason}`);
      }
      
      // Display Available Discounts
      console.log('\n🎁 AVAILABLE DISCOUNTS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      if (availableDiscounts && availableDiscounts.length > 0) {
        console.log(`Found ${availableDiscounts.length} active discounts:`);
        availableDiscounts.forEach((discount, i) => {
          console.log(`\n${i + 1}. ${discount.discountName}`);
          console.log(`   Type: ${discount.discountType}`);
          console.log(`   Target: ${discount.targetType} - ${discount.targetName}`);
          if (discount.directDiscountPercentage) {
            console.log(`   Discount: ${discount.directDiscountPercentage}%`);
          }
          if (discount.levels && discount.levels.length > 0) {
            console.log(`   Levels: ${discount.levels.length} levels available`);
          }
          console.log(`   Valid: ${new Date(discount.validFrom).toLocaleDateString('en-IN')} to ${new Date(discount.validTo).toLocaleDateString('en-IN')}`);
        });
      } else {
        console.log('No active discounts available');
      }
      
      // Display Summary
      console.log('\n📈 SUMMARY STATISTICS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Total Orders: ${summary.totalOrders}`);
      console.log(`Total Purchase Value: ₹${summary.totalPurchaseValue.toLocaleString()}`);
      console.log(`Average Order Value: ₹${summary.averageOrderValue.toLocaleString()}`);
      if (summary.lastOrderDaysAgo !== null) {
        console.log(`Last Order: ${summary.lastOrderDaysAgo} days ago`);
      }
      
      // Overall Assessment
      console.log('\n🎯 OVERALL ASSESSMENT');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      if (!paymentStatus.canCreateOrder) {
        console.log('🚫 ORDER CREATION BLOCKED');
        console.log(`Reason: ${paymentStatus.blockReason}`);
        console.log('Action Required: Collect payment before creating new orders');
      } else if (creditStatus.status === 'warning') {
        console.log('⚠️  PROCEED WITH CAUTION');
        console.log('Credit utilization is high. Consider collecting payment.');
      } else {
        console.log('✅ GOOD STANDING');
        console.log('Dealer is in good standing. Safe to create orders.');
      }
      
      return true;
    } else {
      console.error('❌ API returned unsuccessful response');
      return false;
    }
  } catch (error) {
    console.error('❌ Error testing dealer complete info:', error.response?.data || error.message);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     DEALER INFORMATION PANEL - API TEST                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  // Step 1: Login
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.error('\n❌ Cannot proceed without authentication');
    return;
  }
  
  // Step 2: Get dealers
  const dealers = await getDealers();
  if (dealers.length === 0) {
    console.error('\n❌ No dealers found to test');
    return;
  }
  
  // Step 3: Test with first 3 dealers
  console.log(`\n📊 Testing with ${Math.min(3, dealers.length)} dealers...\n`);
  
  for (let i = 0; i < Math.min(3, dealers.length); i++) {
    const dealer = dealers[i];
    await testDealerCompleteInfo(dealer._id, dealer.name);
    
    if (i < Math.min(3, dealers.length) - 1) {
      console.log('\n' + '═'.repeat(60) + '\n');
    }
  }
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     TEST COMPLETED                                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
