import mongoose from 'mongoose';
import Dealer from '../models/Dealer.js';
import DealerInvoice from '../models/DealerInvoice.js';
import CreditNote from '../models/CreditNote.js';
import User from '../models/User.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jaininpexcrm', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB');
  
  try {
    // Check what data exists
    const dealers = await Dealer.find({});
    const invoices = await DealerInvoice.find({});
    const creditNotes = await CreditNote.find({});
    const users = await User.find({});
    
    console.log(`\nDatabase Summary:`);
    console.log(`- Dealers: ${dealers.length}`);
    console.log(`- Invoices: ${invoices.length}`);
    console.log(`- Credit Notes: ${creditNotes.length}`);
    console.log(`- Users: ${users.length}`);
    
    if (dealers.length > 0) {
      console.log(`\nDealers:`);
      dealers.forEach(dealer => {
        console.log(`  - ${dealer.code}: ${dealer.name}`);
      });
    }
    
    if (invoices.length > 0) {
      console.log(`\nInvoices:`);
      invoices.forEach(invoice => {
        console.log(`  - ${invoice.invoiceNumber}: ${invoice.dealerName} (₹${invoice.totalAmount})`);
      });
    }
    
    if (creditNotes.length > 0) {
      console.log(`\nCredit Notes:`);
      creditNotes.forEach(cn => {
        console.log(`  - ${cn.creditNoteNumber}: ${cn.dealerName} (₹${cn.creditAmount})`);
      });
    }
    
    if (users.length > 0) {
      console.log(`\nUsers:`);
      users.forEach(user => {
        console.log(`  - ${user.email}: ${user.role}`);
      });
    }
    
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    mongoose.connection.close();
  }
}).catch(error => {
  console.error('MongoDB connection error:', error);
});