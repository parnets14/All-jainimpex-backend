import assert from "node:assert/strict";
import {
  getAbsentReviewPolicyBounds,
  isManualAbsentReviewAllowed,
} from "../utils/absentReviewPolicy.js";

/**
 * Verify Absent Review deduction logic — mirrors the exact loop in
 * queue/salaryQueueFallback.js (fixed-salary branch).
 *
 * Confirms:
 *   1) Auto free monthly paid leave (status 'Leave', leaveType 'Paid Leave')
 *      → NO salary cut.
 *   2) Excused (also Paid Leave) → NO cut.
 *   3) Unexcused (status 'Absent'/'Leave' Unpaid, with absentDeductionMultiplier X)
 *      → deduct (grossSalary / daysInMonth) × X exactly.
 *   4) Plain absent (no review, no record) → X = 1.
 *
 * Run: node crm_backend/scripts/simulateAbsentReview.mjs
 */

const SALARY = 10000;                 // fixed gross
const YEAR = 2026, MONTH = 4;         // April → 30 days
const daysInMonth = new Date(YEAR, MONTH, 0).getDate();
const perDaySalary = SALARY / daysInMonth;

// Paid leave types (mirror salaryQueueFallback default set)
const paidLeaveTypes = new Set(["Paid Leave", "Sick Leave", "Casual Leave"]);

const fmt = (n) => `₹${Number(n).toFixed(2)}`;

