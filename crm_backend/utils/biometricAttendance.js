// =====================================================================
//  Biometric Phase 2 — turn raw BiometricPunch rows into HRMS Attendance.
//
//  Flow:
//   1. Map each punch's cardNo -> a CRM Employee (via Employee.biometricCardNo,
//      falling back to empId, with zero-padding tolerance).
//   2. For every affected (employee, day), gather ALL that day's punches,
//      de-dupe rapid double-taps, and pair them into in/out sessions
//      (1st=in, 2nd=out, 3rd=in ...). Odd trailing punch = open session.
//   3. Upsert the day's Attendance: recompute the biometric-sourced sessions
//      while preserving any sessions from other sources (web/app/manual) and
//      never overwriting a 'Leave' day.
//   4. Mark the consumed punches processed (+ link employee) — idempotent.
//
//  The Attendance model's pre-save derives punchIn/punchOut/workingHours and a
//  basic status; the salary engine recomputes late/OT from the employee shift.
// =====================================================================

import { biometricPunchSchema } from '../models/BiometricPunch.js';
import { employeeSchema } from '../models/Employee.js';
import { attendanceSchema } from '../models/Attendance.js';

const DEDUP_SECONDS = 60; // ignore a second scan within 60s of the previous kept one

const getModels = (db) => ({
  BiometricPunch: db.models.BiometricPunch || db.model('BiometricPunch', biometricPunchSchema),
  Employee: db.models.Employee || db.model('Employee', employeeSchema),
  Attendance: db.models.Attendance || db.model('Attendance', attendanceSchema),
});

// Strip leading zeros for tolerant matching ("00000034" -> "34"). Empty stays "".
const stripZeros = (s) => String(s || '').trim().replace(/^0+/, '');

// "HH:mm" -> minutes since midnight, with a fallback default.
const hmToMin = (hm, def = 600) => {
  if (!hm || typeof hm !== 'string' || !hm.includes(':')) return def;
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return def;
  return h * 60 + m;
};

// Day bucket = server-local midnight Date. MUST match every other attendance
// writer (web punch, leave approve, crons, salary) which all use
// `new Date(x); setHours(0,0,0,0)`. Using a different convention (e.g. IST ISO)
// would create off-by-one days and duplicate Attendance docs on a UTC server.
const dayStartOf = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Build a card -> employee resolver from the current employee list.
 * Tries: exact biometricCardNo, zero-stripped biometricCardNo, exact empId,
 * zero-stripped empId.
 */
const buildResolver = (employees) => {
  const byCard = new Map();
  const byCardStripped = new Map();
  const byEmpId = new Map();
  const byEmpIdStripped = new Map();

  for (const e of employees) {
    if (e.biometricCardNo) {
      byCard.set(String(e.biometricCardNo).trim(), e);
      byCardStripped.set(stripZeros(e.biometricCardNo), e);
    }
    if (e.empId) {
      byEmpId.set(String(e.empId).trim(), e);
      byEmpIdStripped.set(stripZeros(e.empId), e);
    }
  }

  return (cardNo) => {
    const c = String(cardNo || '').trim();
    if (!c) return null;
    const cs = stripZeros(c);
    return (
      byCard.get(c) ||
      byCardStripped.get(cs) ||
      byEmpId.get(c) ||
      (cs && byEmpIdStripped.get(cs)) ||
      null
    );
  };
};

// Pair a sorted list of punch times into in/out sessions (biometric source).
const pairSessions = (times) => {
  // de-dupe rapid repeats
  const kept = [];
  for (const t of times) {
    const last = kept[kept.length - 1];
    if (last && (new Date(t) - new Date(last)) / 1000 < DEDUP_SECONDS) continue;
    kept.push(t);
  }
  const sessions = [];
  for (let i = 0; i < kept.length; i += 2) {
    const inT = kept[i];
    const outT = kept[i + 1] || null;
    const session = { in: { time: inT, source: 'biometric' } };
    if (outT) session.out = { time: outT, source: 'biometric' };
    sessions.push(session);
  }
  return sessions;
};

/**
 * Process all unprocessed punches into attendance.
 * Returns { processedPunches, affectedDays, updatedAttendance }.
 */
