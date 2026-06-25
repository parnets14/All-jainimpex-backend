import { biometricPunchSchema } from '../models/BiometricPunch.js';
import { getCompanyConnection, isValidCompany } from '../config/multiDatabase.js';

// Resolve the BiometricPunch model on the right company's database
const getModel = (company) => {
  const conn = getCompanyConnection(company);
  return conn.models.BiometricPunch || conn.model('BiometricPunch', biometricPunchSchema);
};

/**
 * POST /api/biometric/punch
 * Body: { company: "jain-impex", punches: [{ sourceId, cardNo, punchAt, machineNo }] }
 * Called by the office-PC sync agent (API-key auth). Idempotent: re-sending the
 * same rows does nothing (upsert on sourceId+machineNo).
 */
export const ingestPunches = async (req, res) => {
  try {
    const { company, punches } = req.body;

    if (!company || !isValidCompany(company)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing company' });
    }
    if (!Array.isArray(punches) || punches.length === 0) {
      return res.status(400).json({ success: false, message: 'No punches provided' });
    }

    const BiometricPunch = getModel(company);

    const ops = [];
    let maxSourceId = 0;
    for (const p of punches) {
      const sourceId = parseInt(p.sourceId, 10);
      if (!Number.isFinite(sourceId) || !p.cardNo || !p.punchAt) continue;
      const punchAt = new Date(p.punchAt);
      if (isNaN(punchAt.getTime())) continue;
      if (sourceId > maxSourceId) maxSourceId = sourceId;

      ops.push({
        updateOne: {
          filter: { sourceId, machineNo: String(p.machineNo || '1') },
          update: {
            $setOnInsert: {
              cardNo: String(p.cardNo).trim(),
              punchAt,
              machineNo: String(p.machineNo || '1'),
              sourceId,
              processed: false,
            },
          },
          upsert: true,
        },
      });
    }

    if (ops.length === 0) {
      return res.json({ success: true, received: punches.length, inserted: 0, message: 'No valid rows' });
    }

    const result = await BiometricPunch.bulkWrite(ops, { ordered: false });
    const inserted = result.upsertedCount || 0;

    const latest = await BiometricPunch.findOne().sort({ sourceId: -1 }).select('sourceId').lean();

    console.log(`🟢 [biometric/${company}] received ${punches.length}, inserted ${inserted}, lastSourceId ${latest?.sourceId ?? maxSourceId}`);

    res.json({
      success: true,
      received: punches.length,
      inserted,
      duplicates: ops.length - inserted,
      lastSourceId: latest ? latest.sourceId : maxSourceId,
    });
  } catch (e) {
    console.error('ingestPunches error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/**
 * GET /api/biometric/sync-state?company=jain-impex
 * Tells the agent the highest sourceId already stored, so it can resume from there.
 */
export const getSyncState = async (req, res) => {
  try {
    const company = req.query.company;
    if (!company || !isValidCompany(company)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing company' });
    }
    const BiometricPunch = getModel(company);
    const latest = await BiometricPunch.findOne().sort({ sourceId: -1 }).select('sourceId').lean();
    const total = await BiometricPunch.estimatedDocumentCount();
    res.json({ success: true, lastSourceId: latest ? latest.sourceId : 0, total });
  } catch (e) {
    console.error('getSyncState error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/**
 * GET /api/biometric-view/punches  (authenticated admin view)
 * Lists stored biometric punches for the logged-in user's company.
 * Query: page, limit, search (cardNo), from, to (yyyy-mm-dd)
 */
export const listPunches = async (req, res) => {
  try {
    const BiometricPunch = req.dbConnection.models.BiometricPunch
      || req.dbConnection.model('BiometricPunch', biometricPunchSchema);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const { search, from, to } = req.query;

    const query = {};
    if (search && search.trim()) {
      query.cardNo = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    if (from || to) {
      query.punchAt = {};
      if (from) query.punchAt.$gte = new Date(`${from}T00:00:00+05:30`);
      if (to)   query.punchAt.$lte = new Date(`${to}T23:59:59+05:30`);
    }

    const [rows, total, latest] = await Promise.all([
      BiometricPunch.find(query)
        .sort({ punchAt: -1, sourceId: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BiometricPunch.countDocuments(query),
      BiometricPunch.findOne().sort({ punchAt: -1 }).select('punchAt').lean(),
    ]);

    res.json({
      success: true,
      punches: rows,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      lastPunchAt: latest ? latest.punchAt : null,
    });
  } catch (e) {
    console.error('listPunches error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/**
 * GET /api/biometric-view/stats  (authenticated admin view)
 * Quick counts for the dashboard header.
 */
export const punchStats = async (req, res) => {
  try {
    const BiometricPunch = req.dbConnection.models.BiometricPunch
      || req.dbConnection.model('BiometricPunch', biometricPunchSchema);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [total, today, latest, distinctCards] = await Promise.all([
      BiometricPunch.estimatedDocumentCount(),
      BiometricPunch.countDocuments({ punchAt: { $gte: startOfToday } }),
      BiometricPunch.findOne().sort({ punchAt: -1 }).select('punchAt').lean(),
      BiometricPunch.distinct('cardNo'),
    ]);

    res.json({
      success: true,
      total,
      today,
      lastPunchAt: latest ? latest.punchAt : null,
      uniqueCards: distinctCards.length,
    });
  } catch (e) {
    console.error('punchStats error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

