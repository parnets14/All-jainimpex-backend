import { hrmsSettingsSchema } from '../models/HrmsSettings.js';
import { leavePolicySchema } from '../models/LeavePolicy.js';
import { leaveBalanceSchema } from '../models/LeaveBalance.js';
import { employeeSchema } from '../models/Employee.js';

// IST midnight: given any date, returns the UTC instant of IST midnight for that calendar day.
const istMidnight = (d = new Date()) => {
  const ms = new Date(d).getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(ms);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 60 * 60 * 1000);
};const getModels = (conn) => ({
  HrmsSettings: conn.models.HrmsSettings || conn.model('HrmsSettings', hrmsSettingsSchema),
  LeavePolicy: conn.models.LeavePolicy || conn.model('LeavePolicy', leavePolicySchema),
  LeaveBalance: conn.models.LeaveBalance || conn.model('LeaveBalance', leaveBalanceSchema),
  Employee: conn.models.Employee || conn.model('Employee', employeeSchema),
});

// Financial year that a date belongs to (FY starts in `fyStartMonth`, e.g. April).
export const fyYearOf = (date, fyStartMonth = 4) => {
  const d = new Date(date);
  return (d.getMonth() + 1) >= fyStartMonth ? d.getFullYear() : d.getFullYear() - 1;
};

