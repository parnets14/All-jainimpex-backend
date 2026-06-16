import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { getFinancialYear } from '../services/voucherNumberService.js';
import { assertPeriodOpen, handlePeriodLockError } from '../services/periodLockService.js';
import { recordCancel, recordCreate } from '../services/auditTrailService.js';

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    JournalVoucher: dbConnection.models.JournalVoucher || 
                    dbConnection.model('JournalVoucher', journalVoucherSchema)
  };
};

export const createJournalVoucher = async (req, res) => {
  try {
    const { JournalVoucher } = getModels(req.dbConnection);
    const { voucherDate, voucherType, entries, narration } = req.body;

    if (!voucherDate || !entries || entries.length < 2) {
      return res.status(400).json({ success: false, message: 'voucherDate and at least 2 entries are required' });
    }

    // Block posting into a closed financial year
    await assertPeriodOpen(req.dbConnection, voucherDate, 'journal voucher');

    const totalDebit = entries.reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
    const totalCredit = entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `Debits (₹${totalDebit.toFixed(2)}) must equal Credits (₹${totalCredit.toFixed(2)})`
      });
    }

    const voucher = new JournalVoucher({
      voucherDate: new Date(voucherDate),
      financialYear: getFinancialYear(new Date(voucherDate)),
      voucherType: voucherType || 'Journal',
      entries,
      totalAmount: totalDebit,
      narration,
      createdBy: req.user._id
    });

    await voucher.save();

    await recordCreate(req.dbConnection, {
      entity: 'JournalVoucher',
      entityId: voucher._id,
      documentNumber: voucher.voucherNumber,
      req,
    });

    res.status(201).json({ success: true, message: 'Journal voucher created successfully', voucher });
  } catch (error) {
    if (handlePeriodLockError(error, res)) return;
    console.error('Create journal voucher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getJournalVouchers = async (req, res) => {
  try {
    const { JournalVoucher } = getModels(req.dbConnection);
    const { page = 1, limit = 20, voucherType, startDate, endDate, search } = req.query;
    const query = {};

    if (voucherType) query.voucherType = voucherType;
    if (startDate || endDate) {
      query.voucherDate = {};
      if (startDate) query.voucherDate.$gte = new Date(startDate);
      if (endDate) query.voucherDate.$lte = new Date(endDate);
    }
    if (search) {
      query.$or = [
        { voucherNumber: { $regex: search, $options: 'i' } },
        { narration: { $regex: search, $options: 'i' } },
        { 'entries.accountName': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const [vouchers, total] = await Promise.all([
      JournalVoucher.find(query)
        .populate('createdBy', 'name email')
        .sort({ voucherDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      JournalVoucher.countDocuments(query)
    ]);

    res.json({
      success: true,
      vouchers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getJournalVoucherById = async (req, res) => {
  try {
    const { JournalVoucher } = getModels(req.dbConnection);
    const voucher = await JournalVoucher.findById(req.params.id).populate('createdBy', 'name email');
    if (!voucher) return res.status(404).json({ success: false, message: 'Voucher not found' });
    res.json({ success: true, voucher });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const cancelJournalVoucher = async (req, res) => {
  try {
    const { JournalVoucher } = getModels(req.dbConnection);
    const { cancelReason } = req.body;
    if (!cancelReason) return res.status(400).json({ success: false, message: 'Cancel reason is required' });

    const voucher = await JournalVoucher.findById(req.params.id);
    if (!voucher) return res.status(404).json({ success: false, message: 'Voucher not found' });
    if (voucher.status === 'Cancelled') return res.status(400).json({ success: false, message: 'Already cancelled' });

    // Block cancelling a voucher that belongs to a closed financial year
    await assertPeriodOpen(req.dbConnection, voucher.voucherDate, 'journal voucher cancellation');

    voucher.status = 'Cancelled';
    voucher.cancelledAt = new Date();
    voucher.cancelledBy = req.user._id;
    voucher.cancelReason = cancelReason;
    await voucher.save();

    await recordCancel(req.dbConnection, {
      entity: 'JournalVoucher',
      entityId: voucher._id,
      documentNumber: voucher.voucherNumber,
      req,
      reason: cancelReason,
    });

    res.json({ success: true, message: 'Journal voucher cancelled', voucher });
  } catch (error) {
    if (handlePeriodLockError(error, res)) return;
    res.status(500).json({ success: false, message: error.message });
  }
};
