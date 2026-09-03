// =====================================================================
//  Biometric Phase 2 — turn raw BiometricPunch rows into HRMS Attendance.
//
//  Flow:
//   1. Map each punch's cardNo -> a CRM Employee (via Employee.biometricCardNo,
//      falling back to empId, with zero-padding tolerance).
//   2. For every affected (employee, day), gather ALL that day's punches,
//      de-dupe rapid double-taps, and pair them into in/out sessions
//      (1st=in, 2nd=out, 3rd=in ...). Odd trailing punch = open session.
//   3. Upsert the day's Attendance: recompute biometric sessions while
//      preserving sessions from other sources. Completed delayed punches may
//      reverse only a system-generated auto-paid leave; approved or manually
//      reviewed leave remains protected.
//   4. Mark consumed punches processed (+ link employee). Unmapped punches move
//      to a rotating retry queue so assigning their card later can replay them
//      without blocking newer mapped punches.
//
//  The Attendance model's pre-save derives punchIn/punchOut/workingHours and a
//  basic status; the salary engine recomputes late/OT from the employee shift.
// =====================================================================

import { biometricPunchSchema } from '../models/BiometricPunch.js';
import { employeeSchema } from '../models/Employee.js';
import { attendanceSchema } from '../models/Attendance.js';
import { holidaySchema } from '../models/Holiday.js';
import { leaveSchema } from '../models/Leave.js';

const DEDUP_SECONDS = 60; // ignore a second scan within 60s of the previous kept one

const getModels = (db) => ({
  BiometricPunch: db.models.BiometricPunch || db.model('BiometricPunch', biometricPunchSchema),
  Employee: db.models.Employee || db.model('Employee', employeeSchema),
  Attendance: db.models.Attendance || db.model('Attendance', attendanceSchema),
  Holiday: db.models.Holiday || db.model('Holiday', holidaySchema),
  Leave: db.models.Leave || db.model('Leave', leaveSchema),
});

// Strip leading zeros for tolerant matching ("00000034" -> "34"). Empty stays "".
const stripZeros = (s) => String(s || '').trim().replace(/^0+/, '');

