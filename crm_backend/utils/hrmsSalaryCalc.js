// HRMS salary computation helpers (Points 2, 5, 7, 3).
// Pure functions that turn a month's attendance + the employee's shift +
// company HrmsSettings into overtime / late / shortfall figures used by the
// salary engine. All admin-configurable via HrmsSettings.

import { calculateAttendanceTime } from './attendanceTime.js';

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

// Minutes since midnight in IST. Payroll must never depend on the server's
// local timezone (production commonly runs in UTC).
const dateToMinutes = (d) => {
  const t = new Date(new Date(d).getTime() + 5.5 * 3600000);
  return t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60;
};

const round2 = (v) => parseFloat(Number(v || 0).toFixed(2));

// Credited time uses the shared lunch/break rule for reports and payroll.
// Keep its evidence metadata so a completed interval credited as zero still
// enters payroll classification, unlike an open-only record.
const recordWorkedTime = (rec, allowedLunchMinutes = 0) => (
  calculateAttendanceTime(rec, { allowedLunchMinutes })
);

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

// Normalize weeklyOff: handles both old string ("Sunday") and new array (["Sunday","Saturday"])
const getOffDays = (weeklyOff) => {
  if (!weeklyOff) return [];
  const days = Array.isArray(weeklyOff) ? weeklyOff : [weeklyOff];
  return days.map(d => DAY_INDEX[d]).filter(d => d !== undefined);
};

/**
 * Count paid working days in a month for an employee, skipping their weekly off.
 * Returns { workingDays } where weekly-off days are excluded (they are paid but
 * not part of the divisor used for per-day deductions).
 */
export const countWorkingDays = (year, month, employee) => {
  const offDays = getOffDays(employee?.weeklyOff);
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
    if (!offDays.includes(istDay)) workingDays++;
    d.setTime(d.getTime() + 86400000); // advance by exactly one IST day
  }
  return { workingDays };
};

/**
 * Actual number of calendar days in the given month (28/29/30/31).
 * Used for the "Total Working Minutes in month" denominator of the
 * per-minute salary rate — client wants the real month length, NOT a
 * fixed 30 and NOT working-days-only.
 */
export const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

/**
 * Total working minutes in a month for an employee =
 *   (actual days in month) × (working minutes per day).
 * This is the denominator for the per-minute salary rate:
 *   perMinuteRate = salary / totalWorkingMinutes
 *
 * Working minutes per day priority:
 *   1) explicit `perDayMinutesOverride` (e.g. requiredWorkingMinutes from settings = 480)
 *   2) shift duration (shiftEnd − shiftStart)
 */
