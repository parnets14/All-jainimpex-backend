import CreditNote from '../../models/CreditNote.js';
import Dealer from '../../models/Dealer.js';

// @desc    Get dealer's credit notes
// @route   GET /api/app/credit-notes
// @access  Private (Dealer)
export const getMyCreditNotes = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;

    const { page = 1, limit = 50, status } = req.query;

    const query = { dealer: dealerId };

    // Filter by status if provided
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch credit notes
    const creditNotesRaw = await CreditNote.find(query)
      .populate('dealer', 'name code firmName')
      .populate('originalInvoice', 'invoiceNumber')
      .sort({ creditNoteDate: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    // Map to mobile app format
    const creditNotes = creditNotesRaw.map(cn => ({
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
      originalInvoiceNumber: cn.originalInvoiceNumber
    }));

    const total = await CreditNote.countDocuments(query);

    // Calculate total available credit (Approved status = Available in app)
    const availableCredit = await CreditNote.aggregate([
      { 
        $match: { 
          dealer: dealerId,
          status: 'Approved'
        } 
      },
      { 
        $group: { 
          _id: null, 
          total: { $sum: '$creditAmount' } 
        } 
      }
    ]);

    const totalAvailableCredit = availableCredit[0]?.total || 0;

    res.json({
      success: true,
      creditNotes,
      totalAvailableCredit,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total
      }
    });
  } catch (error) {
    console.error('Get credit notes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch credit notes',
      error: error.message
    });
  }
};

// @desc    Get credit note summary
// @route   GET /api/app/credit-notes/summary
// @access  Private (Dealer)
export const getCreditNoteSummary = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;

    // Calculate totals by status
    const summary = await CreditNote.aggregate([
      { $match: { dealer: dealerId } },
      {
        $group: {
          _id: '$status',
          total: { $sum: '$creditAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {
      totalAvailableCredit: 0,
      totalRedeemedCredit: 0,
      totalExpiredCredit: 0,
      availableCount: 0,
      redeemedCount: 0,
      expiredCount: 0
    };

    summary.forEach(item => {
      // Map database status to app status
      // Approved = Available, Rejected = Expired, Partial = Redeemed
      if (item._id === 'Approved') {
        result.totalAvailableCredit = item.total;
        result.availableCount = item.count;
      } else if (item._id === 'Partial') {
        result.totalRedeemedCredit = item.total;
        result.redeemedCount = item.count;
      } else if (item._id === 'Rejected') {
        result.totalExpiredCredit = item.total;
        result.expiredCount = item.count;
      }
    });

    res.json({
      success: true,
      summary: result
    });
  } catch (error) {
    console.error('Get credit note summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch credit note summary',
      error: error.message
    });
  }
};

// @desc    Get single credit note details
// @route   GET /api/app/credit-notes/:id
// @access  Private (Dealer)
export const getCreditNoteDetails = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    const creditNote = await CreditNote.findOne({
      _id: req.params.id,
      dealer: dealer._id
    })
      .populate('dealer', 'name code firmName')
      .populate('originalInvoice', 'invoiceNumber invoiceDate totalAmount')
      .populate('createdBy', 'name email');

    if (!creditNote) {
      return res.status(404).json({
        success: false,
        message: 'Credit note not found'
      });
    }

    res.json({
      success: true,
      creditNote
    });
  } catch (error) {
    console.error('Get credit note details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch credit note details',
      error: error.message
    });
  }
};
