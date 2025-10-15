import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import DealerLedger from '../models/DealerLedger.js';
import Dealer from '../models/Dealer.js';
import User from '../models/User.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL).then(async () => {
  console.log('Connected to MongoDB');
  
  try {
    // Get a user to use as createdBy
    let user = await User.findOne({ role: 'super_admin' });
    if (!user) {
      user = await User.findOne();
      if (!user) {
        console.log('No users found. Creating a dummy user ID...');
        user = { _id: new mongoose.Types.ObjectId() };
      }
    }
    console.log('Using user:', user.email || 'Dummy User', 'as createdBy');
    
    // Get sagar dealer
    const sagarDealer = await Dealer.findOne({ code: 'DLR1004' });
    if (!sagarDealer) {
      console.log('Sagar dealer not found. Please create dealers first.');
      process.exit(1);
    }
    
    console.log(`Found dealer: ${sagarDealer.name} (${sagarDealer.code})`);
    
    // Get the last entry for running balance calculation
    const lastEntry = await DealerLedger.findOne(
      { dealer: sagarDealer._id },
      {},
      { sort: { 'createdAt': -1 } }
    );
    
    let previousBalance = 0;
    if (lastEntry) {
      previousBalance = lastEntry.runningBalance;
    }
    
    console.log(`Current balance: ₹${previousBalance}`);
    
    // Create 25 test ledger entries
    const entries = [];
    const baseDate = new Date('2025-01-01');
    
    for (let i = 1; i <= 25; i++) {
      const entryDate = new Date(baseDate);
      entryDate.setDate(baseDate.getDate() + i);
      
      const isInvoice = i % 3 !== 0; // Every 3rd entry is a credit note
      const amount = Math.floor(Math.random() * 10000) + 1000; // Random amount between 1000-11000
      
      if (isInvoice) {
        // Create invoice entry
        previousBalance += amount;
        entries.push({
          dealer: sagarDealer._id,
          dealerName: sagarDealer.name,
          dealerCode: sagarDealer.code,
          entryDate: entryDate,
          transactionType: "Invoice",
          invoiceNumber: `TEST-INV-${i.toString().padStart(3, '0')}`,
          invoiceValue: amount,
          debitAmount: amount,
          creditAmount: 0,
          runningBalance: previousBalance,
          description: `Test Invoice ${i}`,
          creditDays: 30,
          dueDate: new Date(entryDate.getTime() + (30 * 24 * 60 * 60 * 1000)),
          pointsEarned: Math.floor(amount / 100),
          schemeAmount: Math.floor(amount * 0.05),
          createdBy: user._id
        });
      } else {
        // Create credit note entry
        previousBalance -= amount;
        entries.push({
          dealer: sagarDealer._id,
          dealerName: sagarDealer.name,
          dealerCode: sagarDealer.code,
          entryDate: entryDate,
          transactionType: "Credit Note",
          creditNoteNumber: `TEST-CN-${i.toString().padStart(3, '0')}`,
          creditAmount: amount,
          debitAmount: 0,
          runningBalance: previousBalance,
          description: `Test Credit Note ${i}`,
          remarks: `Test payment for invoice ${i-1}`,
          paymentMethod: ['Cash', 'UPI', 'Cheque', 'Bank Transfer'][Math.floor(Math.random() * 4)],
          createdBy: user._id
        });
      }
    }
    
    // Insert all entries
    await DealerLedger.insertMany(entries);
    
    console.log(`✅ Created ${entries.length} test ledger entries for ${sagarDealer.name}`);
    console.log(`Final balance: ₹${previousBalance}`);
    
    // Verify the count
    const totalEntries = await DealerLedger.countDocuments({ dealer: sagarDealer._id });
    console.log(`Total entries for ${sagarDealer.name}: ${totalEntries}`);
    
  } catch (error) {
    console.error('Error creating test data:', error);
  } finally {
    mongoose.connection.close();
  }
}).catch(error => {
  console.error('MongoDB connection error:', error);
});
