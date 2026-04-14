import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';

dotenv.config();

const getModels = (dbConnection) => {
  return {
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema)
  };
};

const main = async () => {
  try {
    const dbConnection = getCompanyConnection('jain-impex');
    const { DealerInvoice } = getModels(dbConnection);
    
    const invoice = await DealerInvoice.findOne({ invoiceNumber: 'INV-2026-0001' }).lean();
    
    console.log('\n📋 Invoice Details:');
    console.log(JSON.stringify(invoice, null, 2));
    
    console.log('\n💰 Key Fields:');
    console.log('Total Amount:', invoice.totalAmount);
    console.log('Subtotal:', invoice.subtotal);
    console.log('GST Amount:', invoice.gstAmount);
    console.log('Status:', invoice.status);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

main();
