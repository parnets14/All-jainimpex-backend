// Debug script to check specific sales order SO-2026-003
console.log('🔍 Debugging Sales Order SO-2026-003...\n');

// Simulate the exact data we can see from the screenshots
const salesOrderData = {
  orderNumber: 'SO-2026-003',
  status: 'Delivered', // This should be included in analytics
  products: [
    { productId: 'prod1', quantity: 10, itemName: 'product1' },
    { productId: 'prod2', quantity: 10, itemName: 'product2' }
  ],
  createdAt: new Date('2026-01-31') // Today's date from screenshot
};

console.log('📋 Sales Order Details:');
console.log(`   Order Number: ${salesOrderData.orderNumber}`);
console.log(`   Status: ${salesOrderData.status}`);
console.log(`   Created: ${salesOrderData.createdAt}`);
console.log(`   Products: ${salesOrderData.products.length}`);

salesOrderData.products.forEach((product, index) => {
  console.log(`     ${index + 1}. Product ID: ${product.productId}`);
  console.log(`        Quantity: ${product.quantity}`);
  console.log(`        Item Name: ${product.itemName}`);
});

// Check if this order should appear in 30-day analytics
const now = new Date();
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

console.log('\n🧪 Analytics Check:');
console.log(`   Current Date: ${now.toISOString().split('T')[0]}`);
console.log(`   30 Days Ago: ${thirtyDaysAgo.toISOString().split('T')[0]}`);
console.log(`   Order Date: ${salesOrderData.createdAt.toISOString().split('T')[0]}`);

const isWithinRange = salesOrderData.createdAt >= thirtyDaysAgo && salesOrderData.createdAt <= now;
const hasValidStatus = ['confirmed', 'delivered', 'completed'].includes(salesOrderData.status.toLowerCase());

console.log(`   Within 30 days: ${isWithinRange}`);
console.log(`   Valid Status: ${hasValidStatus} (${salesOrderData.status})`);
console.log(`   Should appear in analytics: ${isWithinRange && hasValidStatus}`);

// Check potential issues
console.log('\n⚠️ Potential Issues:');

if (!hasValidStatus) {
  console.log('   ❌ Status Issue: Order status "' + salesOrderData.status + '" might not match expected values');
  console.log('   Expected: confirmed, delivered, completed (lowercase)');
  console.log('   Actual: ' + salesOrderData.status + ' (case-sensitive check needed)');
}

if (!isWithinRange) {
  console.log('   ❌ Date Issue: Order is outside 30-day range');
}

// Check product ID format
console.log('\n🔍 Product ID Analysis:');
salesOrderData.products.forEach((product, index) => {
  console.log(`   Product ${index + 1}:`);
  console.log(`     ID: "${product.productId}" (type: ${typeof product.productId})`);
  console.log(`     Length: ${product.productId.length} characters`);
  console.log(`     Is String: ${typeof product.productId === 'string'}`);
});

// Simulate the exact API query that would be made
console.log('\n🔧 API Query Simulation:');
console.log('For product "prod1", the query would be:');
console.log(`
SalesOrder.aggregate([
  {
    $match: {
      createdAt: { $gte: ${thirtyDaysAgo.toISOString()}, $lte: ${now.toISOString()} }
      // No status filter (we removed it)
    }
  },
  { $unwind: '$products' },
  {
    $match: {
      'products.productId': 'prod1'
    }
  },
  {
    $group: {
      _id: '$products.productId',
      totalQuantity: { $sum: '$products.quantity' }
    }
  }
])
`);

console.log('Expected result: [{ _id: "prod1", totalQuantity: 10 }]');

console.log('\n📋 Troubleshooting Steps:');
console.log('1. Check if productId in database exactly matches "prod1" and "prod2"');
console.log('2. Verify order status is exactly "delivered" (case-sensitive)');
console.log('3. Confirm createdAt date is within last 30 days');
console.log('4. Check if products array exists and has correct structure');
console.log('5. Verify MongoDB connection and collection names');

console.log('\n✅ Debug Complete!');

// Test the actual status matching
const statusVariations = ['delivered', 'Delivered', 'DELIVERED', 'confirmed', 'completed'];
console.log('\n🔍 Status Matching Test:');
statusVariations.forEach(status => {
  const matches = ['confirmed', 'delivered', 'completed'].includes(status.toLowerCase());
  console.log(`   "${status}" -> matches: ${matches}`);
});

console.log('\n💡 Quick Fix Suggestion:');
console.log('If the issue persists, try this in your sales analytics API:');
console.log('1. Add console.log to see actual database query results');
console.log('2. Check if productId matching is case-sensitive');
console.log('3. Verify the aggregation pipeline is working correctly');