// ── HRMS settings (OT / late / lunch / alert) ──
export const getSettings = async (req, res) => {
  try {
    const { HrmsSettings } = getModels(req.dbConnection);
    let s = await HrmsSettings.findOne({ key: 'default' });
    if (!s) s = await HrmsSettings.create({ key: 'default' });
    res.json({ success: true, settings: s });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

export const updateSettings = async (req, res) => {
  try {
    const { HrmsSettings } = getModels(req.dbConnection);
    const body = { ...req.body };
    delete body.key; delete body._id;
    body.updatedBy = req.user?._id;
    const s = await HrmsSettings.findOneAndUpdate(
      { key: 'default' }, { $set: body }, { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, settings: s, message: 'Settings saved' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Leave policy ──
export const getLeavePolicy = async (req, res) => {
  try {
    const { LeavePolicy } = getModels(req.dbConnection);
    let p = await LeavePolicy.findOne({ key: 'default' });
    if (!p) p = await LeavePolicy.create({ key: 'default' });
    res.json({ success: true, policy: p });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

export const updateLeavePolicy = async (req, res) => {
  try {
    const { LeavePolicy } = getModels(req.dbConnection);
    const body = { ...req.body };
    delete body.key; delete body._id;
    body.updatedBy = req.user?._id;
    const p = await LeavePolicy.findOneAndUpdate(
      { key: 'default' }, { $set: body }, { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, policy: p, message: 'Leave policy saved' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Leave balances ──
// List balances for the current FY, merged with policy quotas -> remaining.
export const getLeaveBalances = async (req, res) => {
  try {
    const { LeavePolicy, LeaveBalance, Employee } = getModels(req.dbConnection);
    const policy = (await LeavePolicy.findOne({ key: 'default' })) || { types: [], financialYearStartMonth: 4 };
    const fyYear = parseInt(req.query.fyYear, 10) || fyYearOf(new Date(), policy.financialYearStartMonth);

    const employees = await Employee.find({ status: 'Active' }).select('name empId designation department').lean();
    const balances = await LeaveBalance.find({ fyYear }).lean();
    const byEmp = {};
    balances.forEach((b) => { byEmp[String(b.employee)] = b; });

    const rows = employees.map((emp) => {
      const bal = byEmp[String(emp._id)];
      const types = (policy.types || []).filter((t) => t.active).map((t) => {
        const tb = bal?.balances?.find((x) => x.key === t.key) || { accrued: 0, used: 0 };
        return {
          key: t.key, label: t.label, quota: t.annualQuota,
          accrued: tb.accrued || 0, used: tb.used || 0,
          remaining: parseFloat(((tb.accrued || 0) - (tb.used || 0)).toFixed(2)),
        };
      });
      return { employee: { _id: emp._id, name: emp.name, empId: emp.empId, designation: emp.designation, department: emp.department }, types };
    });

    res.json({ success: true, fyYear, balances: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Manually adjust an employee's balance for a type (set accrued and/or used).
export const adjustLeaveBalance = async (req, res) => {
  try {
    const { LeaveBalance, LeavePolicy } = getModels(req.dbConnection);
    const { employeeId, typeKey, accrued, used } = req.body;
    const policy = await LeavePolicy.findOne({ key: 'default' });
    const fyYear = parseInt(req.body.fyYear, 10) || fyYearOf(new Date(), policy?.financialYearStartMonth || 4);
    if (!employeeId || !typeKey) return res.status(400).json({ success: false, message: 'employeeId and typeKey required' });

    let bal = await LeaveBalance.findOne({ employee: employeeId, fyYear });
    if (!bal) bal = new LeaveBalance({ employee: employeeId, fyYear, balances: [] });
    let tb = bal.balances.find((x) => x.key === typeKey);
    if (!tb) { tb = { key: typeKey, accrued: 0, used: 0 }; bal.balances.push(tb); tb = bal.balances[bal.balances.length - 1]; }
    if (accrued !== undefined) tb.accrued = Number(accrued);
    if (used !== undefined) tb.used = Number(used);
    bal.markModified('balances');
    await bal.save();
    res.json({ success: true, balance: bal, message: 'Balance updated' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Credit accruals for all active employees (used by cron + manual trigger).
// - upfront types: credited once per FY (to annualQuota) if not already.
// - monthly types: credit (quota/12) for the current month if not yet credited.
export const runAccrual = async (conn) => {
  const { LeavePolicy, LeaveBalance, Employee } = getModels(conn);
  const policy = await LeavePolicy.findOne({ key: 'default' });
  if (!policy) return { credited: 0 };
  const now = new Date();
  const fyYear = fyYearOf(now, policy.financialYearStartMonth);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const employees = await Employee.find({ status: 'Active' }).select('_id dateOfJoining leaveLapseCycle').lean();
  let credited = 0;
  const activeTypes = (policy.types || []).filter((t) => t.active);

  for (const emp of employees) {
    let bal = await LeaveBalance.findOne({ employee: emp._id, fyYear });
    if (!bal) bal = new LeaveBalance({ employee: emp._id, fyYear, balances: [], lastAccrualMonth: '' });

    const cycle = emp.leaveLapseCycle === 'monthly' ? 'monthly' : 'yearly';

    if (cycle === 'monthly') {
      // Use-it-or-lose-it: on the first run of a new month, lapse the previous
      // month's balance and set this month's fresh allotment (annualQuota / 12).
      if (bal.lastAccrualMonth !== monthKey) {
        bal.balances = activeTypes.map((t) => ({
          key: t.key,
          accrued: parseFloat((t.annualQuota / 12).toFixed(2)),
          used: 0,
        }));
      }
    } else {
      // Yearly cycle: accumulate within the FY (lapse happens at FY end via a new
      // fyYear ledger). upfront types credited once; monthly types add 1/12 per month.
      const ensure = (key) => {
        let tb = bal.balances.find((x) => x.key === key);
        if (!tb) { bal.balances.push({ key, accrued: 0, used: 0 }); tb = bal.balances[bal.balances.length - 1]; }
        return tb;
      };
      activeTypes.forEach((t) => {
        const tb = ensure(t.key);
        if (t.creditStyle === 'upfront') {
          if (tb.accrued < t.annualQuota) tb.accrued = t.annualQuota;
        } else if (bal.lastAccrualMonth !== monthKey) {
          tb.accrued = parseFloat((tb.accrued + t.annualQuota / 12).toFixed(2));
        }
      });
    }

    bal.lastAccrualMonth = monthKey;
    bal.markModified('balances');
    await bal.save();
    credited++;
  }
  return { credited, fyYear, monthKey };
};

export const triggerAccrual = async (req, res) => {
  try {
    const result = await runAccrual(req.dbConnection);
    res.json({ success: true, ...result, message: `Accrual run for ${result.credited} employee(s)` });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ───────────────────────────────────────────────────────────
// Point 8 — No-punch alerts + admin day-marking
// ───────────────────────────────────────────────────────────
import { hrmsAlertSchema } from '../models/HrmsAlert.js';
import { attendanceSchema } from '../models/Attendance.js';

const getAlertModels = (conn) => ({
  HrmsAlert: conn.models.HrmsAlert || conn.model('HrmsAlert', hrmsAlertSchema),
  Attendance: conn.models.Attendance || conn.model('Attendance', attendanceSchema),
  LeaveBalance: conn.models.LeaveBalance || conn.model('LeaveBalance', leaveBalanceSchema),
  LeavePolicy: conn.models.LeavePolicy || conn.model('LeavePolicy', leavePolicySchema),
});

// GET /api/hrms/alerts?unreadOnly=true
export const getAlerts = async (req, res) => {
  try {
    const { HrmsAlert } = getAlertModels(req.dbConnection);
    const filter = {};
    if (req.query.unreadOnly === 'true') filter.read = false;
    const alerts = await HrmsAlert.find(filter)
      .populate('employee', 'name empId department')
      .sort({ date: -1, createdAt: -1 })
      .limit(200)
      .lean();
    const unreadCount = await HrmsAlert.countDocuments({ read: false });
    res.json({ success: true, alerts, unreadCount });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// PATCH /api/hrms/alerts/:id/read
export const markAlertRead = async (req, res) => {
  try {
    const { HrmsAlert } = getAlertModels(req.dbConnection);
    await HrmsAlert.findByIdAndUpdate(req.params.id, { $set: { read: true } });
    res.json({ success: true, message: 'Alert marked read' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Map a leave policy type key to the Attendance.leaveType enum string.
const attendanceLeaveTypeFor = (key) => {
  if (key === 'sick') return 'Sick Leave';
  if (key === 'casual') return 'Casual Leave';
  return 'Paid Leave';
};

// POST /api/hrms/attendance/mark-day
// body: { employeeId, date, action: 'present'|'paid-leave'|'unpaid-leave', leaveTypeKey?, reason? }
// Admin override (Point 8). For paid leave, deducts from balance; if insufficient,
// the excess day is converted to Unpaid (LOP).
export const markAttendanceDay = async (req, res) => {
  try {
    const { Attendance, LeaveBalance, LeavePolicy } = getAlertModels(req.dbConnection);
    const { employeeId, date, action, leaveTypeKey, reason = '' } = req.body;
    if (!employeeId || !date || !action) {
      return res.status(400).json({ success: false, message: 'employeeId, date and action are required' });
    }
    const day = istMidnight(new Date(date));
    const dayEnd = new Date(day.getTime() + 86400000 - 1);

    let att = await Attendance.findOne({ employee: employeeId, date: { $gte: day, $lte: dayEnd } });
    if (!att) att = new Attendance({ employee: employeeId, date: day, sessions: [] });

    // Was this day ALREADY a paid leave? Used to avoid double-deducting the balance
    // when an admin re-marks the same day. (Switching away does not auto-refund —
    // admin can correct via the Leave Balances screen.)
    const PAID_LEAVE_LABELS = ['Sick Leave', 'Casual Leave', 'Paid Leave'];
    const wasPaidLeave = att.status === 'Leave' && PAID_LEAVE_LABELS.includes(att.leaveType);

    if (action === 'present') {
      att.status = 'Present';
      att.leaveType = null;
      att.reason = reason;
    } else if (action === 'unpaid-leave') {
      att.status = 'Leave';
      att.leaveType = 'Unpaid Leave';
      att.reason = reason;
    } else if (action === 'paid-leave') {
      // try to consume 1 day from the chosen balance
      const policy = await LeavePolicy.findOne({ key: 'default' });
      const fyYear = fyYearOf(day, policy?.financialYearStartMonth || 4);
      const key = leaveTypeKey || 'casual';
      let bal = await LeaveBalance.findOne({ employee: employeeId, fyYear });
      let remaining = 0;
      if (bal) {
        const tb = bal.balances.find((x) => x.key === key);
        if (tb) remaining = (tb.accrued || 0) - (tb.used || 0);
      }
      if (remaining >= 1) {
        // consume one day (skip if the day was already a paid leave — no double deduct)
        if (!wasPaidLeave) {
          if (!bal) bal = new LeaveBalance({ employee: employeeId, fyYear, balances: [] });
          let tb = bal.balances.find((x) => x.key === key);
          if (!tb) { bal.balances.push({ key, accrued: 0, used: 0 }); tb = bal.balances[bal.balances.length - 1]; }
          tb.used = parseFloat(((tb.used || 0) + 1).toFixed(2));
          bal.markModified('balances');
          await bal.save();
        }
        att.status = 'Leave';
        att.leaveType = attendanceLeaveTypeFor(key);
        att.reason = reason;
      } else if (wasPaidLeave) {
        // already paid leave but balance now shows 0 — keep it paid, don't flip to unpaid
        att.status = 'Leave';
        att.leaveType = attendanceLeaveTypeFor(key);
        att.reason = reason;
      } else {
        // no balance → unpaid (LOP)
        att.status = 'Leave';
        att.leaveType = 'Unpaid Leave';
        att.reason = `${reason} (no ${key} balance → unpaid)`.trim();
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    await att.save();

    // clear any no-punch alert for that employee/day
    const { HrmsAlert } = getAlertModels(req.dbConnection);
    await HrmsAlert.updateOne(
      { type: 'no_punch_in', employee: employeeId, date: day },
      { $set: { read: true } }
    );

    res.json({ success: true, attendance: att, message: 'Day marked' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ───────────────────────────────────────────────────────────
// Point 10 — Working-time report (daily + monthly)
// ───────────────────────────────────────────────────────────
// GET /api/hrms/working-time?employeeId=&from=&to=
export const getWorkingTimeReport = async (req, res) => {
  try {
    const { Attendance } = getAlertModels(req.dbConnection);
    const { employeeId, from, to } = req.query;
    if (!employeeId || !from || !to) {
      return res.status(400).json({ success: false, message: 'employeeId, from and to are required' });
    }
    const fromD = istMidnight(new Date(from));
    const toD = new Date(istMidnight(new Date(to)).getTime() + 86400000 - 1);

    const records = await Attendance.find({
      employee: employeeId,
      date: { $gte: fromD, $lte: toD },
    }).sort({ date: 1 }).lean();

    const days = records.map((r) => {
      const sessions = (r.sessions || []).map((s) => ({
        in: s.in?.time || null,
        out: s.out?.time || null,
      }));
      return {
        date: r.date,
        status: r.status,
        leaveType: r.leaveType,
        punchIn: r.punchIn?.time || null,
        punchOut: r.punchOut?.time || null,
        sessions,
        sessionCount: sessions.length,
        workingHours: r.workingHours || 0,
        breakMinutes: r.breakMinutes || 0,
        lateMinutes: r.lateMinutes || 0,
      };
    });

    const totalHours = parseFloat(days.reduce((s, d) => s + (d.workingHours || 0), 0).toFixed(2));
    const presentDays = days.filter((d) => d.status === 'Present' || d.status === 'Late').length;

    res.json({
      success: true,
      report: { days, totalHours, presentDays, totalDays: days.length },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
