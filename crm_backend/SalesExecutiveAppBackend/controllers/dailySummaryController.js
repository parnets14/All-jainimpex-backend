import { getCompanyConnection } from '../../config/multiDatabase.js';
import { dailySummarySchema } from '../models/DailySummary.js';

const MASTER_COMPANY = 'jain-impex';

const getModel = () => {
  const conn = getCompanyConnection(MASTER_COMPANY);
  return conn.models.SEDailySummary || conn.model('SEDailySummary', dailySummarySchema);
};

// @desc    Get daily summaries (admin view)
// @route   GET /api/se/daily-summary
// @access  Private (Admin)
export const getDailySummaries = async (req, res) => {
  try {
    const { date, userId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const SEDailySummary = getModel();

    const query = {};

    if (date) {
      const d = new Date(date + 'T00:00:00.000+05:30');
      const dEnd = new Date(date + 'T23:59:59.999+05:30');
      query.date = { $gte: d, $lte: dEnd };
    } else if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate + 'T00:00:00.000+05:30'),
        $lte: new Date(endDate + 'T23:59:59.999+05:30'),
      };
    } else {
      // Default: today IST
      const now = new Date(Date.now() + 5.5 * 3600000);
      const todayStr = now.toISOString().slice(0, 10);
      const d = new Date(todayStr + 'T00:00:00.000+05:30');
      const dEnd = new Date(todayStr + 'T23:59:59.999+05:30');
      query.date = { $gte: d, $lte: dEnd };
    }

    if (userId) query.user = userId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [summaries, total] = await Promise.all([
      SEDailySummary.find(query)
        .sort({ date: -1, totalDistanceKm: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      SEDailySummary.countDocuments(query),
    ]);

    // Aggregate totals for the queried period
    const totals = summaries.reduce((acc, s) => ({
      totalDistance: acc.totalDistance + (s.totalDistanceKm || 0),
      totalVisits: acc.totalVisits + (s.dealersVisited || 0),
      totalOrders: acc.totalOrders + (s.ordersPlaced || 0),
      totalOrderValue: acc.totalOrderValue + (s.orderValue || 0),
      totalCollections: acc.totalCollections + (s.collectionAmount || 0),
      avgCoverage: acc.avgCoverage + (s.visitCoveragePercent || 0),
    }), { totalDistance: 0, totalVisits: 0, totalOrders: 0, totalOrderValue: 0, totalCollections: 0, avgCoverage: 0 });

    if (summaries.length > 0) {
      totals.avgCoverage = Math.round(totals.avgCoverage / summaries.length);
    }
    totals.totalDistance = parseFloat(totals.totalDistance.toFixed(1));

    res.json({
      success: true,
      data: summaries,
      totals,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error('Get daily summaries error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Trigger summary generation manually (admin)
// @route   POST /api/se/daily-summary/generate
// @access  Private (Admin)
export const triggerGeneration = async (req, res) => {
  try {
    const { date } = req.body;
    const { runDailySummary } = await import('../../cron/seDailySummary.js');
    
    // Run in background, respond immediately
    const targetDate = date || new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
    runDailySummary(targetDate);

    res.json({
      success: true,
      message: `Summary generation triggered for ${targetDate}. Processing in background.`,
    });
  } catch (error) {
    console.error('Trigger generation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
