/**
 * fix-missing-expiry.js
 * Backfills missing expiry dates for all Pending orders that have no expiry set.
 * Run: node fix-missing-expiry.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGO_URL);
console.log('✅ Connected to MongoDB\n');

const SalesOrder = (await import('./models/SalesOrder.js')).default;

const expiry = new Date();
expiry.setDate(expiry.getDate() + 15);

const orders = await SalesOrder.find({
  status: 'Pending',
  expiryDate: null,
  isExpired: { $ne: true }
});

console.log(`Found ${orders.length} Pending order(s) with no expiry date.\n`);

let fixed = 0;
for (const order of orders) {
  order.expiryDate = expiry;
  order.expiryReason = 'Automatic 15-day expiry (backfilled)';
  order.isExpired = false;
  order.expiryHistory.push({
    action: 'set',
    previousDate: null,
    newDate: expiry,
    reason: 'Backfilled: auto-expiry was missing on creation',
    performedAt: new Date()
  });
  await order.save();
  console.log(`✅ ${order.orderNumber} — expiry set to ${expiry.toLocaleDateString()}`);
  fixed++;
}

console.log(`\nDone. Fixed ${fixed} order(s).`);
await mongoose.connection.close();
