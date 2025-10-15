import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import CreditNote from '../models/CreditNote.js';
import DealerInvoice from '../models/DealerInvoice.js';
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
    
    // Get invoices for sagar dealer
    const invoices = await DealerInvoice.find({ dealer: sagarDealer._id }).limit(5);
    if (invoices.length === 0) {
      console.log('No invoices found for sagar dealer. Please create invoices first.');
      process.exit(1);
    }
    
    console.log(`Found ${invoices.length} invoices for sagar dealer`);
    
    // Create 25 test credit notes
    const creditNotes = [];
    const baseDate = new Date('2025-01-01');
    const paymentMethods = ['Cash', 'UPI', 'Cheque', 'Bank Transfer'];
    const statuses = ['Pending', 'Approved', 'Partial', 'Rejected'];
    const reasons = [
      'Product defect',
      'Late delivery',
      'Wrong item shipped',
      'Damaged goods',
      'Customer complaint',
      'Quality issue',
      'Return request',
      'Discount adjustment'
    ];
    
    for (let i = 1; i <= 25; i++) {
      const invoice = invoices[i % invoices.length]; // Cycle through invoices
      const creditNoteDate = new Date(baseDate);
      creditNoteDate.setDate(baseDate.getDate() + i);
      
      const amount = Math.floor(Math.random() * 5000) + 500; // Random amount between 500-5500
      const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const reason = reasons[Math.floor(Math.random() * reasons.length)];
      
      const creditNoteData = {
        originalInvoice: invoice._id,
        originalInvoiceNumber: invoice.invoiceNumber,
        creditNoteNumber: `TEST-CN-${i.toString().padStart(3, '0')}`,
        dealer: sagarDealer._id,
        dealerName: sagarDealer.name,
        dealerCode: sagarDealer.code,
        creditAmount: amount,
        creditReason: reason,
        status: status,
        paymentMethod: paymentMethod,
        originalInvoiceAmount: invoice.totalAmount,
        remainingAmount: invoice.totalAmount - amount,
        createdBy: user._id
      };
      
      // Add payment method specific details
      if (paymentMethod === 'Cheque') {
        creditNoteData.chequeDetails = {
          chequeNo: `CHQ${i.toString().padStart(4, '0')}`,
          bankName: 'Test Bank',
          chequeDate: creditNoteDate,
          chequeAmount: amount,
          remarks: `Test cheque ${i}`
        };
      } else if (paymentMethod === 'UPI') {
        creditNoteData.upiDetails = {
          upiId: `test${i}@paytm`,
          transactionId: `UPI${i.toString().padStart(6, '0')}`,
          remarks: `Test UPI ${i}`
        };
      } else if (paymentMethod === 'Bank Transfer') {
        creditNoteData.bankTransferDetails = {
          bankName: 'Test Bank',
          accountNumber: `123456789${i}`,
          transactionId: `BT${i.toString().padStart(6, '0')}`,
          remarks: `Test bank transfer ${i}`
        };
      }
      
      creditNotes.push(creditNoteData);
    }
    
    // Insert all credit notes
    await CreditNote.insertMany(creditNotes);
    
    console.log(`✅ Created ${creditNotes.length} test credit notes for ${sagarDealer.name}`);
    
    // Verify the count
    const totalCreditNotes = await CreditNote.countDocuments({ dealer: sagarDealer._id });
    console.log(`Total credit notes for ${sagarDealer.name}: ${totalCreditNotes}`);
    
    // Test pagination
    console.log('\n--- Testing Pagination ---');
    const testCases = [
      { page: 1, limit: 10 },
      { page: 2, limit: 10 },
      { page: 1, limit: 20 }
    ];
    
    for (const testCase of testCases) {
      const { page, limit } = testCase;
      const skip = (page - 1) * limit;
      
      const paginatedNotes = await CreditNote.find({ dealer: sagarDealer._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      console.log(`Page ${page}, Limit ${limit}: ${paginatedNotes.length} credit notes`);
    }
    
  } catch (error) {
    console.error('Error creating test data:', error);
  } finally {
    mongoose.connection.close();
  }
}).catch(error => {
  console.error('MongoDB connection error:', error);
});
