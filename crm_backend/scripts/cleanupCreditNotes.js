import mongoose from 'mongoose';
import CreditNote from '../models/CreditNote.js';
import dotenv from 'dotenv';

dotenv.config();

async function cleanupCreditNotes() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');
    
    // Find credit notes with NaN in the number
    const nanCreditNotes = await CreditNote.find({ creditNoteNumber: { $regex: 'NaN' } });
    console.log('Found credit notes with NaN:', nanCreditNotes.length);
    
    if (nanCreditNotes.length > 0) {
      console.log('Credit notes with NaN:');
      nanCreditNotes.forEach(cn => {
        console.log(`- ${cn._id}: ${cn.creditNoteNumber}`);
      });
      
      // Delete credit notes with NaN numbers
      const deleteResult = await CreditNote.deleteMany({ creditNoteNumber: { $regex: 'NaN' } });
      console.log(`Deleted ${deleteResult.deletedCount} credit notes with NaN numbers`);
    }
    
    // Check the latest credit note number
    const latestCreditNote = await CreditNote.findOne({}, {}, { sort: { 'createdAt': -1 } });
    if (latestCreditNote) {
      console.log(`Latest credit note: ${latestCreditNote.creditNoteNumber}`);
    } else {
      console.log('No credit notes found');
    }
    
    // Count total credit notes
    const totalCount = await CreditNote.countDocuments();
    console.log(`Total credit notes: ${totalCount}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

cleanupCreditNotes();
