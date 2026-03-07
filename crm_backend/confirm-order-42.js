// Script to confirm order 42 via API
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function confirmOrder42() {
  try {
    console.log('🔄 Attempting to confirm order SO-2026-0042...\n');

    // You'll need to get a valid JWT token first
    // For now, let's just show what the API call would look like
    
    const orderId = '69ab169ed48c714508811585'; // Order 42 ID
    const apiUrl = 'http://localhost:5000/api/sales-orders/' + orderId + '/status';
    
    console.log('API Endpoint:', apiUrl);
    console.log('Method: PATCH');
    console.log('Body:', JSON.stringify({
      status: 'Confirmed',
      remarks: 'Confirming approved order'
    }, null, 2));
    
    console.log('\n📝 To confirm this order manually:');
    console.log('1. Get your JWT token from browser (check Application > Local Storage)');
    console.log('2. Use Postman or curl:');
    console.log(`
curl -X PATCH http://localhost:5000/api/sales-orders/${orderId}/status \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -d '{"status": "Confirmed", "remarks": "Confirming approved order"}'
    `);
    
    console.log('\n✅ If the backend is working correctly, this should:');
    console.log('   1. Change order status to "Confirmed"');
    console.log('   2. Create ledger entry blocking ₹2,77,200');
    console.log('   3. Block stock in warehouse');
    console.log('   4. Send notification to dealer');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

confirmOrder42();