// Day bucket = IST midnight as a UTC Date. The server runs in UTC, but all
// attendance dates must represent IST calendar days for salary/leave to work.
// IST = UTC+5:30, so IST midnight = 18:30 UTC of the previous day.
const dayStartOf = (date) => {
  const d = new Date(date);
  // Convert to IST then zero the time, then convert back to UTC
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const istDate = new Date(istMs);
  istDate.setUTCHours(0, 0, 0, 0); // midnight in IST (as if it were UTC)
  // Convert back: subtract IST offset to get the UTC instant of IST midnight
  return new Date(istDate.getTime() - 5.5 * 60 * 60 * 1000);
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

const clearAutomaticAbsenceDecision = (attendance) => {
  // Set Absent before save so Attendance's pre-save hook can derive Present or
  // Late from the newly reconstructed sessions. It intentionally does not
  // convert a single open punch into attendance.
  attendance.status = 'Absent';
  attendance.leaveType = null;
  attendance.reviewStatus = 'none';
  attendance.reviewReason = '';
  attendance.reviewedBy = null;
  attendance.reviewedAt = null;
  attendance.absentDeductionMultiplier = 1;
};

/**
 * Process all unprocessed punches into attendance.
 * Returns reconciliation and conflict counters for operational logging.
 */
export const processBiometricPunches = async (
  db,
  { batchLimit = 5000, punchAtRange = null, mappingRetryLimit = 250 } = {}
) => {
  const { BiometricPunch, Employee, Attendance, Leave } = getModels(db);
  const rangeFilter = punchAtRange
    ? { punchAt: { $gte: new Date(punchAtRange.start), $lt: new Date(punchAtRange.end) } }
    : {};

  // Unmapped rows are removed from the main queue, then retried separately in
  // oldest-attempt order. This keeps them replayable without allowing a large
  // unmapped backlog to starve new valid punches.
  const mappingRetryQuery = mappingRetryLimit > 0
    ? BiometricPunch.find({ processed: true, unmapped: true, ...rangeFilter })
        .sort({ lastMappingAttemptAt: 1, punchAt: 1 })
        .limit(mappingRetryLimit)
        .lean()
    : Promise.resolve([]);
  const [newPending, mappingRetries] = await Promise.all([
    BiometricPunch.find({ processed: false, ...rangeFilter })
      .sort({ punchAt: 1 })
      .limit(batchLimit)
      .lean(),
    mappingRetryQuery,
  ]);
  const candidates = [...newPending, ...mappingRetries];

  if (candidates.length === 0) {
    return {
      processedPunches: 0,
      affectedDays: 0,
      updatedAttendance: 0,
      unmapped: 0,
      restoredAutoPaidDays: 0,
      protectedLeaveDays: 0,
      protectedReviewedDays: 0,
    };
  }

  const employees = await Employee.find({})
    .select('_id empId biometricCardNo status shiftStart')
    .lean();
  const resolve = buildResolver(employees);

  const affected = new Map(); // key: `${empId}|${dayTime}` -> { employeeId, dayStart }
  let unmapped = 0;
  for (const punch of candidates) {
    const employee = resolve(punch.cardNo);
    if (!employee) { unmapped += 1; continue; }
    const dayStart = dayStartOf(punch.punchAt);
    affected.set(`${employee._id}|${dayStart.getTime()}`, {
      employeeId: employee._id,
      dayStart,
    });
  }

  let updatedAttendance = 0;
  let restoredAutoPaidDays = 0;
  let protectedLeaveDays = 0;
  let protectedReviewedDays = 0;
  const todayStart = dayStartOf(new Date());

  for (const { employeeId, dayStart } of affected.values()) {
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // ALL punches for this employee's card(s) that day — rebuild from scratch.
    const emp = employees.find((employee) => String(employee._id) === String(employeeId));
    const cardCandidates = [emp.biometricCardNo, emp.empId]
      .filter(Boolean)
      .map((value) => String(value).trim());
    const strippedSet = new Set(cardCandidates.map(stripZeros));

    const dayPunches = await BiometricPunch.find({
      punchAt: { $gte: dayStart, $lt: dayEnd },
    }).select('cardNo punchAt').lean();

    const times = dayPunches
      .filter((punch) => {
        const card = String(punch.cardNo).trim();
        return cardCandidates.includes(card) || strippedSet.has(stripZeros(card));
      })
      .map((punch) => punch.punchAt)
      .sort((a, b) => new Date(a) - new Date(b));

    if (times.length === 0) continue;

    const bioSessions = pairSessions(times);
    const hasCompletedBiometricSession = bioSessions.some(
      (session) => session.in?.time && session.out?.time
    );

    let att = await Attendance.findOne({ employee: employeeId, date: dayStart });
    if (!att) {
      att = new Attendance({ employee: employeeId, date: dayStart, sessions: [] });
    }

    if (att.status === 'Leave') {
      // A completed delayed pair may reverse only the cron's inferred monthly
      // free leave. Planned approved leave and human-reviewed excused leave are
      // deliberate decisions and must never be silently overwritten.
      if (att.reviewStatus !== 'auto_paid' || !hasCompletedBiometricSession) {
        protectedLeaveDays += 1;
        continue;
      }

      const approvedLeave = await Leave.exists({
        employee: employeeId,
        status: 'Approved',
        startDate: { $lt: dayEnd },
        endDate: { $gte: dayStart },
      });
      if (approvedLeave) {
        protectedLeaveDays += 1;
        continue;
      }

      clearAutomaticAbsenceDecision(att);
      restoredAutoPaidDays += 1;
    } else if (
      att.status === 'Absent' &&
      hasCompletedBiometricSession &&
      att.reviewStatus === 'unexcused' &&
      att.reviewedBy
    ) {
      // Preserve an explicit human unpaid decision. Automatic expired records
      // have reviewedBy=null and can safely follow the machine evidence.
      protectedReviewedDays += 1;
      continue;
    } else if (att.status === 'Absent' && hasCompletedBiometricSession) {
      clearAutomaticAbsenceDecision(att);
    }

    // Preserve every non-biometric session, including legacy sessions that did
    // not store an explicit source value.
    const nonBio = (att.sessions || []).filter(
      (session) => session.in?.time && session.in?.source !== 'biometric'
    );
    const mergedSessions = [...nonBio, ...bioSessions].sort(
      (a, b) => new Date(a.in.time) - new Date(b.in.time)
    );

    // For a closed historical day, an open punch is informational only. Bypass
    // the Attendance pre-save hook so it cannot promote Absent to Present/Late
    // without a punch-out. The current day still shows a live open punch and is
    // finalized by the normal end-of-day rule if no punch-out arrives.
    if (dayStart < todayStart && !hasCompletedBiometricSession) {
      if (att.isNew) {
        await Attendance.updateOne(
          { employee: employeeId, date: dayStart },
          { $setOnInsert: { status: 'Absent' }, $set: { sessions: mergedSessions } },
          { upsert: true, runValidators: true }
        );
      } else {
        await Attendance.updateOne(
          { _id: att._id },
          { $set: { sessions: mergedSessions } },
          { runValidators: true }
        );
      }
      updatedAttendance += 1;
      continue;
    }

    att.sessions = mergedSessions;
    await att.save(); // pre-save derives punchIn/out, workingHours, status and raw IST lateness

    // Do not recalculate status here. Attendance's pre-save hook already uses
    // this employee's shiftStart and explicit IST conversion. A second pass
    // based on Date#getHours() would depend on the server timezone and can turn
    // a 10:03 IST punch into 04:33 on a UTC host, incorrectly storing Present/0.
    updatedAttendance += 1;
  }

  const now = new Date();
  const bulk = candidates.map((punch) => {
    const employee = resolve(punch.cardNo);
    return {
      updateOne: {
        filter: { _id: punch._id },
        update: {
          $set: employee
            ? { processed: true, employee: employee._id, unmapped: false, lastMappingAttemptAt: null }
            : { processed: true, employee: null, unmapped: true, lastMappingAttemptAt: now },
        },
      },
    };
  });
  if (bulk.length) await BiometricPunch.bulkWrite(bulk, { ordered: false });

  return {
    processedPunches: candidates.length - unmapped,
    affectedDays: affected.size,
    updatedAttendance,
    unmapped,
    restoredAutoPaidDays,
    protectedLeaveDays,
    protectedReviewedDays,
  };
};

const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

/**
 * End-of-day finalizer for a given IST day key (default: yesterday).
 * Two rules:
 *  1. Marks Absent any active employee who has NO attendance record and is not
 *     on their weekly-off.
 *  2. If an employee punched IN but never punched OUT (only open session, no
 *     completed in+out pair), mark them Absent — per client rule "no punch out
 *     = absent for that day". The punch-in stays on record for visibility.
 * Leave days are never overwritten.
 */
export const finalizeDayAttendance = async (db, dateInput = null) => {
  const { Employee, Attendance, Holiday } = getModels(db);

  // Default to yesterday (server-local), matching the rest of the system.
  let dayStart;
  if (dateInput) {
    dayStart = dayStartOf(dateInput);
  } else {
    dayStart = dayStartOf(new Date());
    dayStart.setDate(dayStart.getDate() - 1);
  }
  // Get IST day-of-week (dayStart is stored as UTC midnight of IST day)
  // Add 5.5h to get back to IST, then getUTCDay()
  const dow = new Date(dayStart.getTime() + 5.5 * 60 * 60 * 1000).getUTCDay();
  const dayKey = dayStart.toISOString().slice(0, 10);

  const employees = await Employee.find({ status: 'Active' })
    .select('_id weeklyOff department dateOfJoining').lean();
  const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
  const holidays = await Holiday.find({ date: { $gte: dayStart, $lte: dayEnd } })
    .select('departments').lean();

  let marked = 0;
  for (const emp of employees) {
    const getOffDays = (weeklyOff) => {
      if (!weeklyOff) return [];
      const days = Array.isArray(weeklyOff) ? weeklyOff : [weeklyOff];
      return days.map(d => DAY_INDEX[d]).filter(d => d !== undefined);
    };
    const offDays = getOffDays(emp.weeklyOff);
    if (offDays.includes(dow)) continue; // weekly off — paid, skip
    const appliesHoliday = holidays.some((h) => !h.departments?.length || h.departments.includes(emp.department));
    if (appliesHoliday) continue; // holiday — paid, skip
    if (emp.dateOfJoining && dayStart < dayStartOf(emp.dateOfJoining)) continue;

    const existing = await Attendance.findOne({ employee: emp._id, date: dayStart }).lean();

    if (!existing) {
      // No record at all → Absent
      try {
        await Attendance.create({ employee: emp._id, date: dayStart, status: 'Absent', sessions: [] });
        marked += 1;
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
    } else if (existing.status === 'Leave') {
      continue; // never touch approved leave
    } else {
      // Has a record — check if there's at least one COMPLETED session (in + out).
      // If only open sessions (punch-in without punch-out), mark Absent.
      const completed = (existing.sessions || []).filter(
        (s) => s.in?.time && s.out?.time
      );
      if (completed.length === 0) {
        // Only punch-in, no punch-out → Absent (punch-in stays in sessions for visibility)
        await Attendance.updateOne(
          { _id: existing._id },
          { $set: { status: 'Absent', workingHours: 0, lateMinutes: 0 } }
        );
        marked += 1;
      }
    }
  }
  return { dayKey, marked };
};
