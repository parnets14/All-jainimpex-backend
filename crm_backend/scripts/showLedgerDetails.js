import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import DealerLedger from '../models/DealerLedger.js';
import Dealer from '../models/Dealer.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('Connected to MongoDB\n');
  
  try {
    // Get the specific invoices from the screenshot
    const invoiceNumbers = ['INV-2026-0006', 'INV-2026-0008', 'INV-2026-0009'];
    
    for (const invoiceNum of invoiceNumbers) {
      const ledger = await DealerLedger.findOne({ invoiceNumber: invoiceNum }).populate('dealer');
      
      if (ledger) {
        console.log('='.repeat(80));
        console.log(`Invoice: ${ledger.invoiceNumber}`);
        console.log('='.repeat(80));
        console.log(`Dealer: ${ledger.dealer?.name} (${ledger.dealer?.code})`);
        console.log(`Sales Type: ${ledger.salesType || 'Not set'}`);
        console.log(`Credit Days Applied: ${ledger.creditDaysApplied || 0} days`);
        console.log(`Credit Days (field): ${ledger.creditDays || 0} days`);
        console.log(`\nDealer Configuration:`);
        console.log(`  - creditDaysRegular: ${ledger.dealer?.creditDaysRegular || 0} days`);
        console.log(`  - creditDaysCD: ${ledger.dealer?.creditDaysCD || 0} days`);
        console.log(`  - creditDays (legacy): ${ledger.dealer?.creditDays || 0} days`);
        console.log(`\nEntry Date: ${ledger.entryDate}`);
        console.log(`Due Date: ${ledger.dueDate}`);
        console.log('');
      } else {
        console.log(`Invoice ${invoiceNum} not found\n`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.connection.close();
  }
}).catch(error => {
  console.error('MongoDB connection error:', error);
});
