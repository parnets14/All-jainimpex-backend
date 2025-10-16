import mongoose from 'mongoose';
import DebitNote from './models/DebitNote.js';

mongoose.connect('mongodb://localhost:27017/crm_backend')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Get all debit notes
    const debitNotes = await DebitNote.find({})
      .populate('supplier', 'name code')
      .populate('supplierInvoice', 'invoiceNumber')
      .sort({ debitNoteDate: -1 });
    
    console.log('All Debit Notes:');
    debitNotes.forEach(dn => {
      console.log(`- ${dn.debitNoteNumber} | Supplier: ${dn.supplier?.name} | Invoice: ${dn.supplierInvoice?.invoiceNumber || 'N/A'} | Status: ${dn.status}`);
    });
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
