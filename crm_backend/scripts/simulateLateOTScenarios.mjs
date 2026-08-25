/**
 * Simulation: Late Entry & OT Deduction scenarios for a ₹10,000/month employee.
 * Uses the REAL hrmsSalaryCalc functions so numbers match production payroll.
 *
 * Run: node crm_backend/scripts/simulateLateOTScenarios.mjs
 */
import {
  computeAttendanceAdjustments,
  computeLateDeduction,
  computeTotalWorkingMinutes,
} from '../utils/hrmsSalaryCalc.js';

const SALARY = 10000;

// A 9:00–18:00 shift (9 hours = 540 min). Sunday weekly-off.
const employee = {
  _id: '000000000000000000000001',
  name: 'Test Employee',
  shiftStart: '09:00',
  shiftEnd: '18:00',
  weeklyOff: ['Sunday'],
};

// Helper: build one attendance record for a given date with in/out times.
const rec = (dateStr, inTime, outTime, status = 'Present') => ({
  date: new Date(dateStr + 'T00:00:00+05:30'),
  status,
  sessions: [{
    in: { time: new Date(dateStr + 'T' + inTime + ':00+05:30') },
    out: { time: new Date(dateStr + 'T' + outTime + ':00+05:30') },
  }],
});

// Print helper
const fmt = (n) => '₹' + Number(n).toFixed(2);

