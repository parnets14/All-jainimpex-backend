import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import DealerLedger from '../models/DealerLedger.js';
import Dealer from '../models/Dealer.js';

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
      const total = await DealerLedger.countDocuments({ dealer: sagarDealer._id });
      
      // Get paginated entries
      const entries = await DealerLedger.find({ dealer: sagarDealer._id })
        .sort({ entryDate: 1 })
        .skip(skip)
        .limit(limit);
      
      const totalPages = Math.ceil(total / limit);
      
      console.log(`Total entries: ${total}`);
      console.log(`Total pages: ${totalPages}`);
      console.log(`Current page: ${page}`);
      console.log(`Entries on this page: ${entries.length}`);
      console.log(`Showing entries ${skip + 1} to ${skip + entries.length}`);
      
      if (entries.length > 0) {
        console.log(`First entry: ${entries[0].transactionType} - ${entries[0].invoiceNumber || entries[0].creditNoteNumber}`);
        console.log(`Last entry: ${entries[entries.length - 1].transactionType} - ${entries[entries.length - 1].invoiceNumber || entries[entries.length - 1].creditNoteNumber}`);
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




















