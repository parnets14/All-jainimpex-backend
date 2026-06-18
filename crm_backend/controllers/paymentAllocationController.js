import { paymentAllocationSchema } from '../models/PaymentAllocation.js';
import { voucherSchema } from '../models/Voucher.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';
import { generateAllocationNumber } from '../services/voucherNumberService.js';

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    PaymentAllocation: dbConnection.models.PaymentAllocation || 
                       dbConnection.model('PaymentAllocation', paymentAllocationSchema),
    Voucher: dbConnection.models.Voucher || 
             dbConnection.model('Voucher', voucherSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || 
                   dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    SupplierInvoice: dbConnection.models.SupplierInvoice || 
                   dbConnection.model('SupplierInvoice', supplierInvoiceSchema)
  };
};

/**
 * Create payment allocation
 * POST /api/payment-allocations
 */
export const createPaymentAllocation = async (req, res) => {
  try {
    const { PaymentAllocation, Voucher, DealerInvoice, SupplierInvoice } = getModels(req.dbConnection);
    const {
      voucherId,
      allocations
    } = req.body;
    
    // Validate
    if (!voucherId || !allocations || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Voucher ID and allocations are required'
      });
    }
    
    // Get voucher
    const voucher = await Voucher.findById(voucherId);
    
    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    // Pick the right invoice collection based on who the voucher is for.
    // Supplier vouchers (Payments) allocate against purchase invoices.
    const isSupplier = voucher.partyType === 'Supplier';
    const InvoiceModel = isSupplier ? SupplierInvoice : DealerInvoice;
    
    if (voucher.status !== 'Posted') {
      return res.status(400).json({
        success: false,
        message: 'Can only allocate posted vouchers'
      });
    }
    
    // Calculate unallocatedAmount on-the-fly if undefined (for legacy vouchers)
    const allocatedAmount = voucher.allocatedAmount || 0;
    const unallocatedAmount = voucher.unallocatedAmount !== undefined 
      ? voucher.unallocatedAmount 
      : voucher.totalAmount - allocatedAmount;
    
    // Initialize fields if they were undefined
    if (voucher.allocatedAmount === undefined) {
      voucher.allocatedAmount = 0;
    }
    if (voucher.unallocatedAmount === undefined) {
      voucher.unallocatedAmount = voucher.totalAmount;
    }
    
    // Calculate total allocation
    const totalAllocated = allocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
    
    // Check if allocation exceeds unallocated amount
    if (totalAllocated > unallocatedAmount) {
      return res.status(400).json({
        success: false,
        message: `Total allocation (₹${totalAllocated}) exceeds unallocated amount (₹${unallocatedAmount})`
      });
    }
    
    // Validate and prepare allocations
    const preparedAllocations = [];
    
    for (const alloc of allocations) {
      const invoice = await InvoiceModel.findById(alloc.invoiceId);
      
      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: `Invoice ${alloc.invoiceNumber} not found`
        });
      }
      
      const previouslyPaid = invoice.paidAmount || 0;
      const remainingAmount = invoice.totalAmount - previouslyPaid - alloc.allocatedAmount;
      
      if (remainingAmount < 0) {
        return res.status(400).json({
          success: false,
          message: `Allocation for invoice ${invoice.invoiceNumber} exceeds pending amount`
        });
      }
      
      preparedAllocations.push({
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        invoiceAmount: invoice.totalAmount,
        previouslyPaid,
        allocatedAmount: alloc.allocatedAmount,
        remainingAmount,
        paymentStatus: remainingAmount === 0 ? 'Full' : 'Partial'
      });
    }
    
    // Generate allocation number
    const allocationNumber = await generateAllocationNumber(new Date(), req.dbConnection);
    
    // Create payment allocation
    const paymentAllocation = new PaymentAllocation({
      allocationNumber,
      allocationDate: new Date(),
      voucherId: voucher._id,
      voucherNumber: voucher.voucherNumber,
      voucherType: voucher.voucherType,
      totalAmount: voucher.totalAmount,
      partyId: voucher.partyId,
      partyType: voucher.partyType,
      partyName: voucher.partyName,
      allocations: preparedAllocations,
      totalAllocated,
      createdBy: req.user._id
    });
    
    await paymentAllocation.save();
    
    // Update voucher
    voucher.allocatedAmount += totalAllocated;
    voucher.unallocatedAmount -= totalAllocated;
    voucher.allocationType = voucher.allocatedAmount === voucher.totalAmount ? 'AgainstReference' : 'Mixed';
    
    // Add allocations to voucher
    for (const alloc of preparedAllocations) {
      voucher.allocations.push({
        invoiceId: alloc.invoiceId,
        invoiceNumber: alloc.invoiceNumber,
        allocatedAmount: alloc.allocatedAmount,
        allocationDate: new Date()
      });
    }
    
    await voucher.save();
    
    // Update invoices
    for (const alloc of preparedAllocations) {
      const invoice = await InvoiceModel.findById(alloc.invoiceId);
      if (invoice) {
        invoice.paidAmount = (invoice.paidAmount || 0) + alloc.allocatedAmount;
        if (!isSupplier) {
          invoice.pendingAmount = invoice.totalAmount - invoice.paidAmount;
        }
        
        if (invoice.paidAmount >= invoice.totalAmount) {
          invoice.paymentStatus = 'Paid';
        } else if (invoice.paidAmount > 0) {
          invoice.paymentStatus = 'Partial';  // Fixed: was "Partially Paid"
        }
        
        await invoice.save();
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Payment allocation created successfully',
      data: paymentAllocation
    });
    
  } catch (error) {
    console.error('❌ Error creating payment allocation:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    console.error('User:', req.user);
    res.status(500).json({
      success: false,
      message: 'Error creating payment allocation',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get all payment allocations
 * GET /api/payment-allocations
 */
export const getPaymentAllocations = async (req, res) => {
  try {
    const { PaymentAllocation } = getModels(req.dbConnection);
    const {
      partyId,
      voucherId,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;
    
    const query = {};
    
    if (partyId) query.partyId = partyId;
    if (voucherId) query.voucherId = voucherId;
    
    if (startDate || endDate) {
      query.allocationDate = {};
      if (startDate) query.allocationDate.$gte = new Date(startDate);
      if (endDate) query.allocationDate.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    const allocations = await PaymentAllocation.find(query)
      .populate('voucherId')
      .populate('partyId')
      .populate('allocations.invoiceId')
      .populate('createdBy', 'name email')
      .sort({ allocationDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await PaymentAllocation.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: allocations,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching payment allocations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment allocations',
      error: error.message
    });
  }
};

/**
 * Get payment allocation by ID
 * GET /api/payment-allocations/:id
 */
export const getPaymentAllocationById = async (req, res) => {
  try {
    const { PaymentAllocation } = getModels(req.dbConnection);
    const allocation = await PaymentAllocation.findById(req.params.id)
      .populate('voucherId')
      .populate('partyId')
      .populate('allocations.invoiceId')
      .populate('createdBy', 'name email');
    
    if (!allocation) {
      return res.status(404).json({
        success: false,
        message: 'Payment allocation not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: allocation
    });
    
  } catch (error) {
    console.error('Error fetching payment allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment allocation',
      error: error.message
    });
  }
};

/**
 * Get outstanding invoices for a party
 * GET /api/outstanding-invoices
 */
export const getOutstandingInvoices = async (req, res) => {
  try {
    const { DealerInvoice, SupplierInvoice } = getModels(req.dbConnection);
    const { partyId, partyType } = req.query;
    
    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: 'Party ID is required'
      });
    }

    // Supplier outstanding (purchase invoices) — no pendingAmount field, compute it
    if (partyType === 'Supplier') {
      const supInvoices = await SupplierInvoice.find({
        supplier: partyId,
        status: 'Approved',
        paymentStatus: { $ne: 'Paid' }
      }).sort({ invoiceDate: 1 });

      const outstanding = supInvoices
        .map(inv => {
          const paid = inv.paidAmount || 0;
          const pending = inv.totalAmount - paid;
          return {
            _id: inv._id,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            totalAmount: inv.totalAmount,
            paidAmount: paid,
            pendingAmount: pending,
            paymentStatus: inv.paymentStatus,
            dueDate: inv.dueDate
          };
        })
        .filter(inv => inv.pendingAmount > 0);

      const totalOutstanding = outstanding.reduce((sum, inv) => sum + inv.pendingAmount, 0);

      return res.status(200).json({
        success: true,
        invoices: outstanding,
        summary: {
          totalInvoices: outstanding.length,
          totalOutstanding
        }
      });
    }

    const invoices = await DealerInvoice.find({
      dealer: partyId,
      status: 'Approved',
      isDeleted: { $ne: true },
      paymentStatus: { $ne: 'Paid' },
      $or: [
        { pendingAmount: { $gt: 0 } },
        { pendingAmount: null },
        { pendingAmount: { $exists: false } }
      ]
    }).sort({ invoiceDate: 1 });
    
    const outstandingInvoices = invoices.map(invoice => ({
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount || 0,
      pendingAmount: invoice.pendingAmount != null ? invoice.pendingAmount : (invoice.totalAmount - (invoice.paidAmount || 0)),
      paymentStatus: invoice.paymentStatus,
      dueDate: invoice.dueDate
    }));
    
    const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + inv.pendingAmount, 0);
    
    res.status(200).json({
      success: true,
      invoices: outstandingInvoices,
      summary: {
        totalInvoices: outstandingInvoices.length,
        totalOutstanding
      }
    });
    
  } catch (error) {
    console.error('Error fetching outstanding invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching outstanding invoices',
      error: error.message
    });
  }
};

/**
 * Get unadjusted payments for a party
 * GET /api/unadjusted-payments
 */
export const getUnadjustedPayments = async (req, res) => {
  try {
    const { Voucher } = getModels(req.dbConnection);
    const { partyId, voucherType = 'Receipt' } = req.query;
    
    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: 'Party ID is required'
      });
    }
    
    // Find all posted vouchers for this party (don't filter by unallocatedAmount yet)
    const vouchers = await Voucher.find({
      partyId,
      voucherType,
      status: 'Posted'
    }).sort({ voucherDate: -1 });
    
    // Calculate unallocatedAmount on-the-fly if undefined (for legacy vouchers)
    const unadjustedPayments = vouchers
      .map(voucher => {
        const allocatedAmount = voucher.allocatedAmount || 0;
        const unallocatedAmount = voucher.unallocatedAmount !== undefined 
          ? voucher.unallocatedAmount 
          : voucher.totalAmount - allocatedAmount;
        
        return {
          _id: voucher._id,
          voucherNumber: voucher.voucherNumber,
          voucherDate: voucher.voucherDate,
          totalAmount: voucher.totalAmount,
          allocatedAmount,
          unallocatedAmount,
          transactionMode: voucher.transactionMode,
          narration: voucher.narration
        };
      })
      .filter(v => v.unallocatedAmount > 0); // Filter after calculation
    
    const totalUnadjusted = unadjustedPayments.reduce((sum, v) => sum + v.unallocatedAmount, 0);
    
    res.status(200).json({
      success: true,
      payments: unadjustedPayments,
      summary: {
        totalPayments: unadjustedPayments.length,
        totalUnadjusted
      }
    });
    
  } catch (error) {
    console.error('Error fetching unadjusted payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unadjusted payments',
      error: error.message
    });
  }
};

