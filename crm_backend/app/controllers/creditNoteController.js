import { creditNoteSchema }    from '../../models/CreditNote.js';
import { dealerSchema }        from '../../models/Dealer.js';
import { dealerInvoiceSchema } from '../../models/DealerInvoice.js';
import { userSchema }          from '../../models/User.js';

const getModels = (db) => ({
  CreditNote:    db.models.CreditNote    || db.model('CreditNote',    creditNoteSchema),
  Dealer:        db.models.Dealer        || db.model('Dealer',        dealerSchema),
  DealerInvoice: db.models.DealerInvoice || db.model('DealerInvoice', dealerInvoiceSchema),
  User:          db.models.User          || db.model('User',          userSchema),
});

// @desc    Get dealer's credit notes
// @route   GET /api/app/credit-notes
export const getMyCreditNotes = async (req, res) => {
  try {
    const { CreditNote, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { page = 1, limit = 20, status } = req.query;
    const query = { dealer: dealer._id };
    if (status && status !== 'all') query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [raw, total] = await Promise.all([
      CreditNote.find(query)
        .populate('dealer', 'name code firmName')
        .populate('originalInvoice', 'invoiceNumber')
        .sort({ creditNoteDate: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      CreditNote.countDocuments(query),
    ]);

    const creditNotes = raw.map(cn => ({
      _id: cn._id,
      creditNoteNumber: cn.creditNoteNumber,
      amount: cn.creditAmount,
      issueDate: cn.creditNoteDate,
      reason: cn.creditReason,
      description: cn.remarks || cn.internalNotes || '',
      status: cn.status === 'Approved' ? 'Available' : cn.status === 'Rejected' ? 'Expired' : cn.status,
      source: cn.createdBy ? 'Admin' : 'Support Chat',
      dealer: cn.dealer,
      originalInvoice: cn.originalInvoice,
      originalInvoiceNumber: cn.originalInvoiceNumber,
    }));

    const availableAgg = await CreditNote.aggregate([
      { $match: { dealer: dealer._id, status: 'Approved' } },
      { $group: { _id: null, total: { $sum: '$creditAmount' } } },
    ]);

    res.json({
      success: true,
      creditNotes,
      totalAvailableCredit: availableAgg[0]?.total || 0,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error('getMyCreditNotes error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get credit note summary
// @route   GET /api/app/credit-notes/summary
export const getCreditNoteSummary = async (req, res) => {
  try {
    const { CreditNote, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const summary = await CreditNote.aggregate([
      { $match: { dealer: dealer._id } },
      { $group: { _id: '$status', total: { $sum: '$creditAmount' }, count: { $sum: 1 } } },
    ]);

    const result = {
      totalAvailableCredit: 0, totalRedeemedCredit: 0, totalExpiredCredit: 0,
      availableCount: 0, redeemedCount: 0, expiredCount: 0,
    };

    summary.forEach(item => {
      if (item._id === 'Approved')  { result.totalAvailableCredit = item.total; result.availableCount = item.count; }
      if (item._id === 'Partial')   { result.totalRedeemedCredit  = item.total; result.redeemedCount  = item.count; }
      if (item._id === 'Rejected')  { result.totalExpiredCredit   = item.total; result.expiredCount   = item.count; }
    });

    res.json({ success: true, summary: result });
  } catch (error) {
    console.error('getCreditNoteSummary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single credit note details
// @route   GET /api/app/credit-notes/:id
export const getCreditNoteDetails = async (req, res) => {
  try {
    const { CreditNote, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const creditNote = await CreditNote.findOne({ _id: req.params.id, dealer: dealer._id })
      .populate('dealer', 'name code firmName')
      .populate('originalInvoice', 'invoiceNumber invoiceDate totalAmount')
      .populate('createdBy', 'name email');

    if (!creditNote) return res.status(404).json({ success: false, message: 'Credit note not found' });

    res.json({ success: true, creditNote });
  } catch (error) {
    console.error('getCreditNoteDetails error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
