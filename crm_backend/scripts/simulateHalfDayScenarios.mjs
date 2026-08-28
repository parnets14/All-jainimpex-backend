/**
 * Simulation: Half-Day & Shortfall deduction for a ₹10,000/month employee.
 * Uses the REAL hrmsSalaryCalc functions so numbers match production payroll.
 *
 * Setup per client:
 *   Shift 9:00–18:00, 1 hour lunch → required working = 8h (480 min)
 *   Half-day threshold = 4h (240 min)
 *   Half-day grace = 30 min  (if short ≤ 30, skip half-day → just shortfall by minutes)
 *
 * Run: node crm_backend/scripts/simulateHalfDayScenarios.mjs
 */
import assert from 'node:assert/strict';
import {
  computeAttendanceAdjustments,
  computeHalfDayDeduction,
  computeTotalWorkingMinutes,
} from '../utils/hrmsSalaryCalc.js';
import { calculateAttendanceTime } from '../utils/attendanceTime.js';

const SALARY = 10000;

// Different employees with different shift lengths — required = shift − lunch (per employee).
// Lunch is configured in HRMS settings (allowedLunchMinutes), same for all.
const emp9h = { _id: '1', name: '9h Shift Emp', shiftStart: '09:00', shiftEnd: '18:00', weeklyOff: ['Sunday'] }; // 540 − 60 lunch = 480
const emp8h = { _id: '2', name: '8h Shift Emp', shiftStart: '09:00', shiftEnd: '17:00', weeklyOff: ['Sunday'] }; // 480 − 60 lunch = 420
const emp10h = { _id: '3', name: '10h Shift Emp', shiftStart: '09:00', shiftEnd: '19:00', weeklyOff: ['Sunday'] }; // 600 − 60 lunch = 540

// Default employee used by most scenarios (9h shift → 480 required after 1h lunch)
const employee = emp9h;

// Build one attendance record for the requested CREDITED working minutes.
// Production calculates credited time as punch span − max(configured lunch,
// actual session gaps). These single-session fixtures therefore add the configured
// 60-minute lunch to the punch span so labels such as "Worked 8h" mean 8h credited.
const recWorked = (dateStr, creditedWorkingMinutes) => {
  const inMin = 9 * 60; // 09:00
  const configuredLunchMinutes = 60;
  const outMin = inMin + creditedWorkingMinutes + configuredLunchMinutes;
  const hh = String(Math.floor(outMin / 60)).padStart(2, '0');
  const mm = String(outMin % 60).padStart(2, '0');
  return {
    date: new Date(dateStr + 'T00:00:00+05:30'),
    status: 'Present',
    sessions: [{
      in:  { time: new Date(dateStr + 'T09:00:00+05:30') },
      out: { time: new Date(dateStr + 'T' + hh + ':' + mm + ':00+05:30') },
    }],
  };
};

const fmt = (n) => '₹' + Number(n).toFixed(2);
const hm = (min) => `${Math.floor(min / 60)}h ${min % 60}m`;

// Half-day ON. required is computed PER EMPLOYEE = (shift − allowedLunchMinutes).
// Fixed 3-band logic (no mode choice):
//   < half (4h)            → deduct short minutes
//   half → (full − grace)  → flat half-day salary
//   ≥ (full − grace)       → deduct only small shortfall
const settings = {
  halfDayEnabled: true,
  allowedLunchMinutes: 60,          // 1 hour lunch (from HRMS settings)
  breakGraceMinutes: 5,
  excessBreakDeductionPerMinute: 2,
  // requiredWorkingMinutes intentionally NOT set → auto = shift − lunch per employee
  halfDayThresholdMinutes: 240,     // half point = 4h
  halfDayGraceMinutes: 30,
  halfDayRules: [],
  lateDeductionRules: [], otLateOffsetRules: [],
  otBufferMinutes: 0, otRate: 0,
};