/**
 * Auto-allocate payments for a dealer
 * POST /api/payment-allocations/auto-allocate
 * 
 * Automatically distributes all available payment balance across outstanding invoices
 * in priority order:
 *   1. Overdue invoices (past due date) — oldest overdue first
 *   2. Nearest to expiry (credit days almost up) — closest to due date next
 *   3. Normal (still within credit period) — oldest first
 */
export const autoAllocatePayments = async (req, res) => {
  try {
    const { PaymentAllocation, Voucher, DealerInvoice } = getModels(req.dbConnection);
    const { partyId } = req.body;

    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: 'Party ID (partyId) is required'
      });
    }

    // 1. Get all unadjusted payments (Receipts) for this dealer, oldest first (FIFO)
    const vouchers = await Voucher.find({
      partyId,
      voucherType: 'Receipt',
      status: 'Posted'
    }).sort({ voucherDate: 1 });

    // Calculate actual unallocated amounts (handle legacy vouchers)
    const unadjustedVouchers = vouchers
      .map(voucher => {
        const allocatedAmount = voucher.allocatedAmount || 0;
        const unallocatedAmount = voucher.unallocatedAmount !== undefined
          ? voucher.unallocatedAmount
          : voucher.totalAmount - allocatedAmount;
        return { voucher, unallocatedAmount };
      })
      .filter(v => v.unallocatedAmount > 0);

    if (unadjustedVouchers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No unadjusted payments available for this dealer'
      });
    }

    const totalAvailable = unadjustedVouchers.reduce((sum, v) => sum + v.unallocatedAmount, 0);

    // 2. Get all outstanding invoices for this dealer
    const invoices = await DealerInvoice.find({
      dealer: partyId,
      status: 'Approved',
      isDeleted: { $ne: true },
      isDraft: { $ne: true },
      paymentStatus: { $ne: 'Paid' },
      $or: [
        { pendingAmount: { $gt: 0 } },
        { pendingAmount: null },
        { pendingAmount: { $exists: false } }
      ]
    });

    if (invoices.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No outstanding invoices found for this dealer'
      });
    }

    // 3. Sort invoices by priority
    const now = new Date();
    const sortedInvoices = invoices
      .map(invoice => {
        const pendingAmount = invoice.pendingAmount != null
          ? invoice.pendingAmount
          : (invoice.totalAmount - (invoice.paidAmount || 0));
        const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
        const isOverdue = dueDate ? dueDate < now : false;
        // Days until due (negative = overdue)
        const daysUntilDue = dueDate ? Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24)) : 9999;

        return {
          invoice,
          pendingAmount,
          dueDate,
          isOverdue,
          daysUntilDue
        };
      })
      .filter(item => item.pendingAmount > 0)
      .sort((a, b) => {
        // Priority 1: Overdue invoices first (oldest overdue = most negative daysUntilDue)
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;

        if (a.isOverdue && b.isOverdue) {
          // Both overdue: oldest overdue first (most negative daysUntilDue first)
          return a.daysUntilDue - b.daysUntilDue;
        }

        // Priority 2: Nearest to expiry (smallest positive daysUntilDue)
        // Priority 3: Normal — oldest invoice first (by invoiceDate)
        if (a.daysUntilDue !== b.daysUntilDue) {
          return a.daysUntilDue - b.daysUntilDue;
        }

        // Tie-breaker: oldest invoice date first
        return new Date(a.invoice.invoiceDate) - new Date(b.invoice.invoiceDate);
      });

    // 4. Distribute payments across invoices using FIFO across vouchers
    let globalRemaining = totalAvailable;
    const allocationPlan = []; // { voucherId, invoiceId, amount }

    // Track remaining per voucher
    const voucherRemaining = unadjustedVouchers.map(v => ({
      ...v,
      remaining: v.unallocatedAmount
    }));

    for (const { invoice, pendingAmount } of sortedInvoices) {
      if (globalRemaining <= 0) break;

      const allocateForInvoice = Math.min(pendingAmount, globalRemaining);
      let leftForInvoice = allocateForInvoice;

      // Distribute this invoice's allocation across vouchers (FIFO)
      for (const vInfo of voucherRemaining) {
        if (leftForInvoice <= 0) break;
        if (vInfo.remaining <= 0) continue;

        const amountFromVoucher = Math.min(leftForInvoice, vInfo.remaining);
        allocationPlan.push({
          voucher: vInfo.voucher,
          invoice,
          amount: amountFromVoucher
        });

        vInfo.remaining -= amountFromVoucher;
        leftForInvoice -= amountFromVoucher;
      }

      globalRemaining -= allocateForInvoice;
    }

    if (allocationPlan.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No allocations could be made'
      });
    }

    // 5. Group allocations by voucher for creating PaymentAllocation records
    const allocationsByVoucher = {};
    for (const item of allocationPlan) {
      const vId = item.voucher._id.toString();
      if (!allocationsByVoucher[vId]) {
        allocationsByVoucher[vId] = {
          voucher: item.voucher,
          allocations: []
        };
      }
      allocationsByVoucher[vId].allocations.push({
        invoice: item.invoice,
        amount: item.amount
      });
    }

    // 6. Create PaymentAllocation records and update vouchers/invoices
    const createdAllocations = [];
    const updatedInvoices = new Map(); // Track cumulative updates per invoice

    for (const [voucherId, group] of Object.entries(allocationsByVoucher)) {
      const { voucher, allocations: voucherAllocations } = group;

      // Prepare allocations array for this voucher
      const preparedAllocations = [];
      let totalAllocatedForVoucher = 0;

      for (const { invoice, amount } of voucherAllocations) {
        const previouslyPaid = invoice.paidAmount || 0;
        // Account for any amounts already allocated to this invoice in this batch
        const batchPrevious = updatedInvoices.get(invoice._id.toString()) || 0;
        const effectivePaid = previouslyPaid + batchPrevious;
        const remainingAfter = invoice.totalAmount - effectivePaid - amount;

        preparedAllocations.push({
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          invoiceAmount: invoice.totalAmount,
          previouslyPaid: effectivePaid,
          allocatedAmount: amount,
          remainingAmount: Math.max(0, remainingAfter),
          paymentStatus: remainingAfter <= 0 ? 'Full' : 'Partial'
        });

        totalAllocatedForVoucher += amount;

        // Track cumulative allocation for this invoice
        updatedInvoices.set(
          invoice._id.toString(),
          batchPrevious + amount
        );
      }

      // Generate allocation number
      const allocationNumber = await generateAllocationNumber(new Date(), req.dbConnection);

      // Create PaymentAllocation record
      const paymentAllocation = new PaymentAllocation({
        allocationNumber,
        allocationDate: new Date(),
        voucherId: voucher._id,
        voucherNumber: voucher.voucherNumber,
        voucherType: voucher.voucherType,
        totalAmount: voucher.totalAmount,
        partyId: voucher.partyId,
        partyType: voucher.partyType || 'Dealer',
        partyName: voucher.partyName,
        allocations: preparedAllocations,
        totalAllocated: totalAllocatedForVoucher,
        notes: 'Auto-allocated',
        createdBy: req.user._id
      });

      await paymentAllocation.save();
      createdAllocations.push(paymentAllocation);

      // Update voucher
      // Initialize fields if undefined (legacy vouchers)
      if (voucher.allocatedAmount === undefined) {
        voucher.allocatedAmount = 0;
      }
      if (voucher.unallocatedAmount === undefined) {
        voucher.unallocatedAmount = voucher.totalAmount;
      }

      voucher.allocatedAmount += totalAllocatedForVoucher;
      voucher.unallocatedAmount -= totalAllocatedForVoucher;
      voucher.allocationType = voucher.allocatedAmount >= voucher.totalAmount
        ? 'AgainstReference'
        : 'Mixed';

      // Add allocations to voucher's allocations array
      for (const alloc of preparedAllocations) {
        voucher.allocations.push({
          invoiceId: alloc.invoiceId,
          invoiceNumber: alloc.invoiceNumber,
          allocatedAmount: alloc.allocatedAmount,
          allocationDate: new Date()
        });
      }

      await voucher.save();
    }

    // 7. Update all affected invoices
    for (const [invoiceId, totalAllocatedToInvoice] of updatedInvoices.entries()) {
      const invoice = await DealerInvoice.findById(invoiceId);
      if (invoice) {
        invoice.paidAmount = (invoice.paidAmount || 0) + totalAllocatedToInvoice;
        invoice.pendingAmount = invoice.totalAmount - invoice.paidAmount;

        if (invoice.paidAmount >= invoice.totalAmount) {
          invoice.paymentStatus = 'Paid';
          invoice.pendingAmount = 0;
        } else if (invoice.paidAmount > 0) {
          invoice.paymentStatus = 'Partial';
        }

        await invoice.save();
      }
    }

    // 8. Build response summary
    const totalAllocated = allocationPlan.reduce((sum, item) => sum + item.amount, 0);
    const invoicesFullyPaid = [...updatedInvoices.entries()].filter(([id]) => {
      const inv = sortedInvoices.find(s => s.invoice._id.toString() === id);
      if (!inv) return false;
      const totalPaid = (inv.invoice.paidAmount || 0) + updatedInvoices.get(id);
      return totalPaid >= inv.invoice.totalAmount;
    }).length;
    const invoicesPartiallyPaid = updatedInvoices.size - invoicesFullyPaid;

    res.status(201).json({
      success: true,
      message: `Auto-allocation complete. ₹${totalAllocated.toLocaleString('en-IN')} allocated across ${updatedInvoices.size} invoice(s)`,
      data: {
        allocations: createdAllocations,
        summary: {
          totalAvailable,
          totalAllocated,
          remainingUnallocated: totalAvailable - totalAllocated,
          invoicesFullyPaid,
          invoicesPartiallyPaid,
          totalInvoicesProcessed: updatedInvoices.size,
          vouchersUsed: Object.keys(allocationsByVoucher).length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error in auto-allocate payments:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error in auto-allocate payments',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