export const computeTotalWorkingMinutes = (year, month, employee, perDayMinutesOverride) => {
  let perDayMin = Number(perDayMinutesOverride) || 0;
  if (perDayMin <= 0) {
    const shiftStartMin = hmToMinutes(employee?.shiftStart) ?? 600; // 10:00
    let shiftEndMin = hmToMinutes(employee?.shiftEnd) ?? 1080;       // 18:00
    if (shiftEndMin <= shiftStartMin) shiftEndMin += 24 * 60;        // overnight guard
    perDayMin = shiftEndMin - shiftStartMin;
  }
  const nDays = daysInMonth(year, month);
  return nDays * perDayMin;
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
  const offDays = getOffDays(employee?.weeklyOff); // weekly-off: no late/shortfall penalty

  // Legacy paid-OT values remain a fallback only when no per-employee paid
  // OT rule is configured. Late-offset OT is resolved independently below.
  let otBuffer = Number(s.otBufferMinutes) || 0;
  let otRate = Number(s.otRate) || 0;
  let otPerMinute = s.otRateMode === 'perMinute';

  const lateGrace = Number(s.lateGraceMinutes) || 0;

  // ── Rule 1: Late Entry Deduction lookup (new formula) ──
  // Deduction = Late Minutes × (Salary / Total Working Minutes) × X
  let employeeGrace = lateGrace;
  let penaltyMultiplier = 1;      // X — default 1 if no rule matches
  let lateRuleMatched = false;

  const matchRuleFor = (rules, empId) => {
    if (!rules || rules.length === 0 || !empId) return null;
    const enabled = rules.filter((rule) => rule.enabled !== false);
    // Explicit employee assignments always override broad fallbacks regardless
    // of UI order. "remaining" applies only when no custom rule owns the employee.
    const custom = enabled.find((rule) => rule.applyTo === 'custom' &&
      (rule.employees || []).map(String).includes(empId));
    if (custom) return custom;
    return enabled.find((rule) => rule.applyTo === 'remaining') ||
      enabled.find((rule) => rule.applyTo === 'all') || null;
  };

  const empId = employee?._id ? employee._id.toString() : null;
  const lateRule = matchRuleFor(s.lateDeductionRules, empId);
  if (lateRule) {
    lateRuleMatched = true;
    const configuredGrace = Number(lateRule.config?.graceMinutes);
    employeeGrace = Number.isFinite(configuredGrace) ? configuredGrace : lateGrace;
    penaltyMultiplier = Number(lateRule.config?.penaltyMultiplier) || 1;
  }

  // ── Paid OT lookup (Type 1) ──
  // Per-employee rules are authoritative when configured. Legacy values are
  // retained only for companies that have not migrated to otRules yet.
  const paidOtRule = matchRuleFor(s.otRules, empId);
  const hasConfiguredPaidOtRules = Array.isArray(s.otRules) && s.otRules.length > 0;
  if (paidOtRule) {
    otBuffer = Math.max(0, Number(paidOtRule.config?.bufferMinutes) || 0);
    otRate = Math.max(0, Number(paidOtRule.config?.rate) || 0);
    otPerMinute = paidOtRule.config?.rateMode === 'perMinute';
  }

  // ── OT-Late Offset lookup (Scenario 1 & 2 — no-pay OT offsets lateness) ──
  const offsetRule = matchRuleFor(s.otLateOffsetRules, empId);
  const offsetEnabled = !!offsetRule;
  // Offset assignment wins if an employee was accidentally placed in both
  // groups. The same extra minutes must never both earn money and erase late.
  const paidOtEnabled = !offsetEnabled && (paidOtRule ? otRate > 0 : (!hasConfiguredPaidOtRules && otRate > 0));
  const dynamicMultiplier = offsetRule ? (Number(offsetRule.config?.dynamicMultiplier) || 2) : 0;
  const surplusFactor = offsetRule ? (Number(offsetRule.config?.surplusFactor) || 1) : 0;

  const allowedLunch = Math.max(0, Number(s.allowedLunchMinutes ?? 45) || 0);

  // ── Half-Day / Shortfall lookup ──
  // Prefer a matched per-employee halfDayRule; else fall back to global half-day settings.
  const halfDayRule = matchRuleFor(s.halfDayRules, empId);
  const halfDayEnabled = !!halfDayRule || !!s.halfDayEnabled;

  // Required working minutes/day is PER EMPLOYEE:
  //   requiredWorkingMinutes = (employee shift duration) − (allowed lunch)
  // e.g. 9h shift (540) − 60 lunch = 480. A 10h shift (600) − 60 = 540, etc.
  // The settings/rule value is used ONLY as an explicit override when > 0
  // (lets admin force a fixed number for a special employee group).
  const shiftMinusLunch = Math.max(0, shiftDurationMin - allowedLunch);
  // Required work is always the employee's own shift minus configured lunch.
  // Fixed 480-minute overrides are intentionally ignored because employees can
  // have different 8h/9h/10h shifts.
  const hdRequiredMin = shiftMinusLunch;

  // The half threshold is always half of this employee's resolved required
  // working time. A fixed 240-minute threshold is wrong for 7h/9h workers.
  const hdThresholdMin = hdRequiredMin / 2;
  const hdGraceMin = halfDayRule
    ? (Number(halfDayRule.config?.halfDayGraceMinutes) || 0)
    : (Number(s.halfDayGraceMinutes) || 0);

  const shortfallGrace = Number(s.shortfallGraceMinutes) || 0;
  const shortfallRate = Number(s.shortfallRate) || 0;
  const shortfallPerMinute = s.shortfallRateMode !== 'perHour';
  const requiredMin = Math.max(0, shiftDurationMin - allowedLunch);

  let otMinutes = 0;           // paid OT minutes (Type 1)
  let shortfallMinutes = 0;
  let lateExcessMinutes = 0;   // total late minutes beyond grace (drives Rule 1)
  let lateDaysCount = 0;       // any day late beyond grace
  let offsetOtMinutes = 0;     // OT minutes counted toward late-offset (Type 2)

  // Half-day / shortfall aggregates (new)
  let halfDayCount = 0;              // days classified as half-day
  let halfDayShortMinutes = 0;       // total short minutes across half/shortfall days (by-minutes mode)
  let halfDayFlatUnits = 0;          // number of "half-day" flat units (flatHalf mode) → × 0.5 per-day salary
  let fullAbsentFromHalf = 0;        // (not used for pay here; status only)

  for (const rec of attendance) {
    const isWorkedStatus = rec.status === 'Present' || rec.status === 'Late' || rec.status === 'Half Day';
    if (!isWorkedStatus) continue;

    // On the employee's weekly-off day we never penalize (late/shortfall); OT for
    // extra work is still credited below.
    const isWeeklyOff = offDays.length > 0 && offDays.includes(new Date(new Date(rec.date).getTime() + 5.5 * 3600000).getUTCDay());

    // ── Late (Point 7): first punch-in vs shift start, beyond grace ──
    const firstIn = recordFirstInMinutes(rec);
    if (!isWeeklyOff && firstIn != null) {
      const lateBy = firstIn - shiftStartMin; // minutes after shift start
      if (lateBy > employeeGrace) {
        lateDaysCount++;
        lateExcessMinutes += Math.max(0, lateBy - employeeGrace);
      }
    }

    // ── Overtime: paid and late-offset minutes are mutually exclusive ──
    const lastOut = recordLastOutMinutes(rec);
    if (lastOut != null) {
      let outMin = lastOut;
      if (outMin < shiftStartMin) outMin += 24 * 60; // crossed midnight
      const extra = Math.max(0, outMin - shiftEndMin);
      if (paidOtEnabled && extra > otBuffer) {
        // Once the configured buffer is crossed, credit all time after shift end.
        otMinutes += extra;
      } else if (offsetEnabled && extra > 0) {
        // Type 2 has no pay and no paid-OT buffer; all actual extra work can
        // offset the employee's late requirement.
        offsetOtMinutes += extra;
      }
    }

    // ── Half-Day / Shortfall (fixed 3-band logic per client) ──
    const workedTime = recordWorkedTime(rec, allowedLunch);
    const worked = workedTime.creditedWorkingMinutes;
    // A completed punch interval can legitimately net to zero after lunch. It
    // must still be classified; open-only records have no completed evidence.
    const hasWorkEvidence = worked > 0 || workedTime.completedSessionCount > 0;
    if (!isWeeklyOff && hasWorkEvidence) {
      if (halfDayEnabled) {
        // required = hdRequiredMin (per employee = shift − lunch, e.g. 8h = 480)
        // threshold = hdThresholdMin (half point, e.g. 4h = 240)
        // grace = hdGraceMin (e.g. 30). Grace-zone starts at required − grace (e.g. 450 = 7h30m).
        //
        //  Band 1) worked < threshold (< 4h)          → HALF DAY status,
        //                                                deduct SHORT minutes by-minute
        //          e.g. worked 3h → 300 min short → deduct 300 min
        //  Band 2) threshold ≤ worked < (required−grace)  [4h to 7h30m)  → HALF DAY,
        //                                                deduct FLAT HALF-DAY (= threshold worth of minutes)
        //  Band 3) worked ≥ (required − grace)  [≥7h30m]  → GRACE ZONE,
        //                                                deduct only the small SHORTFALL by-minute
        //          e.g. worked 7h40m → 20 min short → deduct 20 min
        const short = hdRequiredMin - worked;
        const graceZoneStart = hdRequiredMin - hdGraceMin; // e.g. 480 − 30 = 450
        if (short <= 0) {
          // full time or more — nothing
        } else if (worked >= graceZoneStart) {
          // Band 3: grace zone → deduct only the shortfall minutes
          halfDayShortMinutes += short;
        } else if (worked < hdThresholdMin) {
          // Band 1: below half → half-day status, deduct short minutes by-minute
          halfDayCount++;
          halfDayShortMinutes += short;
        } else {
          // Band 2: half → (full − grace) → flat half-day deduction
          halfDayCount++;
          halfDayFlatUnits += 0.5;
        }
      } else {
        // Legacy shortfall (Point 2) when half-day system is off
        const short = requiredMin - worked - shortfallGrace;
        if (short > 0) shortfallMinutes += short;
      }
    }
  }

  otMinutes = Math.round(otMinutes);
  offsetOtMinutes = Math.round(offsetOtMinutes);
  shortfallMinutes = Math.round(shortfallMinutes);
  lateExcessMinutes = Math.round(lateExcessMinutes);
  halfDayShortMinutes = Math.round(halfDayShortMinutes);

  // ── OT-Late Offset (Scenario 1 & 2) ──
  // Required OT = Late Minutes × Dynamic Multiplier
  // Result = Required OT − Actual OT worked
  //   > 0 → shortfall → late-equivalent = Result ÷ Multiplier → deducted via Rule 1
  //   < 0 → surplus  → |Result| × surplusFactor → display only (no pay impact)
  //   = 0 → fully offset
  let offsetRequiredOt = 0;
  let offsetResult = 0;
  let lateEquivalentMinutes = lateExcessMinutes; // default: no offset → all late is deducted
  let surplusDisplayMinutes = 0;

  if (offsetEnabled && dynamicMultiplier > 0) {
    offsetRequiredOt = lateExcessMinutes * dynamicMultiplier;
    offsetResult = offsetRequiredOt - offsetOtMinutes;
    if (offsetResult > 0) {
      // Scenario 1: shortfall — convert back to late-equivalent minutes
      lateEquivalentMinutes = round2(offsetResult / dynamicMultiplier);
    } else {
      // Scenario 2: surplus — fully offset, nothing to deduct; record display-only surplus
      lateEquivalentMinutes = 0;
      surplusDisplayMinutes = round2(Math.abs(offsetResult) * surplusFactor);
    }
  }

  const otAmount = otRate > 0
    ? round2(otPerMinute ? otMinutes * otRate : (otMinutes / 60) * otRate)
    : 0;
  const shortfallAmount = shortfallRate > 0
    ? round2(shortfallPerMinute ? shortfallMinutes * shortfallRate : (shortfallMinutes / 60) * shortfallRate)
    : 0;

  return {
    shiftDurationMin, requiredMin,
    paidOtEnabled,
    paidOtRuleMatched: !!paidOtRule,
    otBufferMinutes: otBuffer,
    otRate,
    otRateMode: otPerMinute ? 'perMinute' : 'perHour',
    otMinutes, otAmount,
    shortfallMinutes, shortfallAmount,
    lateDaysCount, lateExcessMinutes,
    // Rule 1 params
    lateRuleMatched,
    penaltyMultiplier,
    // OT-Late offset (Scenario 1 & 2)
    offsetEnabled,
    dynamicMultiplier,
    surplusFactor,
    offsetRequiredOt,
    offsetOtMinutes,
    offsetResult,
    lateEquivalentMinutes,   // the minutes actually deducted via Rule 1
    surplusDisplayMinutes,   // display only — no pay impact
    // Half-day / shortfall (new)
    halfDayEnabled,
    halfDayRequiredMin: hdRequiredMin,
    halfDayThresholdMin: hdThresholdMin,
    halfDayGraceMin: hdGraceMin,
    halfDayCount,             // days classified as half day
    halfDayShortMinutes,      // total short minutes (by-minutes mode / near-full grace)
    halfDayFlatUnits,         // 0.5 per flat half-day (flatHalf mode) → × per-day salary
  };
};