function runScenario(title, _settings, workedMinutes, year, month, emp = employee) {
  const settings = _settings;
  const attendance = [ recWorked('2026-04-06', workedMinutes) ]; // Monday
  const adj = computeAttendanceAdjustments(attendance, emp, settings);

  const nDays = new Date(year, month, 0).getDate();
  // required minutes now comes from the calc (per employee: shift − lunch)
  const required = adj.halfDayRequiredMin;
  const totalWorkingMinutes = computeTotalWorkingMinutes(year, month, emp, required);
  const perMinuteRate = SALARY / totalWorkingMinutes;
  const perDaySalary = SALARY / nDays;

  const halfDayDeduction = computeHalfDayDeduction(adj, SALARY, totalWorkingMinutes, perDaySalary);
  const netSalary = SALARY - halfDayDeduction;

  const short = Math.max(0, required - workedMinutes);

  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
  console.log(`Employee: ${emp.name} | Shift ${emp.shiftStart}–${emp.shiftEnd} − 60 min lunch = ${hm(required)} required`);
  console.log(`Worked: ${hm(workedMinutes)} (${workedMinutes} min) | Required: ${hm(required)} (${required} min) | Short: ${hm(short)}`);
  console.log(`Threshold: ${hm(adj.halfDayThresholdMin)} (dynamic half of ${required}m) | Grace: ${adj.halfDayGraceMin} min`);
  console.log(`Month ${month}/${year} = ${nDays} days | Total working min = ${nDays} × ${required} = ${totalWorkingMinutes}`);
  console.log(`Per-minute rate = ${SALARY} ÷ ${totalWorkingMinutes} = ${fmt(perMinuteRate)}/min | Per-day = ${fmt(perDaySalary)}`);
  console.log('-'.repeat(72));
  console.log(`Classified as half-day: ${adj.halfDayCount > 0 ? 'YES' : 'NO'}`);
  console.log(`Short minutes deducted (by-minute): ${adj.halfDayShortMinutes} min`);
  console.log(`Flat half-day units: ${adj.halfDayFlatUnits} (× per-day salary)`);
  console.log('-'.repeat(72));
  if (adj.halfDayShortMinutes > 0)
    console.log(`  By-minute deduction = ${adj.halfDayShortMinutes} × ${fmt(perMinuteRate)} = ${fmt(adj.halfDayShortMinutes * perMinuteRate)}`);
  if (adj.halfDayFlatUnits > 0)
    console.log(`  Flat deduction = ${adj.halfDayFlatUnits} × ${fmt(perDaySalary)} = ${fmt(adj.halfDayFlatUnits * perDaySalary)}`);
  console.log(`TOTAL DEDUCTION = ${fmt(halfDayDeduction)}`);
  console.log(`NET SALARY = ${fmt(SALARY)} − ${fmt(halfDayDeduction)} = ${fmt(netSalary)}`);
}

const Y = 2026, M = 4; // April = 30 days

console.log('\n\n############# HALF-DAY SIMULATION — SALARY ₹10,000 #############');
console.log('Required 8h (480 min), Half-day threshold 4h (240 min), Grace 30 min, April (30 days)');
console.log('Per-day = 10000/30 = ₹333.33 | Per-minute = 10000/(30×480=14400) = ₹0.69/min');

console.log('\n\n████ BAND 1 — WORKED LESS THAN HALF (< 4h) → deduct short minutes ████');
runScenario('Worked 2h → short 6h → deduct 360 min', settings, 120, Y, M);
runScenario('Worked 3h → short 5h → deduct 300 min', settings, 180, Y, M);
runScenario('Worked 3h 59min → short 4h 1min → deduct 241 min', settings, 239, Y, M);

console.log('\n\n████ BAND 2 — HALF to (FULL − GRACE) [4h to 7h30m) → FLAT HALF-DAY ████');
runScenario('Worked exactly 4h (threshold) → flat half-day', settings, 240, Y, M);
runScenario('Worked 5h → flat half-day', settings, 300, Y, M);
runScenario('Worked 6h → flat half-day', settings, 360, Y, M);
runScenario('Worked 7h → flat half-day', settings, 420, Y, M);
runScenario('Worked 7h 29min → flat half-day (just below grace zone)', settings, 449, Y, M);

console.log('\n\n████ BAND 3 — GRACE ZONE (≥ 7h30m, short ≤ 30) → deduct only shortfall ████');
runScenario('Worked 7h 30min → short 30 → deduct 30 min', settings, 450, Y, M);
runScenario('Worked 7h 40min → short 20 → deduct 20 min', settings, 460, Y, M);
runScenario('Worked 7h 50min → short 10 → deduct 10 min', settings, 470, Y, M);
runScenario('Worked 8h (full) → no deduction', settings, 480, Y, M);

console.log('\n\n████ DIFFERENT SHIFT LENGTHS (required = shift − 60 min lunch, PER EMPLOYEE) ████');
runScenario('8h SHIFT emp (req 7h/420), worked 5h → flat half-day', settings, 300, Y, M, emp8h);
runScenario('9h SHIFT emp (req 8h/480), worked 5h → flat half-day', settings, 300, Y, M, emp9h);
runScenario('10h SHIFT emp (req 9h/540), worked 5h → flat half-day', settings, 300, Y, M, emp10h);
runScenario('10h SHIFT emp (req 9h/540), worked full 9h → no deduction', settings, 540, Y, M, emp10h);

