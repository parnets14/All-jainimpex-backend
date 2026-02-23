import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';
import Product from './models/Product.js';

dotenv.config();

const verifyBFS001Logic = async () => {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const product = await Product.findOne({ productCode: 'BFS001' }).lean();
    const warehouseId = new mongoose.Types.ObjectId('68e8f0283f5fd5a817866df6');

    console.log('📊 UNDERSTANDING THE STOCK MOVEMENT LOGIC');
    console.log('='.repeat(80));
    console.log('\nLet\'s trace through each movement and see how balance changes:\n');

    const movements = await StockMovement.find({
      productId: product._id,
      warehouseId: warehouseId
    }).sort({ date: 1, createdAt: 1 }).lean();

    console.log('Movement History:');
    console.log('-'.repeat(80));
    
    movements.forEach((mov, index) => {
      const sign = mov.type === 'IN' ? '+' : '-';
      console.log(`${(index + 1).toString().padStart(2)}. [${mov.date.toISOString().split('T')[0]}] ${mov.type.padEnd(3)} ${sign}${mov.quantity.toString().padStart(3)} → Balance: ${mov.balance.toString().padStart(4)} | ${mov.referenceType}: ${mov.referenceNo}`);
      
      if (mov.referenceType === 'SALE') {
        console.log(`    └─ ${mov.remarks}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('🔍 KEY OBSERVATION:');
    console.log('='.repeat(80));
    
    console.log('\nWhen a SALE order is confirmed:');
    console.log('  - An OUT movement is created');
    console.log('  - The balance is REDUCED immediately');
    console.log('  - This means "Total Quantity" already reflects the blocked stock\n');

    console.log('Example from movements above:');
    console.log('  - Movement #4: SO-2026-0001 blocked 10 units');
    console.log('  - Balance went from 121 → 111');
    console.log('  - The 10 units are ALREADY DEDUCTED from total quantity\n');

    console.log('Therefore:');
    console.log('  ✅ Total Quantity (101) = Physical stock MINUS blocked stock');
    console.log('  ✅ Blocked Quantity (121) = Stock reserved for confirmed orders');
    console.log('  ✅ Net Stock = Total Quantity (already has blocked deducted)');
    console.log('  ❌ Net Stock ≠ Total Quantity - Blocked Quantity (would be double deduction!)\n');

    console.log('='.repeat(80));
    console.log('📊 CORRECT INTERPRETATION:');
    console.log('='.repeat(80));
    
    console.log('\nStarting Stock: 222 units (from GRNs)');
    console.log('Blocked for orders: -121 units');
    console.log('Current Total Quantity: 101 units (this is the AVAILABLE stock)\n');

    console.log('Blocked Quantity (121) is shown for INFORMATION only:');
    console.log('  - It tells you how much stock is reserved');
    console.log('  - But it\'s already been subtracted from Total Quantity\n');

    console.log('Net Stock = Total Quantity (no further deduction needed)');
    console.log('Net Stock = 101 units\n');

    console.log('But wait... the image shows Net Stock = -20');
    console.log('Let me check if there\'s a different calculation...\n');

    // Check if net stock calculation is different
    console.log('='.repeat(80));
    console.log('🔍 CHECKING NET STOCK CALCULATION IN IMAGE:');
    console.log('='.repeat(80));
    
    console.log('\nImage shows:');
    console.log('  Total Quantity: 101');
    console.log('  Blocked Quantity: 121');
    console.log('  Net Stock: -20\n');

    console.log('If Net Stock = Total Quantity - Blocked Quantity:');
    console.log('  Net Stock = 101 - 121 = -20 ✅ MATCHES!\n');

    console.log('But this means the system is doing DOUBLE DEDUCTION:');
    console.log('  1. First deduction: When order confirmed, balance reduced (121 → 101)');
    console.log('  2. Second deduction: Net Stock = Total - Blocked (101 - 121 = -20)\n');

    console.log('This creates confusion because:');
    console.log('  - Total Quantity (101) already has blocked stock removed');
    console.log('  - But then we subtract blocked again to get Net Stock');
    console.log('  - This makes Net Stock artificially negative\n');

    console.log('='.repeat(80));
    console.log('💡 WHAT SHOULD THE COLUMNS MEAN?');
    console.log('='.repeat(80));
    
    console.log('\nOption 1 (Current System - Confusing):');
    console.log('  Total Quantity: 101 (available stock after blocking)');
    console.log('  Blocked Quantity: 121 (reserved stock - already deducted)');
    console.log('  Net Stock: -20 (Total - Blocked = double deduction)\n');

    console.log('Option 2 (Clearer System):');
    console.log('  Total Quantity: 222 (physical stock in warehouse)');
    console.log('  Blocked Quantity: 121 (reserved for orders)');
    console.log('  Net Stock: 101 (available = Total - Blocked)\n');

    console.log('Option 3 (Alternative):');
    console.log('  Total Quantity: 101 (available stock)');
    console.log('  Blocked Quantity: 121 (reserved stock)');
    console.log('  Net Stock: 101 (same as Total, since blocking already applied)\n');

    console.log('='.repeat(80));
    console.log('❓ QUESTION FOR YOU:');
    console.log('='.repeat(80));
    console.log('\nWhat should each column represent in your business logic?');
    console.log('  A) Total Quantity = Physical stock before blocking?');
    console.log('  B) Total Quantity = Available stock after blocking?');
    console.log('  C) Something else?\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

verifyBFS001Logic();
