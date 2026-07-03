// HRMS salary computation helpers (Points 2, 5, 7, 3).
// Pure functions that turn a month's attendance + the employee's shift +
// company HrmsSettings into overtime / late / shortfall figures used by the
// salary engine. All admin-configurable via HrmsSettings.

const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

// "HH:mm" -> minutes since midnight (null if invalid)
const hmToMinutes = (hm) => {
  if (!hm || typeof hm !== 'string' || !hm.includes(':')) return null;
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

// minutes-since-midnight of a Date (local time)
const dateToMinutes = (d) => {
  const t = new Date(d);
  return t.getHours() * 60 + t.getMinutes() + t.getSeconds() / 60;
};

const round2 = (v) => parseFloat(Number(v || 0).toFixed(2));

// Worked minutes for a record: prefer multi-punch sessions, else legacy punchIn/out.
const recordWorkedMinutes = (rec) => {
  const sessions = (rec.sessions || []).filter((s) => s.in?.time && s.out?.time);
  if (sessions.length > 0) {
    let ms = 0;
    sessions.forEach((s) => { ms += new Date(s.out.time) - new Date(s.in.time); });
    return Math.max(0, ms / 60000);
  }
  if (rec.punchIn?.time && rec.punchOut?.time) {
    return Math.max(0, (new Date(rec.punchOut.time) - new Date(rec.punchIn.time)) / 60000);
  }
  // fall back to stored workingHours if present
  return (rec.workingHours || 0) * 60;
};

const recordFirstInMinutes = (rec) => {
  if (rec.sessions?.length && rec.sessions[0].in?.time) return dateToMinutes(rec.sessions[0].in.time);
  if (rec.punchIn?.time) return dateToMinutes(rec.punchIn.time);
  return null;
};

const recordLastOutMinutes = (rec) => {
  const sessions = (rec.sessions || []).filter((s) => s.out?.time);
  if (sessions.length) return dateToMinutes(sessions[sessions.length - 1].out.time);
  if (rec.punchOut?.time) return dateToMinutes(rec.punchOut.time);
  return null;
};

/**
 * Count paid working days in a month for an employee, skipping their weekly off.
 * Returns { workingDays } where weekly-off days are excluded (they are paid but
 * not part of the divisor used for per-day deductions).
 */
export const countWorkingDays = (year, month, employee) => {
  const offDay = DAY_INDEX[employee?.weeklyOff] ?? -1; // -1 = 'None'
  // Use IST boundaries: first day of month at IST midnight
  const istMid = (d) => {
    const ms = new Date(d).getTime() + 5.5 * 3600000;
    const ist = new Date(ms); ist.setUTCHours(0, 0, 0, 0);
    return new Date(ist.getTime() - 5.5 * 3600000);
  };
  const from = istMid(new Date(year, month - 1, 1));
  const to = istMid(new Date(year, month, 0));
  let workingDays = 0;
  const d = new Date(from);
  while (d <= to) {
    // Use IST day-of-week
    const istDay = new Date(d.getTime() + 5.5 * 3600000).getUTCDay();
    if (istDay !== offDay) workingDays++;
    d.setTime(d.getTime() + 86400000); // advance by exactly one IST day
  }
  return { workingDays };
};

/**
 * Compute OT / late / shortfall aggregates for the month.
 * @returns {
 *   otMinutes, otAmount,
 *   shortfallMinutes, shortfallAmount,
 *   lateDaysCount, lateProportionalAmount, lateSlabHalfDays, lateSlabFullDays,
 *   lateMode
 * }
 * Per-day-salary based deductions (slab/count days, perDay) are finalized by the caller
 * because they depend on grossSalary/workingDays.
 */
export const computeAttendanceAdjustments = (attendance, employee, settings) => {
  const s = settings || {};
  const shiftStartMin = hmToMinutes(employee?.shiftStart) ?? 600; // default 10:00
  let shiftEndMin = hmToMinutes(employee?.shiftEnd) ?? 1080;       // default 18:00
  // overnight shift guard
  if (shiftEndMin <= shiftStartMin) shiftEndMin += 24 * 60;
  const shiftDurationMin = shiftEndMin - shiftStartMin;
  const offDay = DAY_INDEX[employee?.weeklyOff] ?? -1; // weekly-off: no late/shortfall penalty

  const otBuffer = Number(s.otBufferMinutes) || 0;
  const otRate = Number(s.otRate) || 0;
  const otPerMinute = s.otRateMode === 'perMinute';

  const lateGrace = Number(s.lateGraceMinutes) || 0;
  const lateMode = s.lateDeductionMode || 'proportional';
  const lateRate = Number(s.lateRate) || 0;
  const latePerMinute = s.lateRateMode !== 'perHour';
  const lateUsesFullTime = !!s.lateProportionalUsesFullTime;

  const allowedLunch = Number(s.allowedLunchMinutes) || 0;
  const shortfallGrace = Number(s.shortfallGraceMinutes) || 0;
  const shortfallRate = Number(s.shortfallRate) || 0;
  const shortfallPerMinute = s.shortfallRateMode !== 'perHour';
  const requiredMin = Math.max(0, shiftDurationMin - allowedLunch);

  let otMinutes = 0;
  let shortfallMinutes = 0;
  let lateExcessMinutes = 0;   // for proportional
  let lateDaysCount = 0;       // any day late beyond grace
  let lateSlabHalfDays = 0;
  let lateSlabFullDays = 0;

  for (const rec of attendance) {
    const isWorkedStatus = rec.status === 'Present' || rec.status === 'Late';
    if (!isWorkedStatus) continue;

    // On the employee's weekly-off day we never penalize (late/shortfall); OT for
    // extra work is still credited below.
    const isWeeklyOff = offDay >= 0 && new Date(new Date(rec.date).getTime() + 5.5 * 3600000).getUTCDay() === offDay;

    // ── Late (Point 7): first punch-in vs shift start, beyond grace ──
    const firstIn = recordFirstInMinutes(rec);
    if (!isWeeklyOff && firstIn != null) {
      const lateBy = firstIn - shiftStartMin; // minutes after shift start
      if (lateBy > lateGrace) {
        lateDaysCount++;
        const excess = lateUsesFullTime ? lateBy : (lateBy - lateGrace);
        lateExcessMinutes += Math.max(0, excess);
        if (s.lateSlabFullDayMinutes > 0 && lateBy >= s.lateSlabFullDayMinutes) {
          lateSlabFullDays++;
        } else if (s.lateSlabHalfDayMinutes > 0 && lateBy >= s.lateSlabHalfDayMinutes) {
          lateSlabHalfDays++;
        }
      }
    }

    // ── Overtime (Point 5): last punch-out vs shift end + buffer ──
    const lastOut = recordLastOutMinutes(rec);
    if (lastOut != null) {
      let outMin = lastOut;
      if (outMin < shiftStartMin) outMin += 24 * 60; // crossed midnight
      if (outMin > shiftEndMin + otBuffer) {
        otMinutes += (outMin - shiftEndMin); // full time from shift end once buffer crossed
      }
    }

    // ── Shortfall (Point 2): required worked vs actual worked ──
    const worked = recordWorkedMinutes(rec);
    if (!isWeeklyOff && worked > 0) {
      const short = requiredMin - worked - shortfallGrace;
      if (short > 0) shortfallMinutes += short;
    }
  }

  otMinutes = Math.round(otMinutes);
  shortfallMinutes = Math.round(shortfallMinutes);
  lateExcessMinutes = Math.round(lateExcessMinutes);

  const otAmount = otRate > 0
    ? round2(otPerMinute ? otMinutes * otRate : (otMinutes / 60) * otRate)
    : 0;
  const shortfallAmount = shortfallRate > 0
    ? round2(shortfallPerMinute ? shortfallMinutes * shortfallRate : (shortfallMinutes / 60) * shortfallRate)
    : 0;
  const lateProportionalAmount = (lateMode === 'proportional' && lateRate > 0)
    ? round2(latePerMinute ? lateExcessMinutes * lateRate : (lateExcessMinutes / 60) * lateRate)
    : 0;

  return {
    shiftDurationMin, requiredMin,
    otMinutes, otAmount,
    shortfallMinutes, shortfallAmount,
    lateDaysCount, lateExcessMinutes, lateProportionalAmount,
    lateSlabHalfDays, lateSlabFullDays,
    lateMode,
  };
};

/**
 * Turn the late aggregates into a rupee deduction using per-day salary where needed.
 * @param {object} adj  result of computeAttendanceAdjustments
 * @param {object} settings HrmsSettings
 * @param {number} perDaySalary grossSalary / workingDays
 */
export const computeLateDeduction = (adj, settings, perDaySalary) => {
  const s = settings || {};
  if (adj.lateMode === 'proportional') {
    return round2(adj.lateProportionalAmount);
  }
  if (adj.lateMode === 'slab') {
    const days = adj.lateSlabFullDays + adj.lateSlabHalfDays * 0.5;
    return round2(days * perDaySalary);
  }
  if (adj.lateMode === 'count') {
    const per = Number(s.lateCountPerMonth) || 0;
    const eq = Number(s.lateCountEqualsDays) || 0;
    if (per > 0 && eq > 0 && adj.lateDaysCount >= per) {
      const units = Math.floor(adj.lateDaysCount / per);
      return round2(units * eq * perDaySalary);
    }
    return 0;
  }
  return 0;
};

export { hmToMinutes, round2 };