console.log('\n\n████ DYNAMIC HALF THRESHOLD BOUNDARIES ████');
runScenario('8h SHIFT emp: worked 3h29m (209 < dynamic half 210) → by-minute', settings, 209, Y, M, emp8h);
runScenario('8h SHIFT emp: worked 3h30m (dynamic half 210) → flat half-day', settings, 210, Y, M, emp8h);
runScenario('10h SHIFT emp: worked 4h29m (269 < dynamic half 270) → by-minute', settings, 269, Y, M, emp10h);
runScenario('10h SHIFT emp: worked 4h30m (dynamic half 270) → flat half-day', settings, 270, Y, M, emp10h);

console.log('\n\n████ CANONICAL WORKING-TIME EDGE ASSERTIONS ████');
const at = (clock) => new Date(`2026-04-06T${clock}:00+05:30`);

const zeroCreditRecord = recWorked('2026-04-06', 0);
const zeroCreditTime = calculateAttendanceTime(zeroCreditRecord, { allowedLunchMinutes: 60 });
assert.equal(zeroCreditTime.creditedWorkingMinutes, 0);
assert.equal(zeroCreditTime.completedSessionCount, 1);
assert.equal(zeroCreditTime.source, 'sessions');
const zeroCreditAdjustment = computeAttendanceAdjustments([zeroCreditRecord], employee, settings);
assert.equal(zeroCreditAdjustment.halfDayCount, 1);
assert.equal(zeroCreditAdjustment.halfDayShortMinutes, 480);

const openOnlyRecord = {
  date: new Date('2026-04-06T00:00:00+05:30'),
  status: 'Present',
  sessions: [{ in: { time: at('09:00') } }],
  punchIn: { time: at('09:00') },
  punchOut: { time: at('18:00') },
  workingHours: 8,
};
const openOnlyTime = calculateAttendanceTime(openOnlyRecord, { allowedLunchMinutes: 60 });
assert.equal(openOnlyTime.creditedWorkingMinutes, 0);
assert.equal(openOnlyTime.completedSessionCount, 0);
assert.equal(openOnlyTime.source, 'no-completed-session');
assert.equal(openOnlyTime.dataQuality, 'no-completed-session');
const openOnlyAdjustment = computeAttendanceAdjustments([openOnlyRecord], employee, settings);
assert.equal(openOnlyAdjustment.halfDayCount, 0);
assert.equal(openOnlyAdjustment.halfDayShortMinutes, 0);

const legacyOpenTime = calculateAttendanceTime({
  punchIn: { time: at('09:00') },
  workingHours: 8,
}, { allowedLunchMinutes: 60 });
assert.equal(legacyOpenTime.creditedWorkingMinutes, 480);
assert.equal(legacyOpenTime.hasOpenSession, true);
assert.equal(legacyOpenTime.source, 'stored-hours-only');

const completedPlusOpen = {
  ...openOnlyRecord,
  sessions: [
    { in: { time: at('09:00') }, out: { time: at('18:00') } },
    { in: { time: at('19:00') } },
  ],
  workingHours: 99,
};
const completedPlusOpenTime = calculateAttendanceTime(completedPlusOpen, { allowedLunchMinutes: 60 });
assert.equal(completedPlusOpenTime.creditedWorkingMinutes, 480);
assert.equal(completedPlusOpenTime.hasOpenSession, true);
assert.equal(completedPlusOpenTime.source, 'sessions');

const legacyOnlyTime = calculateAttendanceTime({
  punchIn: { time: at('09:00') },
  punchOut: { time: at('18:00') },
  workingHours: 99,
}, { allowedLunchMinutes: 60 });
assert.equal(legacyOnlyTime.creditedWorkingMinutes, 480);
assert.equal(legacyOnlyTime.source, 'legacy-punch');

const storedOnlyTime = calculateAttendanceTime({ workingHours: 8 }, { allowedLunchMinutes: 60 });
assert.equal(storedOnlyTime.creditedWorkingMinutes, 480);
assert.equal(storedOnlyTime.source, 'stored-hours-only');
assert.equal(storedOnlyTime.dataQuality, 'stored-hours-only');

