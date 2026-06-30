import { biometricPunchSchema } from '../models/BiometricPunch.js';
import { biometricEmployeeSchema } from '../models/BiometricEmployee.js';
import { employeeSchema } from '../models/Employee.js';
import { getCompanyConnection, isValidCompany } from '../config/multiDatabase.js';

// Resolve the BiometricPunch model on the right company's database
const getModel = (company) => {
  const conn = getCompanyConnection(company);
  return conn.models.BiometricPunch || conn.model('BiometricPunch', biometricPunchSchema);
};

const getEmpModel = (company) => {
  const conn = getCompanyConnection(company);
  return conn.models.BiometricEmployee || conn.model('BiometricEmployee', biometricEmployeeSchema);
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
      if (!p.cardNo || !p.punchAt) continue;
      const punchAt = new Date(p.punchAt);
      if (isNaN(punchAt.getTime())) continue;
      const cardNo = String(p.cardNo).trim();
      const machineNo = String(p.machineNo || '1');
      const sourceId = Number.isFinite(parseInt(p.sourceId, 10)) ? parseInt(p.sourceId, 10) : null;
      if (sourceId && sourceId > maxSourceId) maxSourceId = sourceId;

      ops.push({
        updateOne: {
          // Idempotent on who + when + which device
          filter: { cardNo, punchAt, machineNo },
          update: {
            $setOnInsert: { cardNo, punchAt, machineNo, sourceId, processed: false },
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

    const latest = await BiometricPunch.findOne().sort({ punchAt: -1 }).select('punchAt').lean();

    console.log(`🟢 [biometric/${company}] received ${punches.length}, inserted ${inserted}, lastPunchAt ${latest?.punchAt ?? 'n/a'}`);

    res.json({
      success: true,
      received: punches.length,
      inserted,
      duplicates: ops.length - inserted,
      lastPunchAt: latest ? latest.punchAt : null,
    });
  } catch (e) {
    console.error('ingestPunches error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/**
 * POST /api/biometric/employees  (device agent, API key)
 * Body: { company, employees: [{ cardNo, name, empCode }] }
 * Upserts the card->name map synced from the RealTime Mst_Employee table.
 */
export const ingestEmployees = async (req, res) => {
  try {
    const { company, employees } = req.body;
    if (!company || !isValidCompany(company)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing company' });
    }
    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ success: false, message: 'No employees provided' });
    }
    const Emp = getEmpModel(company);
    const ops = [];
    for (const e of employees) {
      const cardNo = String(e.cardNo || '').trim();
      if (!cardNo) continue;
      ops.push({
        updateOne: {
          filter: { cardNo },
          update: { $set: { name: String(e.name || '').trim(), empCode: String(e.empCode || '').trim() } },
          upsert: true,
        },
      });
    }
    if (ops.length === 0) return res.json({ success: true, upserted: 0 });
    const result = await Emp.bulkWrite(ops, { ordered: false });
    res.json({ success: true, received: employees.length, matched: result.modifiedCount || 0, inserted: result.upsertedCount || 0 });
  } catch (e) {
    console.error('ingestEmployees error:', e);
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
    const latest = await BiometricPunch.findOne().sort({ punchAt: -1 }).select('punchAt sourceId').lean();
    const total = await BiometricPunch.estimatedDocumentCount();
    res.json({
      success: true,
      lastSourceId: latest && latest.sourceId ? latest.sourceId : 0,
      lastPunchAt: latest ? latest.punchAt : null,
      total,
    });
  } catch (e) {
    console.error('getSyncState error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/**
 * GET /api/biometric-view/device-cards  (authenticated admin view)
 * Lists every biometric card known to the CRM — enrolled names synced from the
 * device (BiometricEmployee) unioned with any card seen in punches — annotated
 * with whether it's already linked to a CRM employee, plus last-punch info.
 * Used by the Employee Registration card-picker and the "unmapped cards" panel.
 */
const stripZeros = (s) => String(s || '').trim().replace(/^0+/, '');

export const listDeviceCards = async (req, res) => {
  try {
    const db = req.dbConnection;
    const BiometricEmployee = db.models.BiometricEmployee || db.model('BiometricEmployee', biometricEmployeeSchema);
    const BiometricPunch = db.models.BiometricPunch || db.model('BiometricPunch', biometricPunchSchema);
    const Employee = db.models.Employee || db.model('Employee', employeeSchema);

    const [enrolled, punchAgg, employees] = await Promise.all([
      BiometricEmployee.find().select('cardNo name empCode').lean(),
      BiometricPunch.aggregate([
        { $group: { _id: '$cardNo', lastPunchAt: { $max: '$punchAt' }, count: { $sum: 1 } } },
      ]),
      Employee.find({}).select('biometricCardNo empId name').lean(),
    ]);

    // Build linked-card lookup (exact + zero-stripped on card and empId)
    const linkedByCard = new Map();
    for (const e of employees) {
      const keys = new Set();
      if (e.biometricCardNo) { keys.add(String(e.biometricCardNo).trim()); keys.add(stripZeros(e.biometricCardNo)); }
      if (e.empId) { keys.add(String(e.empId).trim()); keys.add(stripZeros(e.empId)); }
      for (const k of keys) if (k) linkedByCard.set(k, { _id: e._id, name: e.name, empId: e.empId });
    }

    const punchByCard = new Map();
    punchAgg.forEach((p) => punchByCard.set(String(p._id).trim(), p));

    // Union of cardNos
    const cardSet = new Set();
    enrolled.forEach((c) => cardSet.add(String(c.cardNo).trim()));
    punchAgg.forEach((p) => cardSet.add(String(p._id).trim()));

    const enrolledByCard = new Map();
    enrolled.forEach((c) => enrolledByCard.set(String(c.cardNo).trim(), c));

    const cards = [...cardSet].map((cardNo) => {
      const en = enrolledByCard.get(cardNo);
      const pa = punchByCard.get(cardNo);
      const linked = linkedByCard.get(cardNo) || linkedByCard.get(stripZeros(cardNo)) || null;
      return {
        cardNo,
        deviceName: en?.name || '',
        empCode: en?.empCode || '',
        lastPunchAt: pa?.lastPunchAt || null,
        punchCount: pa?.count || 0,
        linked: !!linked,
        linkedEmployeeName: linked?.name || '',
        linkedEmpId: linked?.empId || '',
      };
    });

    // sort: unlinked-with-punches first (need attention), then by name/card
    cards.sort((a, b) => {
      if (a.linked !== b.linked) return a.linked ? 1 : -1;
      return (b.punchCount || 0) - (a.punchCount || 0);
    });

    res.json({
      success: true,
      cards,
      total: cards.length,
      unmapped: cards.filter((c) => !c.linked && c.punchCount > 0).length,
    });
  } catch (e) {
    console.error('listDeviceCards error:', e);
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
    const BiometricEmployee = req.dbConnection.models.BiometricEmployee
      || req.dbConnection.model('BiometricEmployee', biometricEmployeeSchema);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const { search, from, to } = req.query;

    const query = {};
    if (search && search.trim()) {
      const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = { $regex: safe, $options: 'i' };
      // Search by card no OR by employee name (resolve names -> their cardNos)
      const matchedEmps = await BiometricEmployee.find({ name: rx }).select('cardNo').lean();
      const cardsFromName = matchedEmps.map((e) => e.cardNo);
      query.$or = [{ cardNo: rx }];
      if (cardsFromName.length) query.$or.push({ cardNo: { $in: cardsFromName } });
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

    // Attach employee name/code from the synced card map
    const cardNos = [...new Set(rows.map((r) => r.cardNo))];
    const emps = await BiometricEmployee.find({ cardNo: { $in: cardNos } }).select('cardNo name empCode').lean();
    const empByCard = {};
    emps.forEach((e) => { empByCard[e.cardNo] = e; });
    const punches = rows.map((r) => ({
      ...r,
      employeeName: empByCard[r.cardNo]?.name || '',
      empCode: empByCard[r.cardNo]?.empCode || '',
    }));

    res.json({
      success: true,
      punches,
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

