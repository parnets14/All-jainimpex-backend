/**
 * PAYMENT ALLOCATION TEST SCRIPT
 * 
 * This script demonstrates what happens during payment allocation
 * Run this to see database changes step by step
 * 
 * Usage: node test-payment-allocation.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Mock models (simplified versions)
const VoucherSchema = new mongoose.Schema({
  voucherNumber: String,
  voucherType: String,
  totalAmount: Number,
  allocatedAmount: { type: Number, default: 0 },
  unallocatedAmount: Number,
  status: String,
  partyId: mongoose.Schema.Types.ObjectId,
  partyName: String,
  allocations: [{
    invoiceId: mongoose.Schema.Types.ObjectId,
    invoiceNumber: String,
    allocatedAmount: Number
  }]
});

const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: String,
  dealer: mongoose.Schema.Types.ObjectId,
  totalAmount: Number,
  paidAmount: { type: Number, default: 0 },
  pendingAmount: Number,
  paymentStatus: String
});

const AllocationSchema = new mongoose.Schema({
  allocationNumber: String,
  voucherId: mongoose.Schema.Types.ObjectId,
  voucherNumber: String,
  totalAllocated: Number,
  allocations: [{
    invoiceId: mongoose.Schema.Types.ObjectId,
    invoiceNumber: String,
    allocatedAmount: Number,
    paymentStatus: String
  }]
});

const Voucher = mongoose.model('TestVoucher', VoucherSchema);
const Invoice = mongoose.model('TestInvoice', InvoiceSchema);
const Allocation = mongoose.model('TestAllocation', AllocationSchema);

// Helper function to print section
function printSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80) + '\n');
}

// Helper function to print object
function printObject(label, obj) {
  console.log(`${label}:`);
  console.log(JSON.stringify(obj, null, 2));
  console.log('');
}

async function runTest() {
  try {
    // Connect to database
    const mongoUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/test-payment-allocation';
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected to database');

    // Clean up previous test data
    await Voucher.deleteMany({});
    await Invoice.deleteMany({});
    await Allocation.deleteMany({});
    console.log('✅ Cleaned up previous test data\n');

    // ========================================================================
    // STEP 1: CREATE INITIAL DATA
    // ========================================================================
    printSection('STEP 1: CREATE INITIAL DATA');

    const dealerId = new mongoose.Types.ObjectId();
    
    // Create voucher (payment received)
    const voucher = await Voucher.create({
      voucherNumber: 'RCP-TEST-0001',
      voucherType: 'Receipt',
      totalAmount: 10000,
      allocatedAmount: 0,
      unallocatedAmount: 10000,
      status: 'Posted',
      partyId: dealerId,
      partyName: 'Test Dealer',
      allocations: []
    });

    printObject('✅ Voucher Created', {
      voucherNumber: voucher.voucherNumber,
      totalAmount: voucher.totalAmount,
      allocatedAmount: voucher.allocatedAmount,
      unallocatedAmount: voucher.unallocatedAmount,
      status: voucher.status
    });

    // Create invoices
    const invoice1 = await Invoice.create({
      invoiceNumber: 'INV-TEST-0001',
      dealer: dealerId,
      totalAmount: 5000,
      paidAmount: 0,
      pendingAmount: 5000,
      paymentStatus: 'Pending'
    });

    const invoice2 = await Invoice.create({
      invoiceNumber: 'INV-TEST-0002',
      dealer: dealerId,
      totalAmount: 3000,
      paidAmount: 0,
      pendingAmount: 3000,
      paymentStatus: 'Pending'
    });

    printObject('✅ Invoice 1 Created', {
      invoiceNumber: invoice1.invoiceNumber,
      totalAmount: invoice1.totalAmount,
      paidAmount: invoice1.paidAmount,
      pendingAmount: invoice1.pendingAmount,
      paymentStatus: invoice1.paymentStatus
    });

    printObject('✅ Invoice 2 Created', {
      invoiceNumber: invoice2.invoiceNumber,
      totalAmount: invoice2.totalAmount,
      paidAmount: invoice2.paidAmount,
      pendingAmount: invoice2.pendingAmount,
      paymentStatus: invoice2.paymentStatus
    });

    console.log('💡 EXPLANATION:');
    console.log('   - Voucher has ₹10,000 unallocated (payment received but not linked to invoices)');
    console.log('   - Invoice 1 has ₹5,000 pending');
    console.log('   - Invoice 2 has ₹3,000 pending');
    console.log('   - Total outstanding: ₹8,000');

    // ========================================================================
    // STEP 2: ALLOCATE PAYMENT TO INVOICES
    // ========================================================================
    printSection('STEP 2: ALLOCATE PAYMENT TO INVOICES');

    console.log('🎯 ACTION: Allocating ₹7,000 from voucher to invoices');
    console.log('   - ₹5,000 to Invoice 1 (full payment)');
    console.log('   - ₹2,000 to Invoice 2 (partial payment)');
    console.log('');

    // Create allocation record
    const allocation = await Allocation.create({
      allocationNumber: 'ALLOC-TEST-0001',
      voucherId: voucher._id,
      voucherNumber: voucher.voucherNumber,
      totalAllocated: 7000,
      allocations: [
        {
          invoiceId: invoice1._id,
          invoiceNumber: invoice1.invoiceNumber,
          allocatedAmount: 5000,
          paymentStatus: 'Paid'
        },
        {
          invoiceId: invoice2._id,
          invoiceNumber: invoice2.invoiceNumber,
          allocatedAmount: 2000,
          paymentStatus: 'Partial'
        }
      ]
    });

    printObject('✅ Allocation Record Created', {
      allocationNumber: allocation.allocationNumber,
      voucherNumber: allocation.voucherNumber,
      totalAllocated: allocation.totalAllocated,
      allocations: allocation.allocations.map(a => ({
        invoiceNumber: a.invoiceNumber,
        allocatedAmount: a.allocatedAmount,
        paymentStatus: a.paymentStatus
      }))
    });

    // Update voucher
    voucher.allocatedAmount = 7000;
    voucher.unallocatedAmount = 3000;
    voucher.allocations = [
      {
        invoiceId: invoice1._id,
        invoiceNumber: invoice1.invoiceNumber,
        allocatedAmount: 5000
      },
      {
        invoiceId: invoice2._id,
        invoiceNumber: invoice2.invoiceNumber,
        allocatedAmount: 2000
      }
    ];
    await voucher.save();

    printObject('✅ Voucher Updated', {
      voucherNumber: voucher.voucherNumber,
      totalAmount: voucher.totalAmount,
      allocatedAmount: voucher.allocatedAmount,
      unallocatedAmount: voucher.unallocatedAmount,
      allocationsCount: voucher.allocations.length
    });

    // Update invoice 1
    invoice1.paidAmount = 5000;
    invoice1.pendingAmount = 0;
    invoice1.paymentStatus = 'Paid';
    await invoice1.save();

    printObject('✅ Invoice 1 Updated', {
      invoiceNumber: invoice1.invoiceNumber,
      totalAmount: invoice1.totalAmount,
      paidAmount: invoice1.paidAmount,
      pendingAmount: invoice1.pendingAmount,
      paymentStatus: invoice1.paymentStatus
    });

    // Update invoice 2
    invoice2.paidAmount = 2000;
    invoice2.pendingAmount = 1000;
    invoice2.paymentStatus = 'Partial';
    await invoice2.save();

    printObject('✅ Invoice 2 Updated', {
      invoiceNumber: invoice2.invoiceNumber,
      totalAmount: invoice2.totalAmount,
      paidAmount: invoice2.paidAmount,
      pendingAmount: invoice2.pendingAmount,
      paymentStatus: invoice2.paymentStatus
    });

    console.log('💡 EXPLANATION:');
    console.log('   - Voucher now has ₹7,000 allocated and ₹3,000 unallocated');
    console.log('   - Invoice 1 is fully paid (₹5,000/₹5,000)');
    console.log('   - Invoice 2 is partially paid (₹2,000/₹3,000)');
    console.log('   - Remaining ₹3,000 in voucher can be allocated later');

    // ========================================================================
    // STEP 3: SUMMARY
    // ========================================================================
    printSection('STEP 3: FINAL SUMMARY');

    console.log('📊 VOUCHER STATUS:');
    console.log(`   Total Amount:       ₹${voucher.totalAmount.toLocaleString('en-IN')}`);
    console.log(`   Allocated Amount:   ₹${voucher.allocatedAmount.toLocaleString('en-IN')}`);
    console.log(`   Unallocated Amount: ₹${voucher.unallocatedAmount.toLocaleString('en-IN')}`);
    console.log('');

    console.log('📊 INVOICE STATUS:');
    console.log(`   Invoice 1: ${invoice1.paymentStatus} (₹${invoice1.paidAmount}/₹${invoice1.totalAmount})`);
    console.log(`   Invoice 2: ${invoice2.paymentStatus} (₹${invoice2.paidAmount}/₹${invoice2.totalAmount})`);
    console.log('');

    console.log('💰 MONEY FLOW:');
    console.log('   1. Dealer paid ₹10,000 (voucher created)');
    console.log('   2. ₹7,000 allocated to invoices');
    console.log('   3. ₹3,000 remains unallocated (advance payment)');
    console.log('');

    console.log('🔍 WHAT HAPPENED IN DEALER LEDGER:');
    console.log('   - When voucher created: CREDIT entry of ₹10,000');
    console.log('   - When allocated: NO NEW ENTRY (just bookkeeping)');
    console.log('   - Ledger shows payment immediately, allocation is just linking');
    console.log('');

    console.log('✅ TEST COMPLETED SUCCESSFULLY!');
    console.log('');
    console.log('📖 For detailed explanation, see: PAYMENT_ALLOCATION_DEBUG_GUIDE.md');

    // ========================================================================
    // STEP 4: DEMONSTRATE SECOND ALLOCATION
    // ========================================================================
    printSection('BONUS: SECOND ALLOCATION FROM SAME VOUCHER');

    console.log('🎯 ACTION: Allocating remaining ₹3,000 to Invoice 2');
    console.log('');

    // Create second allocation
    const allocation2 = await Allocation.create({
      allocationNumber: 'ALLOC-TEST-0002',
      voucherId: voucher._id,
      voucherNumber: voucher.voucherNumber,
      totalAllocated: 1000,
      allocations: [
        {
          invoiceId: invoice2._id,
          invoiceNumber: invoice2.invoiceNumber,
          allocatedAmount: 1000,
          paymentStatus: 'Paid'
        }
      ]
    });

    // Update voucher
    voucher.allocatedAmount = 8000;
    voucher.unallocatedAmount = 2000;
    voucher.allocations.push({
      invoiceId: invoice2._id,
      invoiceNumber: invoice2.invoiceNumber,
      allocatedAmount: 1000
    });
    await voucher.save();

    // Update invoice 2
    invoice2.paidAmount = 3000;
    invoice2.pendingAmount = 0;
    invoice2.paymentStatus = 'Paid';
    await invoice2.save();

    printObject('✅ Second Allocation Created', {
      allocationNumber: allocation2.allocationNumber,
      totalAllocated: allocation2.totalAllocated
    });

    printObject('✅ Voucher After Second Allocation', {
      voucherNumber: voucher.voucherNumber,
      totalAmount: voucher.totalAmount,
      allocatedAmount: voucher.allocatedAmount,
      unallocatedAmount: voucher.unallocatedAmount
    });

    printObject('✅ Invoice 2 After Second Allocation', {
      invoiceNumber: invoice2.invoiceNumber,
      totalAmount: invoice2.totalAmount,
      paidAmount: invoice2.paidAmount,
      pendingAmount: invoice2.pendingAmount,
      paymentStatus: invoice2.paymentStatus
    });

    console.log('💡 EXPLANATION:');
    console.log('   - Same voucher can be allocated multiple times');
    console.log('   - Invoice 2 now fully paid (₹3,000/₹3,000)');
    console.log('   - Voucher still has ₹2,000 unallocated');
    console.log('');

    console.log('✅ BONUS TEST COMPLETED!');

  } catch (error) {
    console.error('❌ Error during test:', error);
    console.error(error.stack);
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

// Run the test
console.log('\n🚀 STARTING PAYMENT ALLOCATION TEST\n');
runTest();
