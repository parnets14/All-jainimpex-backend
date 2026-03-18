import PaymentAllocation from '../models/PaymentAllocation.js';
import Voucher from '../models/Voucher.js';
import DealerInvoice from '../models/DealerInvoice.js';
import { generateAllocationNumber } from '../services/voucherNumberService.js';

/**
 * Create payment allocation
 * POST /api/payment-allocations
 */
export const createPaymentAllocation = async (req, res) => {
  try {
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
      const invoice = await DealerInvoice.findById(alloc.invoiceId);
      
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
        paymentStatus: remainingAmount === 0 ? 'Paid' : 'Partial'
      });
    }
    
    // Generate allocation number
    const allocationNumber = await generateAllocationNumber();
    
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
      const invoice = await DealerInvoice.findById(alloc.invoiceId);
      if (invoice) {
        invoice.paidAmount = (invoice.paidAmount || 0) + alloc.allocatedAmount;
        invoice.pendingAmount = invoice.totalAmount - invoice.paidAmount;
        
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
    const { partyId } = req.query;
    
    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: 'Party ID is required'
      });
    }
    
    const invoices = await DealerInvoice.find({
      dealer: partyId,
      status: 'Approved',
      isDeleted: { $ne: true },
      paymentStatus: { $ne: 'Paid' },
      $or: [
        { pendingAmount: { $gt: 0 } },
        { $and: [{ pendingAmount: { $exists: false } }, { totalAmount: { $gt: 0 } }] }
      ]
    }).sort({ invoiceDate: 1 });
    
    const outstandingInvoices = invoices.map(invoice => ({
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount || 0,
      pendingAmount: invoice.pendingAmount || invoice.totalAmount,
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