const shortGapRecord = {
  sessions: [
    { in: { time: at('09:00') }, out: { time: at('12:00') } },
    { in: { time: at('12:30') }, out: { time: at('18:00') } },
  ],
};
assert.equal(calculateAttendanceTime(shortGapRecord, { allowedLunchMinutes: 60 }).creditedWorkingMinutes, 480);
const longGapRecord = {
  sessions: [
    { in: { time: at('09:00') }, out: { time: at('12:00') } },
    { in: { time: at('13:15') }, out: { time: at('18:00') } },
  ],
};
const longGapTime = calculateAttendanceTime(longGapRecord, { allowedLunchMinutes: 60 });
assert.equal(longGapTime.actualBreakMinutes, 75);
assert.equal(longGapTime.deductedBreakMinutes, 75);
assert.equal(longGapTime.creditedWorkingMinutes, 465);
const overlapRecord = {
  sessions: [
    { in: { time: at('09:00') }, out: { time: at('13:00') } },
    { in: { time: at('12:00') }, out: { time: at('18:00') } },
  ],
};
assert.equal(calculateAttendanceTime(overlapRecord, { allowedLunchMinutes: 60 }).creditedWorkingMinutes, 480);
assert.equal(calculateAttendanceTime(overlapRecord, { allowedLunchMinutes: 0 }).creditedWorkingMinutes, 540);
assert.equal(calculateAttendanceTime(overlapRecord, { allowedLunchMinutes: 45 }).creditedWorkingMinutes, 495);

console.log('\n\n████ EXCESS-BREAK PENALTY ASSERTIONS ████');
const breakPenaltySettings = {
  ...settings,
  allowedLunchMinutes: 45,
  breakGraceMinutes: 5,
  excessBreakDeductionPerMinute: 2,
};
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);
const breakRecord = (gapMinutes, { trailingOpen = false, date = '2026-04-06' } = {}) => ({
  date: new Date(`${date}T00:00:00+05:30`),
  status: 'Present',
  sessions: [
    { in: { time: new Date(`${date}T09:00:00+05:30`) }, out: { time: new Date(`${date}T12:00:00+05:30`) } },
    {
      in: { time: addMinutes(new Date(`${date}T12:00:00+05:30`), gapMinutes) },
      ...(trailingOpen ? {} : { out: { time: new Date(`${date}T18:00:00+05:30`) } }),
    },
  ],
});

for (const [actual, expectedExcess, expectedPenalty] of [
  [45, 0, 0],
  [50, 0, 0],
  [51, 1, 2],
  [75, 25, 50],
]) {
  const record = breakRecord(actual);
  const time = calculateAttendanceTime(record, { allowedLunchMinutes: 45 });
  const adjustment = computeAttendanceAdjustments([record], employee, breakPenaltySettings);
  assert.equal(time.completedActualBreakMinutes, actual);
  assert.equal(adjustment.excessBreakMinutes, expectedExcess);
  assert.equal(adjustment.breakPenalty, expectedPenalty);
}

const trailingOpenBreak = breakRecord(75, { trailingOpen: true });
const trailingOpenBreakTime = calculateAttendanceTime(trailingOpenBreak, { allowedLunchMinutes: 45 });
const trailingOpenBreakAdjustment = computeAttendanceAdjustments(
  [trailingOpenBreak], employee, breakPenaltySettings
);
assert.equal(trailingOpenBreakTime.observedBreakMinutes, 75);
assert.equal(trailingOpenBreakTime.completedActualBreakMinutes, 0);
assert.equal(trailingOpenBreakAdjustment.excessBreakMinutes, 0);
assert.equal(trailingOpenBreakAdjustment.breakPenalty, 0);

const weeklyOffBreak = breakRecord(75, { date: '2026-04-05' }); // Sunday
const weeklyOffAdjustment = computeAttendanceAdjustments(
  [weeklyOffBreak], employee, breakPenaltySettings
);
assert.equal(weeklyOffAdjustment.excessBreakMinutes, 0);
assert.equal(weeklyOffAdjustment.breakPenalty, 0);

const aggregateBreakAdjustment = computeAttendanceAdjustments(
  [breakRecord(51), breakRecord(75, { date: '2026-04-07' })],
  employee,
  breakPenaltySettings
);
assert.equal(aggregateBreakAdjustment.excessBreakMinutes, 26);
assert.equal(aggregateBreakAdjustment.excessBreakDays, 2);
assert.equal(aggregateBreakAdjustment.breakPenalty, 52);
console.log('PASS: 45/50/51/75-minute thresholds, trailing-open safety, weekly-off exclusion, and monthly aggregation');
console.log('PASS: zero-credit, open-only, legacy-open, trailing-open, legacy/stored fallback, gap, overlap, and settings-change assertions');

console.log('\n\n############# END #############\n');