// Replicate the salary loop for a set of attendance records over the month.
// Sundays are the weekly off (offDays = [0]).
function simulate(title, attendance) {
  const offDays = [0]; // Sunday
  const periodFrom = new Date(YEAR, MONTH - 1, 1);
  const periodTo = new Date(YEAR, MONTH, 0);

  let workingDays = 0, presentDays = 0, leaveDays = 0, absentMultiplierUnits = 0;
  const d = new Date(periodFrom);

  // Index attendance by YYYY-MM-DD
  const byDay = {};
  attendance.forEach((a) => { byDay[a.day] = a; });

  while (d <= periodTo) {
    const dow = d.getDay(); // local; script uses local dates so Sunday=0 works
    if (!offDays.includes(dow)) {
      workingDays++;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const rec = byDay[key];
      if (rec) {
        if (rec.status === "Present" || rec.status === "Late") {
          presentDays++;
        } else if (rec.status === "Leave") {
          if (paidLeaveTypes.has(rec.leaveType)) {
            leaveDays++; presentDays++; // paid → protected
          } else {
            const x = rec.absentDeductionMultiplier != null ? Number(rec.absentDeductionMultiplier) : 1;
            absentMultiplierUnits += (x >= 0 ? x : 1);
          }
        } else if (rec.status === "Absent") {
          const x = rec.absentDeductionMultiplier != null ? Number(rec.absentDeductionMultiplier) : 1;
          absentMultiplierUnits += (x >= 0 ? x : 1);
        }
      } else {
        // no record on a working day → plain absent X=1
        absentMultiplierUnits += 1;
      }
    }
    d.setDate(d.getDate() + 1);
  }

  const absentDays = workingDays - presentDays;
  const lopAmount = absentMultiplierUnits > 0
    ? parseFloat((perDaySalary * absentMultiplierUnits).toFixed(2)) : 0;
  const net = SALARY - lopAmount;

  console.log("\n" + "=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
  console.log(`Working days: ${workingDays} | Present(incl paid leave): ${presentDays} | Paid-leave days: ${leaveDays}`);
  console.log(`Absent head-count: ${absentDays} | Penalty units (Σ X): ${absentMultiplierUnits}`);
  console.log(`Per-day salary = ${SALARY} ÷ ${daysInMonth} = ${fmt(perDaySalary)}`);
  console.log(`LOP deduction = ${fmt(perDaySalary)} × ${absentMultiplierUnits} = ${fmt(lopAmount)}`);
  console.log(`NET SALARY = ${fmt(SALARY)} − ${fmt(lopAmount)} = ${fmt(net)}`);
}

// Helper: build a FULL month of attendance where the employee is Present on
// every working day (Mon-Sat), then override specific days with the given records.
// This mirrors real payroll where only 1-2 days are actually absent.
const allWorkingDaysPresent = () => {
  const recs = [];
  const from = new Date(YEAR, MONTH - 1, 1);
  const to = new Date(YEAR, MONTH, 0);
  const d = new Date(from);
  while (d <= to) {
    if (d.getDay() !== 0) { // not Sunday
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      recs.push({ day: key, status: "Present" });
    }
    d.setDate(d.getDate() + 1);
  }
  return recs;
};

// Override one day in the full-present month with a specific record
const withOverride = (overrides) => {
  const base = allWorkingDaysPresent();
  const map = {};
  base.forEach((r) => { map[r.day] = r; });
  overrides.forEach((o) => { map[o.day] = o; });
  return Object.values(map);
};

console.log(`\n########  ABSENT REVIEW VERIFY — SALARY ₹${SALARY}, April (${daysInMonth} days)  ########`);
console.log(`Per-day = ${fmt(perDaySalary)} | Weekly off = Sunday | Present every working day except noted`);

// 1) Auto free monthly paid leave — one day auto-marked Paid Leave, rest present
simulate(
  "1) AUTO FREE PAID LEAVE (1 day) → NO cut, full salary",
  withOverride([{ day: "2026-04-02", status: "Leave", leaveType: "Paid Leave", absentDeductionMultiplier: 0 }])
);

// 2) Excused = Paid Leave (admin marked) → no cut
simulate(
  "2) EXCUSED / Paid Leave (admin) → NO cut, full salary",
  withOverride([{ day: "2026-04-03", status: "Leave", leaveType: "Paid Leave", absentDeductionMultiplier: 0 }])
);

// 3) Unexcused with X=1 → 1 day deducted at 1×
simulate(
  "3) UNEXCUSED (Unpaid) 1 day X=1 → deduct 1 × per-day",
  withOverride([{ day: "2026-04-03", status: "Absent", leaveType: "Unpaid Leave", absentDeductionMultiplier: 1 }])
);

// 4) Unexcused with X=1.5
simulate(
  "4) UNEXCUSED (Unpaid) 1 day X=1.5 → deduct 1.5 × per-day",
  withOverride([{ day: "2026-04-03", status: "Absent", leaveType: "Unpaid Leave", absentDeductionMultiplier: 1.5 }])
);

// 5) Unexcused with X=2
simulate(
  "5) UNEXCUSED (Unpaid) 1 day X=2 → deduct 2 × per-day (double)",
  withOverride([{ day: "2026-04-03", status: "Absent", leaveType: "Unpaid Leave", absentDeductionMultiplier: 2 }])
);

// 6) Realistic combined: 1 auto-paid (free, no cut) + 1 unexcused X=1 + 1 unexcused X=2
simulate(
  "6) COMBINED: 1 auto-paid (free) + unexcused X=1 + unexcused X=2",
  withOverride([
    { day: "2026-04-02", status: "Leave", leaveType: "Paid Leave", absentDeductionMultiplier: 0 },  // free → no cut
    { day: "2026-04-06", status: "Absent", leaveType: "Unpaid Leave", absentDeductionMultiplier: 1 },
    { day: "2026-04-07", status: "Absent", leaveType: "Unpaid Leave", absentDeductionMultiplier: 2 },
  ])
);

// 7) Perfect attendance → no cut
simulate(
  "7) PERFECT ATTENDANCE → full salary",
  allWorkingDaysPresent()
);

console.log("\n########  IST REVIEW-WINDOW ASSERTIONS  ########");
const aug28 = new Date("2026-08-28T12:00:00+05:30");
const aug29 = new Date("2026-08-29T12:00:00+05:30");
const aug28Bounds = getAbsentReviewPolicyBounds(aug28);
const aug29Bounds = getAbsentReviewPolicyBounds(aug29);
const istDateKey = (date) => new Date(date.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
assert.equal(istDateKey(aug28Bounds.yesterdayEndUtc), "2026-08-27");
assert.equal(istDateKey(aug29Bounds.yesterdayEndUtc), "2026-08-28");
assert.equal(aug28Bounds.deadlinePassed, true);
assert.equal(
  isManualAbsentReviewAllowed(new Date("2026-06-30T00:00:00+05:30"), new Date("2026-08-10T12:00:00+05:30")),
  false
);
assert.equal(
  isManualAbsentReviewAllowed(new Date("2026-07-01T00:00:00+05:30"), new Date("2026-08-10T12:00:00+05:30")),
  true
);
assert.equal(
  isManualAbsentReviewAllowed(new Date("2026-07-31T00:00:00+05:30"), new Date("2026-08-15T23:59:59+05:30")),
  true
);
assert.equal(
  isManualAbsentReviewAllowed(new Date("2026-07-31T00:00:00+05:30"), new Date("2026-08-16T00:00:00+05:30")),
  false
);
assert.equal(
  isManualAbsentReviewAllowed(new Date("2026-08-01T00:00:00+05:30"), new Date("2026-08-16T00:00:00+05:30")),
  true
);
console.log("PASS: Aug 28/29 through-yesterday cutoff, full 15th access, 16th rollover, and current-month protection");

console.log("\n########  END  ########\n");