function runScenario(title, settings, attendance, year, month) {
  const adj = computeAttendanceAdjustments(attendance, employee, settings);
  const perDayMinutes = adj.halfDayRequiredMin || adj.requiredMin;
  const totalWorkingMinutes = computeTotalWorkingMinutes(year, month, employee, perDayMinutes);
  const perMinuteRate = SALARY / totalWorkingMinutes;
  const lateDeduction = computeLateDeduction(adj, SALARY, totalWorkingMinutes);
  const otAmount = adj.otAmount || 0;
  const netSalary = SALARY + otAmount - lateDeduction;

  const daysInMonth = new Date(year, month, 0).getDate();

  console.log('\n' + '='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
  console.log(`Month: ${month}/${year} (${daysInMonth} days) | Required: ${perDayMinutes} min/day (shift minus lunch)`);
  console.log(`Total Working Minutes = ${daysInMonth} days × ${perDayMinutes} min = ${totalWorkingMinutes} min`);
  console.log(`Per-minute rate = ${SALARY} ÷ ${totalWorkingMinutes} = ${fmt(perMinuteRate)}/min`);
  console.log('-'.repeat(70));
  console.log(`Total late minutes (beyond grace): ${adj.lateExcessMinutes} min`);
  console.log(`Actual OT worked:                  ${adj.otMinutes} min`);
  if (adj.offsetEnabled) {
    console.log(`OT-Late Offset ENABLED (multiplier ${adj.dynamicMultiplier}, surplus factor ${adj.surplusFactor})`);
    console.log(`  Required OT = ${adj.lateExcessMinutes} late × ${adj.dynamicMultiplier} = ${adj.offsetRequiredOt} min`);
    console.log(`  Result = ${adj.offsetRequiredOt} required − ${adj.offsetOtMinutes} worked = ${adj.offsetResult}`);
    if (adj.offsetResult > 0)
      console.log(`  → SHORTFALL: ${adj.offsetResult} ÷ ${adj.dynamicMultiplier} = ${adj.lateEquivalentMinutes} min late-equivalent (deducted)`);
    else if (adj.offsetResult < 0)
      console.log(`  → SURPLUS: ${Math.abs(adj.offsetResult)} × ${adj.surplusFactor} = ${adj.surplusDisplayMinutes} min (display only, NO deduction)`);
    else
      console.log(`  → FULLY OFFSET: no deduction`);
  } else {
    console.log(`OT-Late Offset: OFF → all ${adj.lateExcessMinutes} late min deducted via Rule 1`);
  }
  console.log(`Penalty multiplier X: ${adj.penaltyMultiplier}`);
  console.log(`Minutes deducted (lateEquivalent): ${adj.lateEquivalentMinutes} min`);
  console.log('-'.repeat(70));
  console.log(`Late Deduction = ${adj.lateEquivalentMinutes} × ${fmt(perMinuteRate)} × ${adj.penaltyMultiplier} = ${fmt(lateDeduction)}`);
  console.log(`Paid OT amount:  ${fmt(otAmount)}`);
  console.log('-'.repeat(70));
  console.log(`NET SALARY = ${fmt(SALARY)} + ${fmt(otAmount)} (OT) − ${fmt(lateDeduction)} (late) = ${fmt(netSalary)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS PRESETS
// ─────────────────────────────────────────────────────────────────────────────

// Rule 1 only: late deduction with X=1, no OT offset. Grace 5 min.
const settingsRule1_X1 = {
  lateDeductionRules: [{ applyTo: 'all', enabled: true, config: { graceMinutes: 5, penaltyMultiplier: 1 } }],
  otLateOffsetRules: [],
  otBufferMinutes: 0, otRate: 0, otRateMode: 'perHour',
  allowedLunchMinutes: 60,
};

// Rule 1 with X=2 (double penalty)
const settingsRule1_X2 = {
  lateDeductionRules: [{ applyTo: 'all', enabled: true, config: { graceMinutes: 5, penaltyMultiplier: 2 } }],
  otLateOffsetRules: [],
  otBufferMinutes: 0, otRate: 0, otRateMode: 'perHour',
  allowedLunchMinutes: 60,
};

// OT-Late Offset enabled: multiplier 2, surplus factor 1, plus Rule 1 X=1
const settingsOffset = {
  lateDeductionRules: [{ applyTo: 'all', enabled: true, config: { graceMinutes: 5, penaltyMultiplier: 1 } }],
  otLateOffsetRules: [{ applyTo: 'all', enabled: true, config: { dynamicMultiplier: 2, surplusFactor: 1 } }],
  otBufferMinutes: 0, otRate: 0, otRateMode: 'perHour',
  allowedLunchMinutes: 60,
};

// Paid OT: ₹50/hour, buffer 0, no late
const settingsPaidOT = {
  lateDeductionRules: [{ applyTo: 'all', enabled: true, config: { graceMinutes: 5, penaltyMultiplier: 1 } }],
  otLateOffsetRules: [],
  otRules: [{ applyTo: 'all', enabled: true, config: { bufferMinutes: 0, rate: 50, rateMode: 'perHour' } }],
  otBufferMinutes: 0, otRate: 0, otRateMode: 'perHour',
  allowedLunchMinutes: 60,
};

const Y = 2026;

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n\n############# EMPLOYEE SALARY = ₹10,000/month #############');
console.log('Shift 09:00–18:00 minus 60m lunch = 480 required min/day, Grace 5 min, Sunday off');

// --- Scenario A: Perfect attendance, no late, no OT ---
runScenario(
  'SCENARIO A — Perfect: on time every day, no late, no OT',
  settingsRule1_X1,
  [ rec('2026-04-01', '09:00', '18:00'), rec('2026-04-02', '08:55', '18:00') ],
  Y, 4
);

// --- Scenario B: Late 15 min one day (X=1), 30-day month (April) ---
runScenario(
  'SCENARIO B — Late 15 min ONE day, X=1, no OT offset (April, 30 days)',
  settingsRule1_X1,
  [ rec('2026-04-01', '09:20', '18:00') ], // 20 min late, 5 grace → 15 late min
  Y, 4
);

// --- Scenario C: Same 15 min late but X=2 ---
runScenario(
  'SCENARIO C — Late 15 min ONE day, X=2 (double penalty), April',
  settingsRule1_X2,
  [ rec('2026-04-01', '09:20', '18:00') ],
  Y, 4
);

// --- Scenario D: Same 15 min late in FEBRUARY (28 days) ---
runScenario(
  'SCENARIO D — Late 15 min ONE day, X=1, FEBRUARY (28 days)',
  settingsRule1_X1,
  [ rec('2026-02-02', '09:20', '18:00') ],
  Y, 2
);

// --- Scenario E: Same 15 min late in JANUARY (31 days) ---
runScenario(
  'SCENARIO E — Late 15 min ONE day, X=1, JANUARY (31 days)',
  settingsRule1_X1,
  [ rec('2026-01-02', '09:20', '18:00') ],
  Y, 1
);

// --- Scenario F: OT Offset — late 10 min, works LESS OT (15 min) → shortfall ---
runScenario(
  'SCENARIO F — OT Offset: Late 10 min, needs 20 min OT, works only 15 min (shortfall)',
  settingsOffset,
  [ rec('2026-04-01', '09:15', '18:15') ], // 15 late → grace 5 → 10 late min; out 18:15 → 15 min OT
  Y, 4
);

// --- Scenario G: OT Offset — late 10 min, works EXACTLY 20 min OT → fully offset ---
runScenario(
  'SCENARIO G — OT Offset: Late 10 min, needs 20 min OT, works exactly 20 min (fully offset)',
  settingsOffset,
  [ rec('2026-04-01', '09:15', '18:20') ], // 10 late min; out 18:20 → 20 min OT
  Y, 4
);

// --- Scenario H: OT Offset — late 10 min, works MORE OT (30 min) → surplus ---
runScenario(
  'SCENARIO H — OT Offset: Late 10 min, needs 20 min OT, works 30 min (surplus, display only)',
  settingsOffset,
  [ rec('2026-04-01', '09:15', '18:30') ], // 10 late min; out 18:30 → 30 min OT
  Y, 4
);

// --- Scenario I: Paid OT — no late, works 2h extra at ₹50/hr ---
runScenario(
  'SCENARIO I — Paid OT: no late, works 2 hours extra OT at ₹50/hour',
  settingsPaidOT,
  [ rec('2026-04-01', '09:00', '20:00') ], // 18:00 + 2h = 20:00 → 120 min OT
  Y, 4
);

// --- Scenario J: Multiple late days in a month, X=1 ---
runScenario(
  'SCENARIO J — Late 3 days (15+15+30 = 60 late min), X=1, April',
  settingsRule1_X1,
  [
    rec('2026-04-01', '09:20', '18:00'), // 15 late min
    rec('2026-04-02', '09:20', '18:00'), // 15 late min
    rec('2026-04-03', '09:35', '18:00'), // 30 late min
  ],
  Y, 4
);

console.log('\n\n############# END OF SIMULATION #############\n');