/**
 * Compute the late deduction amount using the new salary-based formula:
 *   Deduction = lateEquivalentMinutes × (grossSalary / totalWorkingMinutes) × X
 *
 * @param {object} adj  result of computeAttendanceAdjustments
 * @param {number} grossSalary  the employee's gross salary for the month
 * @param {number} totalWorkingMinutes  actual days in month × shift duration minutes
 */
export const computeLateDeduction = (adj, grossSalary, totalWorkingMinutes) => {
  if (!adj.lateRuleMatched) return 0; // no rule matched → no deduction
  if (totalWorkingMinutes <= 0 || grossSalary <= 0) return 0;

  const minutes = adj.lateEquivalentMinutes || 0; // after OT offset if applicable
  if (minutes <= 0) return 0;

  const X = adj.penaltyMultiplier || 1;
  const perMinuteRate = grossSalary / totalWorkingMinutes;
  const deduction = minutes * perMinuteRate * X;

  return round2(deduction);
};

/**
 * Compute the half-day / shortfall deduction.
 *   - By-minutes portion: halfDayShortMinutes × (grossSalary / totalWorkingMinutes)
 *   - Flat-half portion:  halfDayFlatUnits × 0.5-day salary  (= halfDayFlatUnits × perDaySalary)
 *     (halfDayFlatUnits already stores 0.5 per half-day, so multiply by full per-day salary)
 *
 * @param {object} adj  result of computeAttendanceAdjustments
 * @param {number} grossSalary  gross salary for the month
 * @param {number} totalWorkingMinutes  actual days in month × required working minutes
 * @param {number} perDaySalary  grossSalary / daysInMonth
 */
export const computeHalfDayDeduction = (adj, grossSalary, totalWorkingMinutes, perDaySalary) => {
  if (!adj.halfDayEnabled) return 0;
  if (totalWorkingMinutes <= 0 || grossSalary <= 0) return 0;

  const perMinuteRate = grossSalary / totalWorkingMinutes;
  const byMinuteAmount = (adj.halfDayShortMinutes || 0) * perMinuteRate;
  const flatAmount = (adj.halfDayFlatUnits || 0) * (perDaySalary || 0);

  return round2(byMinuteAmount + flatAmount);
};

export { hmToMinutes, round2 };