export const processBiometricPunches = async (db, { batchLimit = 5000 } = {}) => {
  const { BiometricPunch, Employee, Attendance } = getModels(db);

  const pending = await BiometricPunch.find({ processed: false })
    .sort({ punchAt: 1 })
    .limit(batchLimit)
    .lean();

  if (pending.length === 0) {
    return { processedPunches: 0, affectedDays: 0, updatedAttendance: 0, unmapped: 0 };
  }

  const employees = await Employee.find({})
    .select('_id empId biometricCardNo status shiftStart')
    .lean();
  const resolve = buildResolver(employees);

  // Collect affected (employeeId|dayKey) pairs from the pending punches.
  const affected = new Map(); // key: `${empId}|${dayTime}` -> { employeeId, dayStart }
  let unmapped = 0;
  for (const p of pending) {
    const emp = resolve(p.cardNo);
    if (!emp) { unmapped += 1; continue; }
    const dayStart = dayStartOf(p.punchAt);
    affected.set(`${emp._id}|${dayStart.getTime()}`, { employeeId: emp._id, dayStart });
  }

  let updatedAttendance = 0;

  for (const { employeeId, dayStart } of affected.values()) {
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // ALL punches for this employee's card(s) that day — rebuild from scratch.
    const emp = employees.find((e) => String(e._id) === String(employeeId));
    const cardCandidates = [emp.biometricCardNo, emp.empId].filter(Boolean).map((x) => String(x).trim());
    const strippedSet = new Set(cardCandidates.map(stripZeros));

    const dayPunches = await BiometricPunch.find({
      punchAt: { $gte: dayStart, $lt: dayEnd },
    }).select('cardNo punchAt').lean();

    const times = dayPunches
      .filter((p) => {
        const c = String(p.cardNo).trim();
        return cardCandidates.includes(c) || strippedSet.has(stripZeros(c));
      })
      .map((p) => p.punchAt)
      .sort((a, b) => new Date(a) - new Date(b));

    if (times.length === 0) continue;

    const bioSessions = pairSessions(times);

    // Upsert attendance, preserving non-biometric sessions and Leave days.
    let att = await Attendance.findOne({ employee: employeeId, date: dayStart });
    if (!att) {
      att = new Attendance({ employee: employeeId, date: dayStart, sessions: [] });
    }
    if (att.status === 'Leave') {
      // Don't disturb an approved leave day; punches that day are informational.
      continue;
    }
    const nonBio = (att.sessions || []).filter(
      (s) => (s.in?.source && s.in.source !== 'biometric')
    );
    att.sessions = [...nonBio, ...bioSessions].sort(
      (a, b) => new Date(a.in.time) - new Date(b.in.time)
    );
    await att.save(); // pre-save derives punchIn/out, workingHours, status

    // Correct the status/late using THIS employee's shift. We use updateOne (NOT
    // att.save()) because the Attendance pre-save hook re-derives status/late from
    // a generic 9:30 threshold and would otherwise overwrite our shift-correct value.
    const shiftStartMin = hmToMin(emp.shiftStart, 600); // default 10:00
    const firstIn = att.sessions[0]?.in?.time ? new Date(att.sessions[0].in.time) : null;
    if (firstIn && att.status !== 'Leave') {
      const firstInMin = firstIn.getHours() * 60 + firstIn.getMinutes();
      const lateBy = firstInMin - shiftStartMin;
      const newStatus = lateBy > 0 ? 'Late' : 'Present';
      const newLate = lateBy > 0 ? lateBy : 0;
      if (att.status !== newStatus || (att.lateMinutes || 0) !== newLate) {
        await Attendance.updateOne(
          { _id: att._id },
          { $set: { status: newStatus, lateMinutes: newLate } }
        );
      }
    }
    updatedAttendance += 1;
  }

  // Mark the pending punches processed (+ link the resolved employee).
  const bulk = [];
  for (const p of pending) {
    const emp = resolve(p.cardNo);
    bulk.push({
      updateOne: {
        filter: { _id: p._id },
        update: { $set: { processed: true, employee: emp ? emp._id : null } },
      },
    });
  }
  if (bulk.length) await BiometricPunch.bulkWrite(bulk, { ordered: false });

  return {
    processedPunches: pending.length,
    affectedDays: affected.size,
    updatedAttendance,
    unmapped,
  };
};

const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

/**
 * End-of-day finalizer for a given IST day key (default: yesterday).
 * Marks Absent any active employee who has no attendance record that day and is
 * not on their weekly-off (Leave days are created elsewhere and are skipped).
 */
export const finalizeDayAttendance = async (db, dateInput = null) => {
  const { Employee, Attendance } = getModels(db);

  // Default to yesterday (server-local), matching the rest of the system.
  let dayStart;
  if (dateInput) {
    dayStart = dayStartOf(dateInput);
  } else {
    dayStart = dayStartOf(new Date());
    dayStart.setDate(dayStart.getDate() - 1);
  }
  const dow = dayStart.getDay();
  const dayKey = dayStart.toISOString().slice(0, 10);

  const employees = await Employee.find({ status: 'Active' })
    .select('_id weeklyOff').lean();

  let marked = 0;
  for (const emp of employees) {
    const offIdx = DAY_INDEX[emp.weeklyOff] ?? 0;
    if (dow === offIdx) continue; // weekly off — paid, skip

    const existing = await Attendance.findOne({ employee: emp._id, date: dayStart }).lean();
    if (existing) continue; // has punches or leave already

    try {
      await Attendance.create({ employee: emp._id, date: dayStart, status: 'Absent', sessions: [] });
      marked += 1;
    } catch (e) {
      if (e.code !== 11000) throw e; // ignore race duplicates
    }
  }
  return { dayKey, marked };
};
