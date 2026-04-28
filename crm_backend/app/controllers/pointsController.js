import { dealerInvoiceSchema } from '../../models/DealerInvoice.js';
import { dealerSchema }        from '../../models/Dealer.js';
import { salesOrderSchema }    from '../../models/SalesOrder.js';

const getModels = (db) => ({
  DealerInvoice: db.models.DealerInvoice || db.model('DealerInvoice', dealerInvoiceSchema),
  Dealer:        db.models.Dealer        || db.model('Dealer',        dealerSchema),
  SalesOrder:    db.models.SalesOrder    || db.model('SalesOrder',    salesOrderSchema),
});

// @desc    Get dealer's points summary
// @route   GET /api/app/points/summary
export const getPointsSummary = async (req, res) => {
  try {
    const { DealerInvoice, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [totalAgg, monthlyAgg] = await Promise.all([
      DealerInvoice.aggregate([
        { $match: { dealer: dealer._id, totalPoints: { $gt: 0 } } },
        { $group: { _id: null, totalPoints: { $sum: '$totalPoints' } } },
      ]),
      DealerInvoice.aggregate([
        { $match: { dealer: dealer._id, totalPoints: { $gt: 0 }, invoiceDate: { $gte: startOfMonth } } },
        { $group: { _id: null, totalPoints: { $sum: '$totalPoints' } } },
      ]),
    ]);

    const totalPoints   = totalAgg[0]?.totalPoints   || 0;
    const monthlyPoints = monthlyAgg[0]?.totalPoints || 0;

    res.json({ success: true, summary: { totalPoints, monthlyPoints, lifetimePoints: totalPoints } });
  } catch (error) {
    console.error('getPointsSummary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get dealer's points history
// @route   GET /api/app/points/history
export const getPointsHistory = async (req, res) => {
  try {
    const { DealerInvoice, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { page = 1, limit = 20, startDate, endDate } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { dealer: dealer._id, totalPoints: { $gt: 0 } };
    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate)   query.invoiceDate.$lte = new Date(endDate);
    }

    const [invoices, total] = await Promise.all([
      DealerInvoice.find(query)
        .select('invoiceNumber invoiceDate totalPoints totalAmount salesOrderNumber')
        .populate('salesOrder', 'orderNumber')
        .sort({ invoiceDate: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      DealerInvoice.countDocuments(query),
    ]);

    const pointsHistory = invoices.map(inv => ({
      invoiceId:         inv._id.toString(),
      invoiceNumber:     inv.invoiceNumber,
      invoiceDate:       inv.invoiceDate,
      pointsEarned:      inv.totalPoints,
      invoiceAmount:     inv.totalAmount,
      salesOrderNumber:  inv.salesOrder?.orderNumber || inv.salesOrderNumber || null,
    }));

    res.json({
      success: true,
      pointsHistory,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: skip + invoices.length < total,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('getPointsHistory error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
