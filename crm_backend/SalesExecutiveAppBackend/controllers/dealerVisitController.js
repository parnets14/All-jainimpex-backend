import { getModels } from '../utils/getModels.js';

const toPoint = (lat, lng, address) => ({
  type: 'Point',
  coordinates: [parseFloat(lng) || 0, parseFloat(lat) || 0],
  address: address || '',
});

// @desc   Punch IN at a dealer (start a visit)
// @route  POST /api/se/dealer-visits/check-in
// @access Private (Sales Executive)
export const startVisit = async (req, res) => {
  try {
    const { dealerId, latitude, longitude, address, purpose } = req.body;
    const userId = req.user._id;
    const { DealerVisit, Dealer } = getModels(req);

    if (!dealerId) {
      return res.status(400).json({ success: false, message: 'dealerId is required' });
    }
    const dealer = await Dealer.findById(dealerId).select('_id name');
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    // block a second open visit
    const open = await DealerVisit.findOne({ salesExecutive: userId, status: 'in-progress' });
    if (open) {
      return res.status(400).json({
        success: false,
        message: 'You already have an in-progress visit. Punch out first.',
        visit: open,
      });
    }

    const now = new Date();
    const visit = await DealerVisit.create({
      salesExecutive: userId,
      dealer: dealerId,
      date: new Date(now).setHours(0, 0, 0, 0),
      checkInAt: now,
      inLocation: toPoint(latitude, longitude, address),
      status: 'in-progress',
      purpose: purpose || '',
    });

    res.status(201).json({ success: true, message: `Arrived at ${dealer.name}`, visit });
  } catch (error) {
    console.error('startVisit error:', error);
    res.status(500).json({ success: false, message: 'Failed to start visit', error: error.message });
  }
};

// @desc   Punch OUT of a dealer (end the active visit)
// @route  POST /api/se/dealer-visits/check-out
// @access Private (Sales Executive)
export const endVisit = async (req, res) => {
  try {
    const { visitId, latitude, longitude, address, notes } = req.body;
    const userId = req.user._id;
    const { DealerVisit } = getModels(req);

    const visit = visitId
      ? await DealerVisit.findOne({ _id: visitId, salesExecutive: userId })
      : await DealerVisit.findOne({ salesExecutive: userId, status: 'in-progress' }).sort({ checkInAt: -1 });

    if (!visit) return res.status(404).json({ success: false, message: 'No in-progress visit found' });
    if (visit.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Visit already completed' });
    }

    const now = new Date();
    visit.checkOutAt = now;
    visit.outLocation = toPoint(latitude, longitude, address);
    visit.durationMin = Math.max(0, Math.round((now - new Date(visit.checkInAt)) / 60000));
    visit.status = 'completed';
    if (notes) visit.notes = notes;
    await visit.save();

    res.status(200).json({ success: true, message: 'Visit completed', visit });
  } catch (error) {
    console.error('endVisit error:', error);
    res.status(500).json({ success: false, message: 'Failed to end visit', error: error.message });
  }
};

// @desc   Get the SE's current in-progress visit (if any)
// @route  GET /api/se/dealer-visits/active
// @access Private (Sales Executive)
export const getActiveVisit = async (req, res) => {
  try {
    const { DealerVisit } = getModels(req);
    const visit = await DealerVisit.findOne({ salesExecutive: req.user._id, status: 'in-progress' })
      .populate('dealer', 'name shopName address')
      .sort({ checkInAt: -1 });
    res.json({ success: true, visit: visit || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Get the SE's own visits (today by default, or a date range)
// @route  GET /api/se/dealer-visits/my?date=&startDate=&endDate=
// @access Private (Sales Executive)
export const getMyVisits = async (req, res) => {
  try {
    const { DealerVisit } = getModels(req);
    const { date, startDate, endDate } = req.query;
    const query = { salesExecutive: req.user._id };

    if (startDate && endDate) {
      const s = new Date(startDate); s.setHours(0, 0, 0, 0);
      const e = new Date(endDate); e.setHours(23, 59, 59, 999);
      query.date = { $gte: s, $lte: e };
    } else {
      const d = date ? new Date(date) : new Date();
      const s = new Date(d); s.setHours(0, 0, 0, 0);
      const e = new Date(d); e.setHours(23, 59, 59, 999);
      query.date = { $gte: s, $lte: e };
    }

    const visits = await DealerVisit.find(query)
      .populate('dealer', 'name shopName address')
      .sort({ checkInAt: -1 });

    res.json({ success: true, visits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Admin/Web — list dealer visits filtered by SE + date
// @route  GET /api/se/dealer-visits/all?userId=&date=&startDate=&endDate=
// @access Private (Admin)
export const getAllVisits = async (req, res) => {
  try {
    const { DealerVisit, User } = getModels(req);
    const { userId, date, startDate, endDate, page = 1, limit = 100 } = req.query;
    const query = {};

    if (userId) query.salesExecutive = userId;
    if (startDate && endDate) {
      const s = new Date(startDate); s.setHours(0, 0, 0, 0);
      const e = new Date(endDate); e.setHours(23, 59, 59, 999);
      query.date = { $gte: s, $lte: e };
    } else if (date) {
      const d = new Date(date);
      const s = new Date(d); s.setHours(0, 0, 0, 0);
      const e = new Date(d); e.setHours(23, 59, 59, 999);
      query.date = { $gte: s, $lte: e };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [visits, total] = await Promise.all([
      DealerVisit.find(query)
        .populate('dealer', 'name shopName address')
        .sort({ date: -1, checkInAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      DealerVisit.countDocuments(query),
    ]);

    // attach SE name
    const seIds = [...new Set(visits.map((v) => v.salesExecutive?.toString()).filter(Boolean))];
    const userMap = {};
    if (seIds.length) {
      const users = await User.find({ _id: { $in: seIds } }).select('name phone email').lean();
      users.forEach((u) => { userMap[u._id.toString()] = u; });
    }
    const enriched = visits.map((v) => ({ ...v, salesExecutive: userMap[v.salesExecutive?.toString()] || null }));

    res.json({
      success: true,
      data: enriched,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('getAllVisits error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
