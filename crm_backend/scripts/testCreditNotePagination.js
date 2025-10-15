import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import CreditNote from '../models/CreditNote.js';
import Dealer from '../models/Dealer.js';
import DealerInvoice from '../models/DealerInvoice.js';
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
    // Get sagar dealer
    const sagarDealer = await Dealer.findOne({ code: 'DLR1004' });
    if (!sagarDealer) {
      console.log('Sagar dealer not found.');
      process.exit(1);
    }
    
    console.log(`Testing pagination for dealer: ${sagarDealer.name} (${sagarDealer.code})`);
    
    // Test pagination with different page sizes
    const testCases = [
      { page: 1, limit: 10 },
      { page: 2, limit: 10 },
      { page: 1, limit: 20 },
      { page: 2, limit: 20 }
    ];
    
    for (const testCase of testCases) {
      const { page, limit } = testCase;
      const skip = (page - 1) * limit;
      
      console.log(`\n--- Testing Page ${page}, Limit ${limit} ---`);
      
      // Get total count
      const total = await CreditNote.countDocuments({ dealer: sagarDealer._id });
      
      // Get paginated entries
      const creditNotes = await CreditNote.find({ dealer: sagarDealer._id })
        .populate('originalInvoice', 'invoiceNumber invoiceDate totalAmount')
        .populate('dealer', 'name code phone email address')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      const totalPages = Math.ceil(total / limit);
      
      console.log(`Total credit notes: ${total}`);
      console.log(`Total pages: ${totalPages}`);
      console.log(`Current page: ${page}`);
      console.log(`Credit notes on this page: ${creditNotes.length}`);
      console.log(`Showing entries ${skip + 1} to ${skip + creditNotes.length}`);
      
      if (creditNotes.length > 0) {
        console.log(`First credit note: ${creditNotes[0].creditNoteNumber} - ₹${creditNotes[0].creditAmount}`);
        console.log(`Last credit note: ${creditNotes[creditNotes.length - 1].creditNoteNumber} - ₹${creditNotes[creditNotes.length - 1].creditAmount}`);
      }
    }
    
  } catch (error) {
    console.error('Error testing pagination:', error);
  } finally {
    mongoose.connection.close();
  }
}).catch(error => {
  console.error('MongoDB connection error:', error);
});
